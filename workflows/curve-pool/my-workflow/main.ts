import {
	bytesToHex,
	consensusIdenticalAggregation,
	cre,
	encodeCallMsg,
	getNetwork,
	Runner,
	type Runtime,
	type CronPayload,
} from '@chainlink/cre-sdk';
import {
	encodeFunctionData,
	decodeFunctionResult,
	formatUnits,
	keccak256,
	encodeAbiParameters,
	parseAbiParameters,
	type Address,
	zeroAddress,
} from 'viem';
import { z } from 'zod';
import { CurvePool } from '../contracts/abi/CurvePool';
import { CurveGauge } from '../contracts/abi/CurveGauge';
import { PriceFeedAggregator } from '../contracts/abi/PriceFeedAggregator';
import { SentinelRegistry } from '../contracts/abi/SentinelRegistry';

// ---------- Config ----------

const configSchema = z.object({
	schedule: z.string(),
	chainName: z.string(),
	contracts: z.object({
		curvePool: z.string(),
		linkUsdFeed: z.string(),
		gauge: z.string().optional(),
	}),
	thresholds: z.object({
		imbalancePctWarning: z.number().default(15),
		imbalancePctCritical: z.number().default(30),
	}),
	registry: z.object({
		address: z.string(),
		chainName: z.string().default('ethereum-sepolia'),
	}).optional(),
	webhook: z.object({
		enabled: z.boolean().default(false),
		url: z.string(),
		bearerToken: z.string().optional(),
	}).optional(),
});

type Config = z.infer<typeof configSchema>;

// ---------- Types ----------

type RiskLevel = 'ok' | 'warning' | 'critical';

type PoolSnapshot = {
	linkBalance: number;
	stlinkBalance: number;
	totalTokens: number;
	linkPct: number;
	stlinkPct: number;
	imbalancePct: number;
	amplificationFactor: number;
	virtualPrice: number;
	tvlUsd: number;
	risk: RiskLevel;
};

type GaugeReward = {
	token: string;
	ratePerSecond: string;
	periodFinish: number;
	isActive: boolean;
};

type GaugeSnapshot = {
	totalStaked: string;
	rewardCount: number;
	rewards: GaugeReward[];
	inflationRate: string;
};

type CurvePoolOutputPayload = {
	timestamp: string;
	chainName: string;
	pool: PoolSnapshot;
	prices: {
		linkUsd: number;
	};
	gauge?: GaugeSnapshot;
	overallRisk: RiskLevel;
	alerts: string[];
	registryTx?: string;
};

// ---------- Helpers ----------

function classifyRisk(value: number, warningThreshold: number, criticalThreshold: number): RiskLevel {
	if (value >= criticalThreshold) return 'critical';
	if (value >= warningThreshold) return 'warning';
	return 'ok';
}

function safeJsonStringify(obj: unknown): string {
	try {
		return JSON.stringify(obj);
	} catch {
		return '{"error":"serialization_failed"}';
	}
}

// ---------- Gauge reader ----------

function readGauge(
	runtime: Runtime<Config>,
	evmClient: InstanceType<typeof cre.capabilities.EVMClient>,
	gaugeAddress: Address,
): GaugeSnapshot {
	// totalSupply (LP tokens staked in gauge)
	const tsCallData = encodeFunctionData({ abi: CurveGauge, functionName: 'totalSupply' });
	const tsResp = evmClient.callContract(runtime, {
		call: encodeCallMsg({ from: zeroAddress, to: gaugeAddress, data: tsCallData }),
	}).result();
	const totalStaked = decodeFunctionResult({
		abi: CurveGauge, functionName: 'totalSupply', data: bytesToHex(tsResp.data),
	}) as bigint;

	// inflation_rate (CRV per second for this gauge)
	let inflationRate = 0n;
	try {
		const irCallData = encodeFunctionData({ abi: CurveGauge, functionName: 'inflation_rate' });
		const irResp = evmClient.callContract(runtime, {
			call: encodeCallMsg({ from: zeroAddress, to: gaugeAddress, data: irCallData }),
		}).result();
		inflationRate = decodeFunctionResult({
			abi: CurveGauge, functionName: 'inflation_rate', data: bytesToHex(irResp.data),
		}) as bigint;
	} catch (e) {
		runtime.log(`inflation_rate read failed (may not exist on this gauge type): ${e instanceof Error ? e.message : String(e)}`);
	}

	// reward_count
	const rcCallData = encodeFunctionData({ abi: CurveGauge, functionName: 'reward_count' });
	const rcResp = evmClient.callContract(runtime, {
		call: encodeCallMsg({ from: zeroAddress, to: gaugeAddress, data: rcCallData }),
	}).result();
	const rewardCount = Number(decodeFunctionResult({
		abi: CurveGauge, functionName: 'reward_count', data: bytesToHex(rcResp.data),
	}) as bigint);

	const rewards: GaugeReward[] = [];
	const now = Math.floor(Date.now() / 1000);

	for (let i = 0; i < rewardCount; i++) {
		// reward_tokens(i)
		const rtCallData = encodeFunctionData({ abi: CurveGauge, functionName: 'reward_tokens', args: [BigInt(i)] });
		const rtResp = evmClient.callContract(runtime, {
			call: encodeCallMsg({ from: zeroAddress, to: gaugeAddress, data: rtCallData }),
		}).result();
		const tokenAddr = decodeFunctionResult({
			abi: CurveGauge, functionName: 'reward_tokens', data: bytesToHex(rtResp.data),
		}) as string;

		// reward_data(token)
		const rdCallData = encodeFunctionData({ abi: CurveGauge, functionName: 'reward_data', args: [tokenAddr as Address] });
		const rdResp = evmClient.callContract(runtime, {
			call: encodeCallMsg({ from: zeroAddress, to: gaugeAddress, data: rdCallData }),
		}).result();
		const rewardData = decodeFunctionResult({
			abi: CurveGauge, functionName: 'reward_data', data: bytesToHex(rdResp.data),
		}) as readonly [string, bigint, bigint, bigint, bigint];

		const [_distributor, periodFinishBig, rateBig, _lastUpdate, _integral] = rewardData;
		const periodFinish = Number(periodFinishBig);
		const isActive = periodFinish > now && rateBig > 0n;

		rewards.push({
			token: tokenAddr,
			ratePerSecond: rateBig.toString(),
			periodFinish,
			isActive,
		});

		runtime.log(`Gauge reward #${i}: token=${tokenAddr} rate=${formatUnits(rateBig, 18)}/s active=${isActive} periodFinish=${periodFinish}`);
	}

	runtime.log(`Gauge | staked=${formatUnits(totalStaked, 18)} LP | ${rewardCount} reward tokens | CRV inflation=${formatUnits(inflationRate, 18)}/s`);

	return {
		totalStaked: totalStaked.toString(),
		rewardCount,
		rewards,
		inflationRate: inflationRate.toString(),
	};
}

// ---------- Workflow ----------

async function onCron(runtime: Runtime<Config>, _trigger: CronPayload) {
	runtime.log('Curve Pool Health workflow triggered');

	const net = getNetwork({ chainFamily: 'evm', chainSelectorName: runtime.config.chainName });
	if (!net) throw new Error(`Network not found: ${runtime.config.chainName}`);
	const evmClient = new cre.capabilities.EVMClient(net.chainSelector.selector);

	const poolAddress = runtime.config.contracts.curvePool as Address;
	const linkFeedAddress = runtime.config.contracts.linkUsdFeed as Address;

	// --- Read Curve pool balances ---
	// balances(0) = first token, balances(1) = second token
	// Pool: stLINK (index 0) / LINK (index 1) — verify by checking pool coins
	const bal0CallData = encodeFunctionData({ abi: CurvePool, functionName: 'balances', args: [0n] });
	const bal1CallData = encodeFunctionData({ abi: CurvePool, functionName: 'balances', args: [1n] });
	const ampCallData = encodeFunctionData({ abi: CurvePool, functionName: 'A' });
	const vpCallData = encodeFunctionData({ abi: CurvePool, functionName: 'get_virtual_price' });

	let r0Resp: any, r1Resp: any, rAResp: any, rVResp: any;
	try {
		r0Resp = evmClient.callContract(runtime, { call: encodeCallMsg({ from: zeroAddress, to: poolAddress, data: bal0CallData }) }).result();
		r1Resp = evmClient.callContract(runtime, { call: encodeCallMsg({ from: zeroAddress, to: poolAddress, data: bal1CallData }) }).result();
		rAResp = evmClient.callContract(runtime, { call: encodeCallMsg({ from: zeroAddress, to: poolAddress, data: ampCallData }) }).result();
		rVResp = evmClient.callContract(runtime, { call: encodeCallMsg({ from: zeroAddress, to: poolAddress, data: vpCallData }) }).result();
	} catch (e) {
		runtime.log(`Curve pool read failed: ${e instanceof Error ? e.message : String(e)}`);
		throw e;
	}

	const bal0 = decodeFunctionResult({ abi: CurvePool, functionName: 'balances', data: bytesToHex(r0Resp.data) });
	const bal1 = decodeFunctionResult({ abi: CurvePool, functionName: 'balances', data: bytesToHex(r1Resp.data) });
	const amp = decodeFunctionResult({ abi: CurvePool, functionName: 'A', data: bytesToHex(rAResp.data) });
	const vp = decodeFunctionResult({ abi: CurvePool, functionName: 'get_virtual_price', data: bytesToHex(rVResp.data) });

	// Both LINK and stLINK are 18 decimals
	const stlinkBalance = Number(formatUnits(bal0 as bigint, 18));
	const linkBalance = Number(formatUnits(bal1 as bigint, 18));
	const amplificationFactor = Number(amp);
	const virtualPrice = Number(formatUnits(vp as bigint, 18));

	const totalTokens = linkBalance + stlinkBalance;
	const linkPct = totalTokens > 0 ? (linkBalance / totalTokens) * 100 : 50;
	const stlinkPct = totalTokens > 0 ? (stlinkBalance / totalTokens) * 100 : 50;
	// Imbalance = absolute deviation from 50%
	const imbalancePct = Math.abs(50 - linkPct);

	runtime.log(`Pool: ${linkBalance.toFixed(0)} LINK (${linkPct.toFixed(1)}%) + ${stlinkBalance.toFixed(0)} stLINK (${stlinkPct.toFixed(1)}%) | Imbalance: ${imbalancePct.toFixed(1)}%`);

	// --- Read LINK/USD price ---
	const latestRoundCallData = encodeFunctionData({ abi: PriceFeedAggregator, functionName: 'latestRoundData' });
	const decimalsCallData = encodeFunctionData({ abi: PriceFeedAggregator, functionName: 'decimals' });

	let linkUsd = 0;
	try {
		const roundResp = evmClient.callContract(runtime, {
			call: encodeCallMsg({ from: zeroAddress, to: linkFeedAddress, data: latestRoundCallData }),
		}).result();
		const decResp = evmClient.callContract(runtime, {
			call: encodeCallMsg({ from: zeroAddress, to: linkFeedAddress, data: decimalsCallData }),
		}).result();

		const roundData = decodeFunctionResult({ abi: PriceFeedAggregator, functionName: 'latestRoundData', data: bytesToHex(roundResp.data) });
		const feedDecimals = decodeFunctionResult({ abi: PriceFeedAggregator, functionName: 'decimals', data: bytesToHex(decResp.data) });

		const answer = (roundData as readonly [bigint, bigint, bigint, bigint, bigint])[1];
		linkUsd = Number(formatUnits(answer, Number(feedDecimals)));
		runtime.log(`LINK/USD: $${linkUsd.toFixed(4)}`);
	} catch (e) {
		runtime.log(`LINK/USD feed read failed (degraded): ${e instanceof Error ? e.message : String(e)}`);
	}

	const tvlUsd = linkUsd > 0 ? totalTokens * linkUsd : 0;

	// --- Risk classification ---
	const risk = classifyRisk(
		imbalancePct,
		runtime.config.thresholds.imbalancePctWarning,
		runtime.config.thresholds.imbalancePctCritical,
	);

	const alerts: string[] = [];
	if (imbalancePct > runtime.config.thresholds.imbalancePctCritical) {
		alerts.push(`Pool heavily imbalanced: ${imbalancePct.toFixed(1)}% off center`);
	} else if (imbalancePct > runtime.config.thresholds.imbalancePctWarning) {
		alerts.push(`Pool imbalance elevated: ${imbalancePct.toFixed(1)}% off center`);
	}

	const poolSnapshot: PoolSnapshot = {
		linkBalance,
		stlinkBalance,
		totalTokens,
		linkPct,
		stlinkPct,
		imbalancePct,
		amplificationFactor,
		virtualPrice,
		tvlUsd,
		risk,
	};

	// --- Read gauge rewards (if configured) ---
	let gauge: GaugeSnapshot | undefined;
	if (runtime.config.contracts.gauge) {
		try {
			gauge = readGauge(runtime, evmClient, runtime.config.contracts.gauge as Address);
		} catch (e) {
			runtime.log(`Gauge read failed (degraded): ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	const outputPayload: CurvePoolOutputPayload = {
		timestamp: new Date().toISOString(),
		chainName: runtime.config.chainName,
		pool: poolSnapshot,
		prices: { linkUsd },
		gauge,
		overallRisk: risk,
		alerts,
	};

	// --- On-chain write to SentinelRegistry (Sepolia) ---
	if (runtime.config.registry?.address && runtime.config.registry.address !== '0x0000000000000000000000000000000000000000') {
		try {
			const sepoliaNet = getNetwork({ chainFamily: 'evm', chainSelectorName: runtime.config.registry.chainName, isTestnet: true });
			if (!sepoliaNet) throw new Error(`Network not found: ${runtime.config.registry.chainName}`);
			const sepoliaClient = new cre.capabilities.EVMClient(sepoliaNet.chainSelector.selector);

			const timestampUnix = BigInt(Math.floor(Date.now() / 1000));
			const imbalanceScaled = BigInt(Math.round(imbalancePct * 100));
			const tvlScaled = BigInt(Math.round(tvlUsd));
			const snapshotHash = keccak256(
				encodeAbiParameters(
					parseAbiParameters('uint256 ts, string wf, string risk, uint256 imbalance, uint256 tvl'),
					[timestampUnix, 'curve', risk, imbalanceScaled, tvlScaled],
				),
			);

			const writeCallData = encodeFunctionData({
				abi: SentinelRegistry,
				functionName: 'recordHealth',
				args: [snapshotHash, `curve:${risk}`],
			});

			const writeResp = sepoliaClient.callContract(runtime, {
				call: encodeCallMsg({ from: zeroAddress, to: runtime.config.registry.address as Address, data: writeCallData }),
			}).result();

			runtime.log(`Registry write | curve:${risk} hash=${snapshotHash}`);
			outputPayload.registryTx = `hash=${snapshotHash} registry=${runtime.config.registry.address}`;
		} catch (e) {
			runtime.log(`Registry write failed (degraded): ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	// --- Webhook ---
	if (runtime.config.webhook?.enabled && runtime.config.webhook.url) {
		try {
			const http = new cre.capabilities.HTTPClient();
			http
				.sendRequest(
					runtime,
					(r: Runtime<Config>, args: { url: string; bearerToken?: string; payload: unknown }) => {
						return r.fetch(args.url, {
							method: 'POST',
							headers: {
								'Content-Type': 'application/json',
								...(args.bearerToken ? { Authorization: `Bearer ${args.bearerToken}` } : {}),
							},
							body: JSON.stringify(args.payload),
						});
					},
					consensusIdenticalAggregation<string>(),
				)({
					url: runtime.config.webhook.url,
					bearerToken: runtime.config.webhook.bearerToken,
					payload: outputPayload,
				})
				.result();
			runtime.log('Webhook delivered');
		} catch (e) {
			runtime.log(`Webhook delivery failed: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	runtime.log(`CURVE_POOL_OUTPUT_JSON=${JSON.stringify(outputPayload)}`);

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
