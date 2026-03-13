import {
	bytesToHex,
	cre,
	consensusIdenticalAggregation,
	encodeCallMsg,
	getNetwork,
	Runner,
	type Runtime,
	type CronPayload,
	type HTTPSendRequester,
} from '@chainlink/cre-sdk';
import { encodeFunctionData, decodeFunctionResult, formatUnits, keccak256, encodeAbiParameters, parseAbiParameters, type Address, zeroAddress } from 'viem';
import { z } from 'zod';
import { MorphoBlue, AdaptiveCurveIrm, ERC4626Vault, ERC20 } from '../contracts/abi';
import { SentinelRegistry } from '../contracts/abi/SentinelRegistry';

// ---------- Config ----------

const configSchema = z.object({
	schedule: z.string(),
	chainName: z.string(),
	morphoAddress: z.string(),
	marketId: z.string(),
	vaultAddress: z.string(),
	linkTokenAddress: z.string(),
	registry: z.object({
		address: z.string(),
		chainName: z.string().default('ethereum-testnet-sepolia'),
	}).optional(),
});

type Config = z.infer<typeof configSchema>;

type MarketParams = {
	loanToken: string;
	collateralToken: string;
	oracle: string;
	irm: string;
	lltv: string;
};

type MorphoMarketResult = {
	totalSupplyAssets: string;
	totalSupplyShares: string;
	totalBorrowAssets: string;
	totalBorrowShares: string;
	lastUpdate: string;
	fee: string;
	utilization: number;
};

type IncentiveData = {
	totalNetApy: number;      // base + all incentives
	baseApy: number;          // base lending yield only
	sdlIncentiveApy: number;  // SDL reward component
	wstlinkIncentiveApy: number; // wstLINK reward component
	netBorrowApy: number;     // gross borrow minus incentive rebate
};

type ApyResult = {
	borrowRatePerSecond: string;
	borrowApy: number;
	supplyApy: number;
	irmAddress: string;
	incentives?: IncentiveData;
};

type VaultResult = {
	totalAssets: string;
	totalSupply: string;
	sharePrice: number;
	linkBalance: string;
};

type OutputPayload = {
	morphoMarket: MorphoMarketResult;
	vault: VaultResult;
	apy: ApyResult;
	metadata: {
		marketId: string;
		morphoAddress: string;
		vaultAddress: string;
		blockNumber: string;
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

// ---------- Readers ----------

function readMorphoMarket(
	runtime: Runtime<Config>,
	evmClient: InstanceType<typeof cre.capabilities.EVMClient>,
): MorphoMarketResult {
	const callData = encodeFunctionData({
		abi: MorphoBlue,
		functionName: 'market',
		args: [runtime.config.marketId as `0x${string}`],
	});

	const raw = callContract(runtime, evmClient, runtime.config.morphoAddress, callData);

	const decoded = decodeFunctionResult({
		abi: MorphoBlue,
		functionName: 'market',
		data: bytesToHex(raw),
	}) as readonly [bigint, bigint, bigint, bigint, bigint, bigint];

	const [totalSupplyAssets, totalSupplyShares, totalBorrowAssets, totalBorrowShares, lastUpdate, fee] = decoded;

	const utilization = totalSupplyAssets > 0n
		? Number(totalBorrowAssets * 10000n / totalSupplyAssets) / 10000
		: 0;

	runtime.log(
		`Morpho market | supply=${formatUnits(totalSupplyAssets, 18)} borrow=${formatUnits(totalBorrowAssets, 18)} util=${(utilization * 100).toFixed(2)}%`,
	);

	return {
		totalSupplyAssets: totalSupplyAssets.toString(),
		totalSupplyShares: totalSupplyShares.toString(),
		totalBorrowAssets: totalBorrowAssets.toString(),
		totalBorrowShares: totalBorrowShares.toString(),
		lastUpdate: lastUpdate.toString(),
		fee: fee.toString(),
		utilization,
	};
}

function readVault(
	runtime: Runtime<Config>,
	evmClient: InstanceType<typeof cre.capabilities.EVMClient>,
): VaultResult {
	const vaultAddr = runtime.config.vaultAddress;
	const linkAddr = runtime.config.linkTokenAddress;

	// totalAssets()
	const totalAssetsData = encodeFunctionData({ abi: ERC4626Vault, functionName: 'totalAssets' });
	const totalAssetsRaw = callContract(runtime, evmClient, vaultAddr, totalAssetsData);
	const totalAssets = decodeFunctionResult({
		abi: ERC4626Vault,
		functionName: 'totalAssets',
		data: bytesToHex(totalAssetsRaw),
	}) as bigint;

	// totalSupply()
	const totalSupplyData = encodeFunctionData({ abi: ERC4626Vault, functionName: 'totalSupply' });
	const totalSupplyRaw = callContract(runtime, evmClient, vaultAddr, totalSupplyData);
	const totalSupply = decodeFunctionResult({
		abi: ERC4626Vault,
		functionName: 'totalSupply',
		data: bytesToHex(totalSupplyRaw),
	}) as bigint;

	// convertToAssets(1e18)
	const convertData = encodeFunctionData({
		abi: ERC4626Vault,
		functionName: 'convertToAssets',
		args: [10n ** 18n],
	});
	const convertRaw = callContract(runtime, evmClient, vaultAddr, convertData);
	const assetsPerShare = decodeFunctionResult({
		abi: ERC4626Vault,
		functionName: 'convertToAssets',
		data: bytesToHex(convertRaw),
	}) as bigint;

	const sharePrice = Number(assetsPerShare) / 1e18;

	// balanceOf(vault) on LINK token
	const balOfData = encodeFunctionData({
		abi: ERC20,
		functionName: 'balanceOf',
		args: [vaultAddr as Address],
	});
	const balOfRaw = callContract(runtime, evmClient, linkAddr, balOfData);
	const linkBalance = decodeFunctionResult({
		abi: ERC20,
		functionName: 'balanceOf',
		data: bytesToHex(balOfRaw),
	}) as bigint;

	runtime.log(
		`Vault | totalAssets=${formatUnits(totalAssets, 18)} totalSupply=${formatUnits(totalSupply, 18)} sharePrice=${sharePrice.toFixed(6)} linkBal=${formatUnits(linkBalance, 18)}`,
	);

	return {
		totalAssets: totalAssets.toString(),
		totalSupply: totalSupply.toString(),
		sharePrice,
		linkBalance: linkBalance.toString(),
	};
}

// ---------- APY ----------

const SECONDS_PER_YEAR = 365.25 * 24 * 3600;
const WAD = 1e18;

function readMarketParams(
	runtime: Runtime<Config>,
	evmClient: InstanceType<typeof cre.capabilities.EVMClient>,
): MarketParams {
	const callData = encodeFunctionData({
		abi: MorphoBlue,
		functionName: 'idToMarketParams',
		args: [runtime.config.marketId as `0x${string}`],
	});

	const raw = callContract(runtime, evmClient, runtime.config.morphoAddress, callData);
	const decoded = decodeFunctionResult({
		abi: MorphoBlue,
		functionName: 'idToMarketParams',
		data: bytesToHex(raw),
	}) as readonly [string, string, string, string, bigint];

	const [loanToken, collateralToken, oracle, irm, lltv] = decoded;
	runtime.log(`MarketParams | irm=${irm} lltv=${lltv.toString()}`);

	return {
		loanToken,
		collateralToken,
		oracle,
		irm,
		lltv: lltv.toString(),
	};
}

function readBorrowRate(
	runtime: Runtime<Config>,
	evmClient: InstanceType<typeof cre.capabilities.EVMClient>,
	params: MarketParams,
	market: MorphoMarketResult,
): ApyResult {
	const callData = encodeFunctionData({
		abi: AdaptiveCurveIrm,
		functionName: 'borrowRateView',
		args: [
			{
				loanToken: params.loanToken as Address,
				collateralToken: params.collateralToken as Address,
				oracle: params.oracle as Address,
				irm: params.irm as Address,
				lltv: BigInt(params.lltv),
			},
			{
				totalSupplyAssets: BigInt(market.totalSupplyAssets),
				totalSupplyShares: BigInt(market.totalSupplyShares),
				totalBorrowAssets: BigInt(market.totalBorrowAssets),
				totalBorrowShares: BigInt(market.totalBorrowShares),
				lastUpdate: BigInt(market.lastUpdate),
				fee: BigInt(market.fee),
			},
		],
	});

	const raw = callContract(runtime, evmClient, params.irm, callData);
	const borrowRatePerSecond = decodeFunctionResult({
		abi: AdaptiveCurveIrm,
		functionName: 'borrowRateView',
		data: bytesToHex(raw),
	}) as bigint;

	// borrowRate is in WAD (1e18 = 100% per second)
	const ratePerSec = Number(borrowRatePerSecond) / WAD;
	const borrowApy = ratePerSec * SECONDS_PER_YEAR * 100; // as percentage
	const feeRate = Number(BigInt(market.fee)) / WAD;
	const supplyApy = borrowApy * market.utilization * (1 - feeRate);

	runtime.log(
		`APY | borrowRate=${borrowRatePerSecond.toString()}/s borrowAPY=${borrowApy.toFixed(4)}% supplyAPY=${supplyApy.toFixed(4)}% fee=${(feeRate * 100).toFixed(2)}%`,
	);

	return {
		borrowRatePerSecond: borrowRatePerSecond.toString(),
		borrowApy,
		supplyApy,
		irmAddress: params.irm,
	};
}

// ---------- Incentive Data (Morpho GraphQL API) ----------

const MORPHO_GQL_URL = 'https://api.morpho.org/graphql';
const MORPHO_VAULT_ADDR = '0x610f5B68bD1EED68Af649A3fD3DC2CAa1ee4Ae7E';

type MorphoGqlResponse = {
	data?: {
		vaultV2ByAddress?: {
			avgNetApy?: number;
			avgNetApyExcludingRewards?: number;
			rewards?: Array<{ supplyApr?: number; asset?: { symbol?: string } }>;
		};
	};
};

function fetchMorphoIncentives(
	sendRequester: HTTPSendRequester,
	_args: Record<string, never>,
): MorphoGqlResponse {
	const query = `{ vaultV2ByAddress(address: "${MORPHO_VAULT_ADDR}", chainId: 1) { avgNetApy avgNetApyExcludingRewards rewards { supplyApr asset { symbol } } } }`;
	const resp = sendRequester
		.sendRequest({
			method: 'POST',
			url: MORPHO_GQL_URL,
			headers: { 'Content-Type': 'application/json' },
			body: Buffer.from(JSON.stringify({ query })).toString('base64'),
		})
		.result();
	return JSON.parse(Buffer.from(resp.body).toString('utf-8'));
}

function parseIncentives(raw: MorphoGqlResponse, grossBorrowApy: number): IncentiveData {
	const vault = raw?.data?.vaultV2ByAddress;
	const totalNetApy = (vault?.avgNetApy ?? 0) * 100;
	const baseApy = (vault?.avgNetApyExcludingRewards ?? 0) * 100;
	const rewards = vault?.rewards ?? [];

	let sdlIncentiveApy = 0;
	let wstlinkIncentiveApy = 0;
	for (const r of rewards) {
		const sym = (r.asset?.symbol ?? '').toUpperCase();
		const apr = (r.supplyApr ?? 0) * 100;
		if (sym === 'SDL') sdlIncentiveApy = apr;
		else if (sym === 'WSTLINK' || sym === 'STLINK') wstlinkIncentiveApy = apr;
	}

	// Net borrow = gross borrow minus total incentive rebate
	const totalIncentive = sdlIncentiveApy + wstlinkIncentiveApy;
	const netBorrowApy = grossBorrowApy - totalIncentive;

	return { totalNetApy, baseApy, sdlIncentiveApy, wstlinkIncentiveApy, netBorrowApy };
}

// ---------- Handler ----------

function onCron(runtime: Runtime<Config>, _payload: CronPayload): string {
	const evmClient = getEvmClient(runtime.config.chainName);

	const morphoMarket = readMorphoMarket(runtime, evmClient);
	const vault = readVault(runtime, evmClient);

	// Read IRM for APY calculation
	let apy: ApyResult;
	try {
		const params = readMarketParams(runtime, evmClient);
		apy = readBorrowRate(runtime, evmClient, params, morphoMarket);
	} catch (e) {
		runtime.log(`APY read failed (degraded): ${e instanceof Error ? e.message : String(e)}`);
		apy = { borrowRatePerSecond: '0', borrowApy: 0, supplyApy: 0, irmAddress: '' };
	}

	// Fetch incentive data from Morpho GraphQL API
	try {
		const http = new cre.capabilities.HTTPClient();
		const gqlResult = http
			.sendRequest(
				runtime,
				fetchMorphoIncentives,
				consensusIdenticalAggregation<MorphoGqlResponse>(),
			)({})
			.result();
		const incentives = parseIncentives(gqlResult, apy.borrowApy);
		apy.incentives = incentives;
		runtime.log(
			`Incentives | totalNetAPY=${incentives.totalNetApy.toFixed(2)}% base=${incentives.baseApy.toFixed(2)}% SDL=${incentives.sdlIncentiveApy.toFixed(2)}% wstLINK=${incentives.wstlinkIncentiveApy.toFixed(2)}% netBorrow=${incentives.netBorrowApy.toFixed(2)}%`,
		);
	} catch (e) {
		runtime.log(`Incentive fetch failed (degraded, using base APY only): ${e instanceof Error ? e.message : String(e)}`);
	}

	const outputPayload: OutputPayload = {
		morphoMarket,
		vault,
		apy,
		metadata: {
			marketId: runtime.config.marketId,
			morphoAddress: runtime.config.morphoAddress,
			vaultAddress: runtime.config.vaultAddress,
			blockNumber: '0', // CRE does not expose block number
			timestamp: new Date().toISOString(),
		},
	};

	// --- On-chain write to SentinelRegistry (Sepolia) ---
	if (runtime.config.registry?.address && runtime.config.registry.address !== '0x0000000000000000000000000000000000000000') {
		try {
			const net = getNetwork({ chainFamily: 'evm', chainSelectorName: runtime.config.registry.chainName, isTestnet: true });
			if (!net) throw new Error(`Network not found: ${runtime.config.registry.chainName}`);
			const sepoliaClient = new cre.capabilities.EVMClient(net.chainSelector.selector);

			const timestampUnix = BigInt(Math.floor(Date.now() / 1000));
			const util = morphoMarket.utilization;
			const risk = util > 0.95 ? 'critical' : util > 0.85 ? 'warning' : 'ok';
			const utilScaled = BigInt(Math.round(util * 1e6));
			const snapshotHash = keccak256(
				encodeAbiParameters(
					parseAbiParameters('uint256 ts, string wf, string risk, uint256 util, uint256 supply'),
					[timestampUnix, 'morpho', risk, utilScaled, BigInt(vault.totalSupply)],
				),
			);

			const writeCallData = encodeFunctionData({
				abi: SentinelRegistry,
				functionName: 'recordHealth',
				args: [snapshotHash, `morpho:${risk}`],
			});

			sepoliaClient.callContract(runtime, {
				call: encodeCallMsg({ from: zeroAddress, to: runtime.config.registry.address as Address, data: writeCallData }),
			}).result();

			runtime.log(`Registry write | morpho:${risk} hash=${snapshotHash}`);
		} catch (e) {
			runtime.log(`Registry write failed (degraded): ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	runtime.log(`MORPHO_CRE_OUTPUT_JSON=${JSON.stringify(outputPayload)}`);

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
