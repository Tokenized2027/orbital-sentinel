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
import { encodeFunctionData, decodeFunctionResult, formatUnits, type Address, zeroAddress } from 'viem';
import { z } from 'zod';
import { PriceFeedAggregator } from '../contracts/abi';

// ---------- Config ----------

const configSchema = z.object({
	// e.g. "0 */10 * * * *" (every 10 minutes, at second 0)
	schedule: z.string(),
	// e.g. "ethereum-mainnet"
	chainName: z.string(),
	// list of feeds (BTC/USD, ETH/USD, ...)
	feeds: z.array(
		z.object({
			name: z.string(),    // "BTC/USD"
			address: z.string(), // proxy address
		}),
	),
	internalData: z.object({
		enabled: z.boolean().default(true),
		url: z.string(),
	}).optional(),
	webhook: z.object({
		enabled: z.boolean().default(false),
		url: z.string(),
		bearerToken: z.string().optional(),
	}).optional(),
});

type Config = z.infer<typeof configSchema>;

type PriceResult = {
	name: string;
	address: string;
	decimals: number;
	latestAnswerRaw: string;
	scaled: string;
};

type InternalDataResult = {
	status: 'ok' | 'error' | 'disabled';
	sourceUrl?: string;
	fetchedAt?: string;
	stlinkLinkPriceRatio?: number;
	stlinkPriceUsd?: number;
	linkPriceUsd?: number;
	poolComposition?: number;
	error?: string;
};

type MonitorResult = {
	linkUsd?: number;
	ethUsd?: number;
	polUsd?: number;
	stlinkLinkPriceRatio?: number;
	depegBps?: number;
	depegStatus: 'healthy' | 'warning' | 'critical' | 'unknown';
};

type OutputPayload = {
	timestamp: string;
	chainName: string;
	feeds: PriceResult[];
	internalData: InternalDataResult;
	monitor: MonitorResult;
};

// ---------- Helpers ----------

function getEvmClient(chainName: string) {
	const net = getNetwork({
		chainFamily: 'evm',
		chainSelectorName: chainName,
		isTestnet: false,
	});
	if (!net) throw new Error(`Network not found for chain name: ${chainName}`);
	return new cre.capabilities.EVMClient(net.chainSelector.selector);
}

// Safely stringify BigInt
const safeJsonStringify = (obj: unknown) =>
	JSON.stringify(obj, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2);

function toNumberOrUndefined(value: unknown): number | undefined {
	const n = Number(value);
	return Number.isFinite(n) ? n : undefined;
}

function fetchInternalData(
	sendRequester: HTTPSendRequester,
	args: { url: string },
): InternalDataResult {
	const resp = sendRequester
		.sendRequest({
			method: 'GET',
			url: args.url,
			headers: { Accept: 'application/json' },
		})
		.result();

	if (resp.statusCode < 200 || resp.statusCode >= 300) {
		throw new Error(`internal data request failed with status=${resp.statusCode}`);
	}

	const decoded = JSON.parse(Buffer.from(resp.body).toString('utf-8')) as Record<string, unknown>;
	const curve = (decoded.curve as Record<string, unknown>) || {};
	const ratio = toNumberOrUndefined(curve.priceRatio ?? curve.price_ratio);
	const stlinkPrice = toNumberOrUndefined(curve.stlinkPrice ?? curve.stlink_price);
	const linkPrice = toNumberOrUndefined(curve.linkPrice ?? curve.link_price);
	const poolComposition = toNumberOrUndefined(curve.poolComposition ?? curve.pool_composition);

	// Fallback for /api/defi shape: derive prices from curve.coins[].usdPrice.
	const curveCoins = Array.isArray(curve.coins) ? curve.coins as Array<Record<string, unknown>> : [];
	let stlinkFromCoins = stlinkPrice;
	let linkFromCoins = linkPrice;
	if (curveCoins.length > 0) {
		for (const coin of curveCoins) {
			const symbol = String(coin.symbol || '').toUpperCase();
			const usdPrice = toNumberOrUndefined(coin.usdPrice);
			if (symbol === 'STLINK' && usdPrice != null) stlinkFromCoins = usdPrice;
			if (symbol === 'LINK' && usdPrice != null) linkFromCoins = usdPrice;
		}
	}
	const ratioDerived = ratio ?? (
		stlinkFromCoins != null && linkFromCoins != null && linkFromCoins > 0
			? stlinkFromCoins / linkFromCoins
			: undefined
	);

	const result: InternalDataResult = {
		status: 'ok',
		sourceUrl: args.url,
		fetchedAt: new Date().toISOString(),
	};
	if (ratioDerived != null) result.stlinkLinkPriceRatio = ratioDerived;
	if (stlinkFromCoins != null) result.stlinkPriceUsd = stlinkFromCoins;
	if (linkFromCoins != null) result.linkPriceUsd = linkFromCoins;
	if (poolComposition != null) result.poolComposition = poolComposition;
	return result;
}

function postWebhook(sendRequester: HTTPSendRequester, args: {
	url: string;
	bearerToken?: string;
	payload: OutputPayload;
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

// ---------- Reader ----------

function readFeed(
	runtime: Runtime<Config>,
	evmClient: InstanceType<typeof cre.capabilities.EVMClient>,
	name: string,
	address: string,
): PriceResult {
	// decimals()
	const decCallData = encodeFunctionData({
		abi: PriceFeedAggregator,
		functionName: 'decimals',
	});

	const decResp = evmClient
		.callContract(runtime, {
			call: encodeCallMsg({
				from: zeroAddress,
				to: address as Address,
				data: decCallData,
			}),
		})
		.result();

	const decimals = decodeFunctionResult({
		abi: PriceFeedAggregator,
		functionName: 'decimals',
		data: bytesToHex(decResp.data),
	}) as number;

	// latestAnswer()
	const ansCallData = encodeFunctionData({
		abi: PriceFeedAggregator,
		functionName: 'latestAnswer',
	});

	const ansResp = evmClient
		.callContract(runtime, {
			call: encodeCallMsg({
				from: zeroAddress,
				to: address as Address,
				data: ansCallData,
			}),
		})
		.result();

	const latestAnswer = decodeFunctionResult({
		abi: PriceFeedAggregator,
		functionName: 'latestAnswer',
		data: bytesToHex(ansResp.data),
	}) as bigint;

	const scaled = formatUnits(latestAnswer, decimals);

	runtime.log(
		`Price feed read | chain=${runtime.config.chainName} feed="${name}" address=${address} decimals=${decimals} latestAnswerRaw=${latestAnswer.toString()} latestAnswerScaled=${scaled}`,
	);

	return {
		name,
		address,
		decimals,
		latestAnswerRaw: latestAnswer.toString(),
		scaled,
	};
}

// ---------- Handlers ----------

function onCron(runtime: Runtime<Config>, _payload: CronPayload): string {
	const evmClient = getEvmClient(runtime.config.chainName);

	const results: PriceResult[] = runtime.config.feeds.map((f) =>
		readFeed(runtime, evmClient, f.name, f.address),
	);

	let internalData: InternalDataResult = { status: 'disabled' };
	if (runtime.config.internalData?.enabled && runtime.config.internalData.url) {
		try {
			const http = new cre.capabilities.HTTPClient();
			internalData = http
				.sendRequest(
					runtime,
					fetchInternalData,
					consensusIdenticalAggregation<InternalDataResult>(),
				)({ url: runtime.config.internalData.url })
				.result();
		} catch (e) {
			internalData = {
				status: 'error',
				sourceUrl: runtime.config.internalData.url,
				fetchedAt: new Date().toISOString(),
				error: e instanceof Error ? e.message : String(e),
			};
			runtime.log(`Internal SDL data fetch failed: ${internalData.error}`);
		}
	}

	const feedsByName = new Map(results.map((r) => [r.name, toNumberOrUndefined(r.scaled)]));
	const ratio = internalData.stlinkLinkPriceRatio;
	const depegBps = ratio != null ? Math.abs(ratio - 1) * 10000 : undefined;
	const depegStatus: MonitorResult['depegStatus'] =
		depegBps == null ? 'unknown' : depegBps <= 50 ? 'healthy' : depegBps <= 150 ? 'warning' : 'critical';

	const outputPayload: OutputPayload = {
		timestamp: new Date().toISOString(),
		chainName: runtime.config.chainName,
		feeds: results,
		internalData,
		monitor: {
			linkUsd: feedsByName.get('LINK/USD'),
			ethUsd: feedsByName.get('ETH/USD'),
			polUsd: feedsByName.get('POL/USD'),
			stlinkLinkPriceRatio: ratio ?? undefined,
			depegBps,
			depegStatus,
		},
	};

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
