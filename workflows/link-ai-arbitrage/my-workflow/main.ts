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
import { CurveStableSwapNG, PriorityPool, ArbVault } from '../contracts/abi';

// ---------- Config ----------

const configSchema = z.object({
	schedule: z.string(),
	chainName: z.string(),
	curvePoolAddress: z.string(),
	priorityPoolAddress: z.string(),
	arbVaultAddress: z.string().optional(), // Optional — vault may not be deployed yet
	stLINKIndex: z.number().default(1),     // Verified: coin[1] = stLINK
	linkIndex: z.number().default(0),       // Verified: coin[0] = LINK
	swapAmounts: z.array(z.string()).default(['100', '500', '1000', '5000']), // stLINK amounts to quote
	aiAnalysis: z.object({
		enabled: z.boolean().default(false),
		url: z.string(),
		secret: z.string().optional(),
	}).optional(),
	registry: z.object({
		address: z.string(),
		chainName: z.string().default('ethereum-testnet-sepolia'),
	}).optional(),
});

type Config = z.infer<typeof configSchema>;

// ---------- Types ----------

type PoolState = {
	linkBalance: string;
	stLINKBalance: string;
	linkBalanceFormatted: string;
	stLINKBalanceFormatted: string;
	imbalanceRatio: number; // LINK / stLINK — >1 means more LINK (stLINK at premium)
};

type PremiumQuote = {
	amountIn: string;
	amountOut: string;
	premiumBps: number;
	amountInFormatted: string;
	amountOutFormatted: string;
};

type VaultState = {
	totalStLINKHeld: string;
	totalLINKQueued: string;
	cycleCount: string;
	totalBoostWeight: string;
	totalCapitalAssets: string;
	minProfitBps: string;
};

type Signal = 'execute' | 'wait' | 'unprofitable' | 'pool_closed' | 'no_stlink';

type AIAnalysisResult = {
	recommendation: string;
	assessment: string;
	optimal_swap_size: string;
	risk_factors: string[];
	confidence: number;
	reasoning: string;
};

type OutputPayload = {
	signal: Signal;
	poolState: PoolState;
	premiumQuotes: PremiumQuote[];
	priorityPoolStatus: number; // 0=OPEN, 1=DRAINING, 2=CLOSED
	priorityPoolQueued: string;
	vaultState: VaultState | null;
	aiAnalysis: AIAnalysisResult | null;
	metadata: {
		curvePool: string;
		priorityPool: string;
		arbVault: string | null;
		timestamp: string;
	};
};

// ---------- Helpers ----------

function getEvmClient(chainName: string) {
	const net = getNetwork({
		chainFamily: 'evm',
		chainSelectorName: chainName,
		isTestnet: false,
	});
	if (!net) throw new Error(`Network not found: ${chainName}`);
	return new cre.capabilities.EVMClient(net.chainSelector.selector);
}

function callContract(
	runtime: Runtime<Config>,
	evmClient: InstanceType<typeof cre.capabilities.EVMClient>,
	to: string,
	callData: `0x${string}`,
): Uint8Array {
	const resp = evmClient
		.callContract(runtime, {
			call: encodeCallMsg({
				from: zeroAddress,
				to: to as Address,
				data: callData,
			}),
		})
		.result();
	return resp.data;
}

const safeJsonStringify = (obj: unknown) =>
	JSON.stringify(obj, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2);

// ---------- Readers ----------

function readPoolState(
	runtime: Runtime<Config>,
	evmClient: InstanceType<typeof cre.capabilities.EVMClient>,
): PoolState {
	const pool = runtime.config.curvePoolAddress;

	// Read balances
	const bal0Data = encodeFunctionData({ abi: CurveStableSwapNG, functionName: 'balances', args: [0n] });
	const bal0Raw = callContract(runtime, evmClient, pool, bal0Data);
	const linkBalance = decodeFunctionResult({ abi: CurveStableSwapNG, functionName: 'balances', data: bytesToHex(bal0Raw) }) as bigint;

	const bal1Data = encodeFunctionData({ abi: CurveStableSwapNG, functionName: 'balances', args: [1n] });
	const bal1Raw = callContract(runtime, evmClient, pool, bal1Data);
	const stLINKBalance = decodeFunctionResult({ abi: CurveStableSwapNG, functionName: 'balances', data: bytesToHex(bal1Raw) }) as bigint;

	const imbalanceRatio = stLINKBalance > 0n
		? Number(linkBalance * 10000n / stLINKBalance) / 10000
		: 0;

	runtime.log(
		`Pool state | LINK=${formatUnits(linkBalance, 18)} stLINK=${formatUnits(stLINKBalance, 18)} ratio=${imbalanceRatio.toFixed(4)}`,
	);

	return {
		linkBalance: linkBalance.toString(),
		stLINKBalance: stLINKBalance.toString(),
		linkBalanceFormatted: formatUnits(linkBalance, 18),
		stLINKBalanceFormatted: formatUnits(stLINKBalance, 18),
		imbalanceRatio,
	};
}

function readPremiumQuotes(
	runtime: Runtime<Config>,
	evmClient: InstanceType<typeof cre.capabilities.EVMClient>,
): PremiumQuote[] {
	const pool = runtime.config.curvePoolAddress;
	const stIdx = BigInt(runtime.config.stLINKIndex);
	const lIdx = BigInt(runtime.config.linkIndex);

	return runtime.config.swapAmounts.map((amountStr) => {
		const amountIn = BigInt(amountStr) * 10n ** 18n;

		const getDyData = encodeFunctionData({
			abi: CurveStableSwapNG,
			functionName: 'get_dy',
			args: [stIdx, lIdx, amountIn],
		});
		const getDyRaw = callContract(runtime, evmClient, pool, getDyData);
		const amountOut = decodeFunctionResult({
			abi: CurveStableSwapNG,
			functionName: 'get_dy',
			data: bytesToHex(getDyRaw),
		}) as bigint;

		const premiumBps = amountOut > amountIn
			? Number((amountOut - amountIn) * 10000n / amountIn)
			: 0;

		runtime.log(
			`Quote | ${amountStr} stLINK -> ${formatUnits(amountOut, 18)} LINK (${premiumBps} bps)`,
		);

		return {
			amountIn: amountIn.toString(),
			amountOut: amountOut.toString(),
			premiumBps,
			amountInFormatted: amountStr,
			amountOutFormatted: formatUnits(amountOut, 18),
		};
	});
}

function readPriorityPoolState(
	runtime: Runtime<Config>,
	evmClient: InstanceType<typeof cre.capabilities.EVMClient>,
): { status: number; totalQueued: string } {
	const pp = runtime.config.priorityPoolAddress;

	const statusData = encodeFunctionData({ abi: PriorityPool, functionName: 'poolStatus' });
	const statusRaw = callContract(runtime, evmClient, pp, statusData);
	const status = Number(decodeFunctionResult({ abi: PriorityPool, functionName: 'poolStatus', data: bytesToHex(statusRaw) }));

	const queuedData = encodeFunctionData({ abi: PriorityPool, functionName: 'totalQueued' });
	const queuedRaw = callContract(runtime, evmClient, pp, queuedData);
	const totalQueued = decodeFunctionResult({ abi: PriorityPool, functionName: 'totalQueued', data: bytesToHex(queuedRaw) }) as bigint;

	runtime.log(`Priority Pool | status=${status} queued=${formatUnits(totalQueued, 18)} LINK`);

	return { status, totalQueued: totalQueued.toString() };
}

function readVaultState(
	runtime: Runtime<Config>,
	evmClient: InstanceType<typeof cre.capabilities.EVMClient>,
): VaultState | null {
	const vaultAddr = runtime.config.arbVaultAddress;
	if (!vaultAddr) return null;

	const fields = [
		'totalStLINKHeld',
		'totalLINKQueued',
		'cycleCount',
		'totalBoostWeight',
		'totalCapitalAssets',
		'minProfitBps',
	] as const;

	const values: Record<string, string> = {};

	for (const field of fields) {
		const callData = encodeFunctionData({ abi: ArbVault, functionName: field });
		const raw = callContract(runtime, evmClient, vaultAddr, callData);
		const result = decodeFunctionResult({ abi: ArbVault, functionName: field, data: bytesToHex(raw) }) as bigint;
		values[field] = result.toString();
	}

	runtime.log(
		`Vault | stLINK=${formatUnits(BigInt(values.totalStLINKHeld), 18)} queued=${formatUnits(BigInt(values.totalLINKQueued), 18)} cycles=${values.cycleCount}`,
	);

	return values as unknown as VaultState;
}

// ---------- Signal Logic ----------

function computeSignal(
	premiumQuotes: PremiumQuote[],
	ppStatus: number,
	vaultState: VaultState | null,
): Signal {
	// PP must be open
	if (ppStatus !== 0) return 'pool_closed';

	// Check if vault has stLINK
	if (vaultState && BigInt(vaultState.totalStLINKHeld) === 0n) return 'no_stlink';

	// Use the first quote (smallest amount) for signal — conservative
	const bestQuote = premiumQuotes[0];
	if (!bestQuote || bestQuote.premiumBps <= 0) return 'unprofitable';

	// Check against vault's minProfitBps if available
	const minBps = vaultState ? Number(vaultState.minProfitBps) : 10;
	if (bestQuote.premiumBps < minBps) return 'wait';

	return 'execute';
}

// ---------- AI Analysis ----------

function fetchAIAnalysis(
	sendRequester: HTTPSendRequester,
	args: { url: string; secret: string; payload: OutputPayload },
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

	return JSON.parse(Buffer.from(resp.body).toString('utf-8')) as AIAnalysisResult;
}

// ---------- Handler ----------

function onCron(runtime: Runtime<Config>, _payload: CronPayload): string {
	const evmClient = getEvmClient(runtime.config.chainName);

	// Read all state
	const poolState = readPoolState(runtime, evmClient);
	const premiumQuotes = readPremiumQuotes(runtime, evmClient);
	const ppState = readPriorityPoolState(runtime, evmClient);
	const vaultState = readVaultState(runtime, evmClient);

	// Compute signal
	const signal = computeSignal(premiumQuotes, ppState.status, vaultState);

	const outputPayload: OutputPayload = {
		signal,
		poolState,
		premiumQuotes,
		priorityPoolStatus: ppState.status,
		priorityPoolQueued: ppState.totalQueued,
		vaultState,
		aiAnalysis: null,
		metadata: {
			curvePool: runtime.config.curvePoolAddress,
			priorityPool: runtime.config.priorityPoolAddress,
			arbVault: runtime.config.arbVaultAddress ?? null,
			timestamp: new Date().toISOString(),
		},
	};

	runtime.log(`SIGNAL: ${signal} | premium=${premiumQuotes[0]?.premiumBps ?? 0}bps`);

	// --- AI Analysis via Orbital Sentinel endpoint ---
	if (runtime.config.aiAnalysis?.enabled && runtime.config.aiAnalysis.url) {
		try {
			const http = new cre.capabilities.HTTPClient();
			const aiResult = http
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
				`AI analysis | rec=${aiResult.recommendation} confidence=${aiResult.confidence} size=${aiResult.optimal_swap_size} — "${aiResult.reasoning}"`,
			);
		} catch (e) {
			runtime.log(`AI analysis failed (degraded): ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	// --- On-chain write to SentinelRegistry (Sepolia) ---
	if (runtime.config.registry?.address && runtime.config.registry.address !== zeroAddress) {
		try {
			const net = getNetwork({
				chainFamily: 'evm',
				chainSelectorName: runtime.config.registry.chainName,
				isTestnet: true,
			});
			if (!net) throw new Error(`Network not found: ${runtime.config.registry.chainName}`);

			const sepoliaClient = new cre.capabilities.EVMClient(net.chainSelector.selector);
			const timestampUnix = BigInt(Math.floor(Date.now() / 1000));
			const premium = premiumQuotes[0]?.premiumBps ?? 0;

			const snapshotHash = keccak256(
				encodeAbiParameters(
					parseAbiParameters('uint256 ts, string wf, string signal, uint256 premium, uint256 linkBal'),
					[
						timestampUnix,
						'laa',
						signal,
						BigInt(premium),
						BigInt(poolState.linkBalance),
					],
				),
			);

			// Reuse SentinelRegistry ABI from sentinel-orbital
			const writeCallData = encodeFunctionData({
				abi: [
					{
						name: 'recordHealth',
						type: 'function',
						stateMutability: 'nonpayable',
						inputs: [
							{ name: 'snapshotHash', type: 'bytes32' },
							{ name: 'riskLevel', type: 'string' },
						],
						outputs: [],
					},
				] as const,
				functionName: 'recordHealth',
				args: [snapshotHash, `laa:${signal}`],
			});

			sepoliaClient
				.callContract(runtime, {
					call: encodeCallMsg({
						from: zeroAddress,
						to: runtime.config.registry.address as Address,
						data: writeCallData,
					}),
				})
				.result();

			runtime.log(`Registry write | laa:${signal} hash=${snapshotHash}`);
		} catch (e) {
			runtime.log(`Registry write failed (degraded): ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	runtime.log(`LAA_CRE_OUTPUT_JSON=${JSON.stringify(outputPayload)}`);
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
