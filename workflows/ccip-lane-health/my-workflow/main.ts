import {
	bytesToHex,
	cre,
	encodeCallMsg,
	getNetwork,
	Runner,
	type Runtime,
	type CronPayload,
} from '@chainlink/cre-sdk';
import { encodeFunctionData, decodeFunctionResult, formatUnits, type Address, zeroAddress } from 'viem';
import { z } from 'zod';
import { CCIPRouter, CCIPOnRamp, LockReleaseTokenPool } from '../contracts/abi';

// ---------- Config ----------

const laneConfigSchema = z.object({
	destChainName: z.string(),
	destChainSelector: z.string(), // uint64 as string (avoids JSON precision issues)
});

const configSchema = z.object({
	schedule: z.string(),
	chainName: z.string(),
	routerAddress: z.string(),
	linkTokenPoolAddress: z.string(),
	lanes: z.array(laneConfigSchema).min(1),
	thresholds: z.object({
		rateLimiterCapacityPctWarning: z.number().default(20),
		rateLimiterCapacityPctCritical: z.number().default(5),
	}).default({}),
});

type Config = z.infer<typeof configSchema>;
type RiskLevel = 'ok' | 'warning' | 'critical';

type RateLimiterState = {
	tokens: string;
	isEnabled: boolean;
	capacity: string;
	rate: string;
	usedPct: number;
	risk: RiskLevel;
};

type LaneResult = {
	destChainName: string;
	destChainSelector: string;
	onRampAddress: string;
	configured: boolean;
	paused: boolean | null;
	status: 'ok' | 'paused' | 'not_configured';
	risk: RiskLevel;
	rateLimiter: RateLimiterState | null;
};

type OutputPayload = {
	sourceChain: string;
	routerAddress: string;
	linkTokenPoolAddress: string;
	lanes: LaneResult[];
	allLanesOk: boolean;
	pausedLanes: string[];
	unconfiguredLanes: string[];
	overallRisk: RiskLevel;
	checkedAt: string;
	metadata: {
		laneCount: number;
		okCount: number;
		pausedCount: number;
		unconfiguredCount: number;
		rateLimitedLanes: number;
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

const safeJsonStringify = (obj: unknown) =>
	JSON.stringify(obj, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2);

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

function worstRisk(...levels: RiskLevel[]): RiskLevel {
	if (levels.includes('critical')) return 'critical';
	if (levels.includes('warning')) return 'warning';
	return 'ok';
}

// ---------- Readers ----------

function readRateLimiterState(
	runtime: Runtime<Config>,
	evmClient: InstanceType<typeof cre.capabilities.EVMClient>,
	poolAddress: string,
	destChainSelector: string,
	thresholds: Config['thresholds'],
): RateLimiterState | null {
	try {
		const callData = encodeFunctionData({
			abi: LockReleaseTokenPool,
			functionName: 'getCurrentOutboundRateLimiterState',
			args: [BigInt(destChainSelector)],
		});
		const raw = callContract(runtime, evmClient, poolAddress, callData);
		const result = decodeFunctionResult({
			abi: LockReleaseTokenPool,
			functionName: 'getCurrentOutboundRateLimiterState',
			data: bytesToHex(raw),
		}) as { tokens: bigint; lastUpdated: number; isEnabled: boolean; capacity: bigint; rate: bigint };

		if (!result.isEnabled) {
			return {
				tokens: '0',
				isEnabled: false,
				capacity: '0',
				rate: '0',
				usedPct: 0,
				risk: 'ok',
			};
		}

		const tokens = formatUnits(result.tokens, 18);
		const capacity = formatUnits(result.capacity, 18);
		const rate = formatUnits(result.rate, 18);
		const capacityNum = Number(capacity);
		const tokensNum = Number(tokens);
		const remainingPct = capacityNum > 0 ? (tokensNum / capacityNum) * 100 : 100;

		let risk: RiskLevel = 'ok';
		if (remainingPct < thresholds.rateLimiterCapacityPctCritical) risk = 'critical';
		else if (remainingPct < thresholds.rateLimiterCapacityPctWarning) risk = 'warning';

		return {
			tokens,
			isEnabled: true,
			capacity,
			rate,
			usedPct: Math.round((100 - remainingPct) * 100) / 100,
			risk,
		};
	} catch (e) {
		runtime.log(`Rate limiter read failed for selector ${destChainSelector}: ${e instanceof Error ? e.message : String(e)}`);
		return null;
	}
}

function checkLane(
	runtime: Runtime<Config>,
	evmClient: InstanceType<typeof cre.capabilities.EVMClient>,
	routerAddress: string,
	poolAddress: string,
	lane: Config['lanes'][number],
	thresholds: Config['thresholds'],
): LaneResult {
	const selector = BigInt(lane.destChainSelector);

	const onRampCallData = encodeFunctionData({
		abi: CCIPRouter,
		functionName: 'getOnRamp',
		args: [selector],
	});
	const onRampRaw = callContract(runtime, evmClient, routerAddress, onRampCallData);
	const onRampAddress = decodeFunctionResult({
		abi: CCIPRouter,
		functionName: 'getOnRamp',
		data: bytesToHex(onRampRaw),
	}) as Address;

	const configured = onRampAddress !== zeroAddress;

	if (!configured) {
		runtime.log(
			`Lane ${lane.destChainName} (${lane.destChainSelector}): not_configured (onRamp=address(0))`,
		);
		return {
			destChainName: lane.destChainName,
			destChainSelector: lane.destChainSelector,
			onRampAddress: zeroAddress,
			configured: false,
			paused: null,
			status: 'not_configured',
			risk: 'critical',
			rateLimiter: null,
		};
	}

	let paused: boolean | null = null;
	try {
		const pausedCallData = encodeFunctionData({ abi: CCIPOnRamp, functionName: 'paused' });
		const pausedRaw = callContract(runtime, evmClient, onRampAddress, pausedCallData);
		paused = decodeFunctionResult({
			abi: CCIPOnRamp,
			functionName: 'paused',
			data: bytesToHex(pausedRaw),
		}) as boolean;
	} catch (e) {
		runtime.log(`Lane ${lane.destChainName}: paused() call failed (degraded): ${e instanceof Error ? e.message : String(e)}`);
	}

	const rateLimiter = readRateLimiterState(runtime, evmClient, poolAddress, lane.destChainSelector, thresholds);

	const status = paused === true ? 'paused' : 'ok';
	const laneRisk: RiskLevel = paused === true ? 'critical' : 'ok';
	const combinedRisk = worstRisk(laneRisk, rateLimiter?.risk ?? 'ok');

	runtime.log(
		`Lane ${lane.destChainName} (${lane.destChainSelector}): onRamp=${onRampAddress} paused=${paused} status=${status} rateLimiter=${rateLimiter?.isEnabled ? `${rateLimiter.usedPct}% used` : 'disabled'}`,
	);

	return {
		destChainName: lane.destChainName,
		destChainSelector: lane.destChainSelector,
		onRampAddress,
		configured: true,
		paused,
		status,
		risk: combinedRisk,
		rateLimiter,
	};
}

// ---------- Handler ----------

function onCron(runtime: Runtime<Config>, _payload: CronPayload): string {
	const { chainName, routerAddress, linkTokenPoolAddress, lanes, thresholds } = runtime.config;
	const evmClient = getEvmClient(chainName);

	const laneResults: LaneResult[] = [];
	for (const lane of lanes) {
		const result = checkLane(runtime, evmClient, routerAddress, linkTokenPoolAddress, lane, thresholds);
		laneResults.push(result);
	}

	const pausedLanes = laneResults.filter((l) => l.status === 'paused').map((l) => l.destChainName);
	const unconfiguredLanes = laneResults.filter((l) => l.status === 'not_configured').map((l) => l.destChainName);
	const rateLimitedLanes = laneResults.filter((l) => l.rateLimiter?.risk && l.rateLimiter.risk !== 'ok').length;
	const allLanesOk = pausedLanes.length === 0 && unconfiguredLanes.length === 0 && rateLimitedLanes === 0;

	const overallRisk = worstRisk(
		...laneResults.map((l) => l.risk),
	);

	const outputPayload: OutputPayload = {
		sourceChain: chainName,
		routerAddress,
		linkTokenPoolAddress,
		lanes: laneResults,
		allLanesOk,
		pausedLanes,
		unconfiguredLanes,
		overallRisk,
		checkedAt: new Date().toISOString(),
		metadata: {
			laneCount: laneResults.length,
			okCount: laneResults.filter((l) => l.status === 'ok').length,
			pausedCount: pausedLanes.length,
			unconfiguredCount: unconfiguredLanes.length,
			rateLimitedLanes,
		},
	};

	runtime.log(
		`CCIP lane health | laneCount=${laneResults.length} ok=${outputPayload.metadata.okCount} paused=${pausedLanes.length} unconfigured=${unconfiguredLanes.length} rateLimited=${rateLimitedLanes} overallRisk=${overallRisk}`,
	);

	// Marker for run_snapshot.sh parser (Sentinel convention)
	runtime.log(`SENTINEL_OUTPUT_JSON=${JSON.stringify(outputPayload)}`);

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
	const runner = await Runner.newRunner({ configSchema });
	await runner.run(initWorkflow);
}

main();
