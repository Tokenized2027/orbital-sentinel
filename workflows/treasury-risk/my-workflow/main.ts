import {
	bytesToHex,
	consensusIdenticalAggregation,
	cre,
	encodeCallMsg,
	getNetwork,
	Runner,
	type HTTPSendRequester,
	type Runtime,
	type CronPayload,
} from '@chainlink/cre-sdk';
import { encodeFunctionData, decodeFunctionResult, formatUnits, keccak256, encodeAbiParameters, parseAbiParameters, type Address, zeroAddress } from 'viem';
import { z } from 'zod';
import { StakingPool } from '../contracts/abi/StakingPool';
import { RewardVault } from '../contracts/abi/RewardVault';
import { ERC20 } from '../contracts/abi/ERC20';
import { SentinelRegistry } from '../contracts/abi/SentinelRegistry';

// ---------- Config ----------

const configSchema = z.object({
	// e.g. "0 */15 * * * *" (every 15 minutes, at second 0)
	schedule: z.string(),
	// e.g. "ethereum-mainnet"
	chainName: z.string(),
	// contract addresses
	contracts: z.object({
		communityPool: z.string(),
		operatorPool: z.string(),
		rewardVault: z.string(),
		linkToken: z.string(),
	}),
	// SDL Analytics API
	analyticsApi: z.object({
		enabled: z.boolean().default(true),
		baseUrl: z.string(),
	}).optional(),
	// AI analysis via Orbital Sentinel endpoint
	aiAnalysis: z.object({
		enabled: z.boolean().default(false),
		url: z.string(),
		secret: z.string().optional(),
	}).optional(),
	// On-chain registry write (Sepolia)
	registry: z.object({
		address: z.string(),
		chainName: z.string().default('ethereum-sepolia'),
	}).optional(),
	// risk thresholds
	thresholds: z.object({
		communityPoolFillPctWarning: z.number().default(95),
		communityPoolFillPctCritical: z.number().default(99),
		morphoUtilizationWarning: z.number().default(85),
		morphoUtilizationCritical: z.number().default(95),
		rewardRunwayDaysWarning: z.number().default(30),
		rewardRunwayDaysCritical: z.number().default(7),
		queueLinkWarning: z.number().default(50000),
		queueLinkCritical: z.number().default(200000),
	}),
	// optional webhook
	webhook: z.object({
		enabled: z.boolean().default(false),
		url: z.string(),
		bearerToken: z.string().optional(),
	}).optional(),
});

type Config = z.infer<typeof configSchema>;

// ---------- Types ----------

type RiskLevel = 'ok' | 'warning' | 'critical';

type PoolMetrics = {
	staked: string;
	cap: string;
	fillPct: number;
	risk: RiskLevel;
};

type AIAnalysisResult = {
	assessment: string;
	risk_label: string;
	action_items: string[];
	confidence: number;
};

type TreasuryOutputPayload = {
	timestamp: string;
	chainName: string;
	staking: {
		community: PoolMetrics;
		operator: PoolMetrics;
	};
	rewards: {
		vaultBalance: string;
		emissionPerDay: string;
		runwayDays: number;
		risk: RiskLevel;
	};
	morpho: {
		utilization: number | null;
		vaultTvlUsd: number | null;
		risk: RiskLevel;
	};
	queue: {
		queueLink: number | null;
		risk: RiskLevel;
	};
	overallRisk: RiskLevel;
	alerts: string[];
	aiAnalysis?: AIAnalysisResult | null;
	registryTx?: string | null;
};

// ---------- Helpers ----------

function getEvmClient(chainName: string, isTestnet = false) {
	const net = getNetwork({
		chainFamily: 'evm',
		chainSelectorName: chainName,
		isTestnet,
	});
	if (!net) throw new Error(`Network not found for chain name: ${chainName}`);
	return new cre.capabilities.EVMClient(net.chainSelector.selector);
}

// Safely stringify BigInt
const safeJsonStringify = (obj: unknown) =>
	JSON.stringify(obj, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2);

function toNumberOrNull(value: unknown): number | null {
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

function classifyRisk(value: number, warningThreshold: number, criticalThreshold: number): RiskLevel {
	if (value >= criticalThreshold) return 'critical';
	if (value >= warningThreshold) return 'warning';
	return 'ok';
}

function classifyRiskBelow(value: number, warningThreshold: number, criticalThreshold: number): RiskLevel {
	if (value <= criticalThreshold) return 'critical';
	if (value <= warningThreshold) return 'warning';
	return 'ok';
}

function worstRisk(...levels: RiskLevel[]): RiskLevel {
	if (levels.includes('critical')) return 'critical';
	if (levels.includes('warning')) return 'warning';
	return 'ok';
}

// ---------- On-Chain Readers ----------

function readPoolMetrics(
	runtime: Runtime<Config>,
	evmClient: InstanceType<typeof cre.capabilities.EVMClient>,
	poolAddress: string,
	poolName: string,
	thresholds: Config['thresholds'],
): PoolMetrics {
	// getTotalPrincipal() — Staking v0.2 uses get-prefixed getters
	const tpCallData = encodeFunctionData({
		abi: StakingPool,
		functionName: 'getTotalPrincipal',
	});
	const tpResp = evmClient
		.callContract(runtime, {
			call: encodeCallMsg({
				from: zeroAddress,
				to: poolAddress as Address,
				data: tpCallData,
			}),
		})
		.result();
	const totalPrincipal = decodeFunctionResult({
		abi: StakingPool,
		functionName: 'getTotalPrincipal',
		data: bytesToHex(tpResp.data),
	}) as bigint;

	// getMaxPoolSize()
	const mpCallData = encodeFunctionData({
		abi: StakingPool,
		functionName: 'getMaxPoolSize',
	});
	const mpResp = evmClient
		.callContract(runtime, {
			call: encodeCallMsg({
				from: zeroAddress,
				to: poolAddress as Address,
				data: mpCallData,
			}),
		})
		.result();
	const maxPoolSize = decodeFunctionResult({
		abi: StakingPool,
		functionName: 'getMaxPoolSize',
		data: bytesToHex(mpResp.data),
	}) as bigint;

	const staked = formatUnits(totalPrincipal, 18);
	const cap = formatUnits(maxPoolSize, 18);
	const fillPct = maxPoolSize > 0n
		? Number((totalPrincipal * 10000n) / maxPoolSize) / 100
		: 0;

	const isCommunity = poolName.toLowerCase().includes('community');
	const risk = classifyRisk(
		fillPct,
		isCommunity ? thresholds.communityPoolFillPctWarning : 95,
		isCommunity ? thresholds.communityPoolFillPctCritical : 99,
	);

	runtime.log(
		`Pool read | ${poolName} address=${poolAddress} staked=${staked} cap=${cap} fillPct=${fillPct.toFixed(2)}% risk=${risk}`,
	);

	return { staked, cap, fillPct, risk };
}

type RewardBucketData = {
	emissionRate: bigint;
	rewardDurationEndsAt: bigint;
	vestedRewardPerToken: bigint;
};

function readRewardMetrics(
	runtime: Runtime<Config>,
	evmClient: InstanceType<typeof cre.capabilities.EVMClient>,
	contracts: Config['contracts'],
	thresholds: Config['thresholds'],
): { vaultBalance: string; emissionPerDay: string; runwayDays: number; risk: RiskLevel } {
	// getRewardBuckets()
	const rbCallData = encodeFunctionData({
		abi: RewardVault,
		functionName: 'getRewardBuckets',
	});
	const rbResp = evmClient
		.callContract(runtime, {
			call: encodeCallMsg({
				from: zeroAddress,
				to: contracts.rewardVault as Address,
				data: rbCallData,
			}),
		})
		.result();
	const bucketsRaw = decodeFunctionResult({
		abi: RewardVault,
		functionName: 'getRewardBuckets',
		data: bytesToHex(rbResp.data),
	}) as unknown as Record<string, RewardBucketData> & RewardBucketData[];

	// viem returns named tuple as object with named properties
	const operatorBase = bucketsRaw.operatorBase ?? bucketsRaw[0];
	const communityBase = bucketsRaw.communityBase ?? bucketsRaw[1];
	const operatorDelegated = bucketsRaw.operatorDelegated ?? bucketsRaw[2];

	// balanceOf(rewardVault) on LINK token
	const balCallData = encodeFunctionData({
		abi: ERC20,
		functionName: 'balanceOf',
		args: [contracts.rewardVault as Address],
	});
	const balResp = evmClient
		.callContract(runtime, {
			call: encodeCallMsg({
				from: zeroAddress,
				to: contracts.linkToken as Address,
				data: balCallData,
			}),
		})
		.result();
	const vaultBalanceRaw = decodeFunctionResult({
		abi: ERC20,
		functionName: 'balanceOf',
		data: bytesToHex(balResp.data),
	}) as bigint;

	const vaultBalance = formatUnits(vaultBalanceRaw, 18);

	// Emission rates are in LINK/sec (18 decimals)
	const totalEmissionPerSec =
		operatorBase.emissionRate + communityBase.emissionRate + operatorDelegated.emissionRate;
	const totalEmissionPerDay = totalEmissionPerSec * 86400n;
	const emissionPerDay = formatUnits(totalEmissionPerDay, 18);

	// Runway: vaultBalance / emissionPerDay
	let runwayDays = 0;
	if (totalEmissionPerDay > 0n) {
		// Use bigint division for precision: (balance * 100) / emissionPerDay / 100
		runwayDays = Number((vaultBalanceRaw * 100n) / totalEmissionPerDay) / 100;
	}

	const risk = classifyRiskBelow(
		runwayDays,
		thresholds.rewardRunwayDaysWarning,
		thresholds.rewardRunwayDaysCritical,
	);

	runtime.log(
		`Rewards read | vaultBalance=${vaultBalance} LINK emissionPerDay=${emissionPerDay} LINK runwayDays=${runwayDays.toFixed(1)} risk=${risk}`,
	);

	return { vaultBalance, emissionPerDay, runwayDays, risk };
}

// ---------- Analytics API Readers ----------

type DefiApiResult = {
	morphoUtilization: number; // -1 = unavailable
	vaultTvlUsd: number;       // -1 = unavailable
};

function fetchDefiData(
	sendRequester: HTTPSendRequester,
	args: { url: string },
): DefiApiResult {
	const resp = sendRequester
		.sendRequest({
			method: 'GET',
			url: args.url,
			headers: { Accept: 'application/json' },
		})
		.result();

	if (resp.statusCode < 200 || resp.statusCode >= 300) {
		throw new Error(`defi API request failed with status=${resp.statusCode}`);
	}

	const decoded = JSON.parse(Buffer.from(resp.body).toString('utf-8')) as Record<string, unknown>;
	const morpho = (decoded.morpho as Record<string, unknown>) || {};

	const utilization = toNumberOrNull(morpho.utilization ?? morpho.utilizationRate) ?? -1;
	const vaultTvlUsd = toNumberOrNull(morpho.vaultTvlUsd ?? morpho.tvlUsd ?? morpho.vault_tvl_usd) ?? -1;

	return { morphoUtilization: utilization, vaultTvlUsd };
}

type OnchainApiResult = {
	queueLink: number | null;
};

function fetchOnchainData(
	sendRequester: HTTPSendRequester,
	args: { url: string },
): OnchainApiResult {
	const resp = sendRequester
		.sendRequest({
			method: 'GET',
			url: args.url,
			headers: { Accept: 'application/json' },
		})
		.result();

	if (resp.statusCode < 200 || resp.statusCode >= 300) {
		throw new Error(`onchain API request failed with status=${resp.statusCode}`);
	}

	const decoded = JSON.parse(Buffer.from(resp.body).toString('utf-8')) as Record<string, unknown>;
	const queueLink = toNumberOrNull(decoded.priorityPoolLink ?? decoded.priority_pool_link);

	return { queueLink };
}

// ---------- AI Analysis ----------

function fetchAIAnalysis(
	sendRequester: HTTPSendRequester,
	args: { url: string; secret: string; payload: TreasuryOutputPayload },
): AIAnalysisResult {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
	};
	if (args.secret) headers['X-CRE-Secret'] = args.secret;

	const resp = sendRequester
		.sendRequest({
			method: 'POST',
			url: args.url,
			headers,
			body: Buffer.from(JSON.stringify(args.payload)).toString('base64'),
		})
		.result();

	if (resp.statusCode < 200 || resp.statusCode >= 300) {
		throw new Error(`AI analyze request failed with status=${resp.statusCode}`);
	}

	const decoded = JSON.parse(
		Buffer.from(resp.body).toString('utf-8'),
	) as AIAnalysisResult;

	return decoded;
}

// ---------- Webhook ----------

function postWebhook(sendRequester: HTTPSendRequester, args: {
	url: string;
	bearerToken?: string;
	payload: TreasuryOutputPayload;
}): string {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
	};
	if (args.bearerToken) headers.Authorization = `Bearer ${args.bearerToken}`;

	const resp = sendRequester
		.sendRequest({
			method: 'POST',
			url: args.url,
			headers,
			body: Buffer.from(JSON.stringify(args.payload)).toString('base64'),
		})
		.result();

	if (resp.statusCode < 200 || resp.statusCode >= 300) {
		throw new Error(`webhook POST failed with status=${resp.statusCode}`);
	}

	return `status=${resp.statusCode}`;
}

// ---------- Handler ----------

function onCron(runtime: Runtime<Config>, _payload: CronPayload): string {
	const evmClient = getEvmClient(runtime.config.chainName);
	const { contracts, thresholds } = runtime.config;
	const alerts: string[] = [];

	// --- On-chain: staking pools ---
	const community = readPoolMetrics(runtime, evmClient, contracts.communityPool, 'Community Pool', thresholds);
	const operator = readPoolMetrics(runtime, evmClient, contracts.operatorPool, 'Operator Pool', thresholds);

	if (community.risk === 'warning') alerts.push(`Community pool fill at ${community.fillPct.toFixed(1)}% (warning threshold: ${thresholds.communityPoolFillPctWarning}%)`);
	if (community.risk === 'critical') alerts.push(`Community pool fill at ${community.fillPct.toFixed(1)}% (CRITICAL threshold: ${thresholds.communityPoolFillPctCritical}%)`);
	if (operator.risk === 'warning') alerts.push(`Operator pool fill at ${operator.fillPct.toFixed(1)}% (warning)`);
	if (operator.risk === 'critical') alerts.push(`Operator pool fill at ${operator.fillPct.toFixed(1)}% (CRITICAL)`);

	// --- On-chain: reward vault ---
	const rewards = readRewardMetrics(runtime, evmClient, contracts, thresholds);

	if (rewards.risk === 'warning') alerts.push(`Reward runway at ${rewards.runwayDays.toFixed(0)} days (warning threshold: ${thresholds.rewardRunwayDaysWarning}d)`);
	if (rewards.risk === 'critical') alerts.push(`Reward runway at ${rewards.runwayDays.toFixed(0)} days (CRITICAL threshold: ${thresholds.rewardRunwayDaysCritical}d)`);

	// --- Analytics API: Morpho + queue ---
	let morphoUtilization: number | null = null;
	let vaultTvlUsd: number | null = null;
	let morphoRisk: RiskLevel = 'ok';

	let queueLink: number | null = null;
	let queueRisk: RiskLevel = 'ok';

	if (runtime.config.analyticsApi?.enabled && runtime.config.analyticsApi.baseUrl) {
		const baseUrl = runtime.config.analyticsApi.baseUrl.replace(/\/$/, '');
		const http = new cre.capabilities.HTTPClient();

		// Fetch /api/defi
		try {
			const defiResult = http
				.sendRequest(
					runtime,
					fetchDefiData,
					consensusIdenticalAggregation<DefiApiResult>(),
				)({ url: `${baseUrl}/api/defi` })
				.result();

			morphoUtilization = defiResult.morphoUtilization >= 0 ? defiResult.morphoUtilization : null;
			vaultTvlUsd = defiResult.vaultTvlUsd >= 0 ? defiResult.vaultTvlUsd : null;

			if (morphoUtilization != null) {
				morphoRisk = classifyRisk(morphoUtilization, thresholds.morphoUtilizationWarning, thresholds.morphoUtilizationCritical);
				if (morphoRisk === 'warning') alerts.push(`Morpho utilization at ${morphoUtilization.toFixed(1)}% (warning threshold: ${thresholds.morphoUtilizationWarning}%)`);
				if (morphoRisk === 'critical') alerts.push(`Morpho utilization at ${morphoUtilization.toFixed(1)}% (CRITICAL threshold: ${thresholds.morphoUtilizationCritical}%)`);
			}

			runtime.log(`Defi API read | morphoUtilization=${morphoUtilization} vaultTvlUsd=${vaultTvlUsd} risk=${morphoRisk}`);
		} catch (e) {
			runtime.log(`Defi API fetch failed (degraded): ${e instanceof Error ? e.message : String(e)}`);
			alerts.push('Analytics API /api/defi unreachable — Morpho data degraded');
		}

		// Fetch /api/onchain
		try {
			const onchainResult = http
				.sendRequest(
					runtime,
					fetchOnchainData,
					consensusIdenticalAggregation<OnchainApiResult>(),
				)({ url: `${baseUrl}/api/onchain` })
				.result();

			queueLink = onchainResult.queueLink;

			if (queueLink != null) {
				queueRisk = classifyRisk(queueLink, thresholds.queueLinkWarning, thresholds.queueLinkCritical);
				if (queueRisk === 'warning') alerts.push(`Priority pool queue at ${queueLink.toLocaleString()} LINK (warning threshold: ${thresholds.queueLinkWarning.toLocaleString()})`);
				if (queueRisk === 'critical') alerts.push(`Priority pool queue at ${queueLink.toLocaleString()} LINK (CRITICAL threshold: ${thresholds.queueLinkCritical.toLocaleString()})`);
			}

			runtime.log(`Onchain API read | queueLink=${queueLink} risk=${queueRisk}`);
		} catch (e) {
			runtime.log(`Onchain API fetch failed (degraded): ${e instanceof Error ? e.message : String(e)}`);
			alerts.push('Analytics API /api/onchain unreachable — queue data degraded');
		}
	} else {
		runtime.log('Analytics API disabled — skipping Morpho + queue reads');
	}

	// --- Compute overall risk ---
	const overallRisk = worstRisk(community.risk, operator.risk, rewards.risk, morphoRisk, queueRisk);

	const outputPayload: TreasuryOutputPayload = {
		timestamp: new Date().toISOString(),
		chainName: runtime.config.chainName,
		staking: {
			community,
			operator,
		},
		rewards,
		morpho: {
			utilization: morphoUtilization,
			vaultTvlUsd,
			risk: morphoRisk,
		},
		queue: {
			queueLink,
			risk: queueRisk,
		},
		overallRisk,
		alerts,
		aiAnalysis: null,
		registryTx: null,
	};

	// --- Step 3: AI Analysis via Orbital Sentinel ---
	let aiResult: AIAnalysisResult | null = null;
	if (runtime.config.aiAnalysis?.enabled && runtime.config.aiAnalysis.url) {
		try {
			const http = new cre.capabilities.HTTPClient();
			aiResult = http
				.sendRequest(
					runtime,
					fetchAIAnalysis,
					consensusIdenticalAggregation<AIAnalysisResult>(),
				)({
					url: runtime.config.aiAnalysis.url,
					secret: runtime.config.aiAnalysis.secret ?? '',
					payload: outputPayload,
				})
				.result();

			outputPayload.aiAnalysis = aiResult;
			runtime.log(
				`AI analysis | risk_label=${aiResult.risk_label} confidence=${aiResult.confidence} assessment="${aiResult.assessment.slice(0, 80)}..."`,
			);
		} catch (e) {
			runtime.log(`AI analysis failed (degraded): ${e instanceof Error ? e.message : String(e)}`);
		}
	} else {
		runtime.log('AI analysis disabled or not configured — skipping');
	}

	// --- Step 4: On-chain write to SentinelRegistry (Sepolia) ---
	if (runtime.config.registry?.address && runtime.config.registry.address !== '0x0000000000000000000000000000000000000000') {
		try {
			const sepoliaClient = getEvmClient(runtime.config.registry.chainName, true);

			// Compute snapshot hash: keccak256(abi.encode(timestamp_unix, overallRisk, assessment_snippet))
			const timestampUnix = BigInt(Math.floor(Date.now() / 1000));
			const assessmentSnippet = aiResult?.assessment.slice(0, 32) ?? overallRisk;
			const snapshotHash = keccak256(
				encodeAbiParameters(
					parseAbiParameters('uint256 ts, string risk, string assessment'),
					[timestampUnix, overallRisk, assessmentSnippet],
				),
			);

			const writeCallData = encodeFunctionData({
				abi: SentinelRegistry,
				functionName: 'recordHealth',
				args: [snapshotHash, `treasury:${overallRisk}`],
			});

			const writeTxResp = sepoliaClient
				.callContract(runtime, {
					call: encodeCallMsg({
						from: zeroAddress,
						to: runtime.config.registry.address as Address,
						data: writeCallData,
					}),
				})
				.result();

			const txRef = `hash=${snapshotHash} registry=${runtime.config.registry.address}`;
			outputPayload.registryTx = txRef;
			runtime.log(`Registry write | ${txRef} respLen=${writeTxResp.data.length}`);
		} catch (e) {
			runtime.log(`Registry write failed (degraded): ${e instanceof Error ? e.message : String(e)}`);
		}
	} else {
		runtime.log('Registry not configured — skipping on-chain write');
	}

	// --- Optional webhook ---
	if (runtime.config.webhook?.enabled && runtime.config.webhook.url) {
		try {
			const http = new cre.capabilities.HTTPClient();
			const webhookResult = http
				.sendRequest(
					runtime,
					postWebhook,
					consensusIdenticalAggregation<string>(),
				)({
					url: runtime.config.webhook.url,
					bearerToken: runtime.config.webhook.bearerToken,
					payload: outputPayload,
				})
				.result();
			runtime.log(`Webhook delivered | ${webhookResult}`);
		} catch (e) {
			runtime.log(`Webhook delivery failed: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	// Emit compact marker for run_snapshot parser reliability.
	runtime.log(`SDL_CRE_OUTPUT_JSON=${JSON.stringify(outputPayload)}`);

	return safeJsonStringify(outputPayload);
}

// ---------- Init ----------

function initWorkflow(config: Config) {
	const cron = new cre.capabilities.CronCapability();
	return [
		cre.handler(
			cron.trigger({ schedule: config.schedule }),
			onCron,
		),
	];
}

export async function main() {
	const runner = await Runner.newRunner<Config>({ configSchema });
	await runner.run(initWorkflow);
}

main();
