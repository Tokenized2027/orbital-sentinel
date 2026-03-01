import {
	bytesToHex,
	cre,
	encodeCallMsg,
	getNetwork,
	Runner,
	type Runtime,
	type CronPayload,
} from '@chainlink/cre-sdk';
import { encodeFunctionData, decodeFunctionResult, formatUnits, keccak256, encodeAbiParameters, parseAbiParameters, type Address, zeroAddress } from 'viem';
import { z } from 'zod';
import { ERC20, SDLVesting, Multicall3 } from '../contracts/abi';
import { SentinelRegistry } from '../contracts/abi/SentinelRegistry';
import {
	SDL_TOKEN,
	STLINK_TOKEN,
	getAllAddresses,
	getStLinkTrackedAddresses,
	VESTING_CONTRACTS,
	type AddressEntry,
} from './addresses';

// ---------- Constants ----------

const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';

// ---------- Config ----------

const configSchema = z.object({
	schedule: z.string(),
	chainName: z.string(),
	registry: z.object({
		address: z.string(),
		chainName: z.string().default('ethereum-testnet-sepolia'),
	}).optional(),
});

type Config = z.infer<typeof configSchema>;

type BalanceEntry = {
	address: string;
	label: string;
	group: string;
	sdlBalance: string;
	stLinkBalance: string | null;
};

type VestingResult = {
	address: string;
	beneficiary: string;
	label: string;
	releasable: string;
};

type Totals = {
	totalSdlTracked: string;
	totalStLinkTracked: string;
	nopSdlTotal: string;
	protocolSdlTotal: string;
};

type OutputPayload = {
	balances: BalanceEntry[];
	vestingContracts: VestingResult[];
	totals: Totals;
	metadata: {
		addressCount: number;
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

type Call3 = { target: Address; allowFailure: boolean; callData: `0x${string}` };

function batchMulticall(
	runtime: Runtime<Config>,
	evmClient: InstanceType<typeof cre.capabilities.EVMClient>,
	calls: Call3[],
): Array<{ success: boolean; returnData: `0x${string}` }> {
	const multicallData = encodeFunctionData({
		abi: Multicall3,
		functionName: 'aggregate3',
		args: [calls],
	});
	const rawResult = callContract(runtime, evmClient, MULTICALL3_ADDRESS, multicallData);
	return decodeFunctionResult({
		abi: Multicall3,
		functionName: 'aggregate3',
		data: bytesToHex(rawResult),
	}) as unknown as Array<{ success: boolean; returnData: `0x${string}` }>;
}

function decodeUint256(returnData: `0x${string}`): bigint {
	if (returnData.length <= 2) return 0n;
	try {
		return decodeFunctionResult({
			abi: ERC20,
			functionName: 'balanceOf',
			data: returnData,
		}) as bigint;
	} catch {
		return 0n;
	}
}

// ---------- Handler ----------

function onCron(runtime: Runtime<Config>, _payload: CronPayload): string {
	const evmClient = getEvmClient(runtime.config.chainName);

	const allAddresses = getAllAddresses();
	const stLinkAddresses = getStLinkTrackedAddresses();
	const stLinkSet = new Set(
		stLinkAddresses.map((a) => a.address.toLowerCase()),
	);

	// Build batch: SDL balances + stLINK balances + vesting — all in one multicall
	const calls: Call3[] = [];

	// SDL balanceOf for all addresses (indices 0..allAddresses.length-1)
	for (const entry of allAddresses) {
		calls.push({
			target: SDL_TOKEN as Address,
			allowFailure: true,
			callData: encodeFunctionData({
				abi: ERC20,
				functionName: 'balanceOf',
				args: [entry.address as Address],
			}),
		});
	}
	const sdlCount = allAddresses.length;

	// stLINK balanceOf for tracked addresses (indices sdlCount..sdlCount+stLinkAddresses.length-1)
	for (const entry of stLinkAddresses) {
		calls.push({
			target: STLINK_TOKEN as Address,
			allowFailure: true,
			callData: encodeFunctionData({
				abi: ERC20,
				functionName: 'balanceOf',
				args: [entry.address as Address],
			}),
		});
	}
	const stLinkCount = stLinkAddresses.length;

	// Vesting releasableAmount (indices sdlCount+stLinkCount..)
	for (const vc of VESTING_CONTRACTS) {
		calls.push({
			target: vc.address as Address,
			allowFailure: true,
			callData: encodeFunctionData({
				abi: SDLVesting,
				functionName: 'releasableAmount',
				args: [vc.beneficiary as Address],
			}),
		});
	}

	// Execute single multicall (1 CRE callContract instead of 67)
	const results = batchMulticall(runtime, evmClient, calls);

	// Parse SDL balances
	const balances: BalanceEntry[] = [];
	let totalSdl = 0n;
	let totalStLink = 0n;
	let nopSdl = 0n;
	let protocolSdl = 0n;

	for (let i = 0; i < allAddresses.length; i++) {
		const entry = allAddresses[i];
		const sdlBal = results[i].success ? decodeUint256(results[i].returnData) : 0n;

		totalSdl += sdlBal;
		if (entry.group === 'nop' || entry.group === 'nop_sub') {
			nopSdl += sdlBal;
		}
		if (entry.group === 'protocol') {
			protocolSdl += sdlBal;
		}

		balances.push({
			address: entry.address,
			label: entry.label,
			group: entry.group,
			sdlBalance: sdlBal.toString(),
			stLinkBalance: null,
		});
	}

	// Parse stLINK balances
	for (let i = 0; i < stLinkAddresses.length; i++) {
		const entry = stLinkAddresses[i];
		const stLinkBal = results[sdlCount + i].success ? decodeUint256(results[sdlCount + i].returnData) : 0n;

		totalStLink += stLinkBal;

		const balanceEntry = balances.find((b) => b.address.toLowerCase() === entry.address.toLowerCase());
		if (balanceEntry) {
			balanceEntry.stLinkBalance = stLinkBal.toString();
		}
	}

	// Parse vesting results
	const vestingResults: VestingResult[] = [];
	for (let i = 0; i < VESTING_CONTRACTS.length; i++) {
		const vc = VESTING_CONTRACTS[i];
		const result = results[sdlCount + stLinkCount + i];
		let releasable = 0n;
		if (result.success && result.returnData.length > 2) {
			try {
				releasable = decodeFunctionResult({
					abi: SDLVesting,
					functionName: 'releasableAmount',
					data: result.returnData,
				}) as bigint;
			} catch {
				releasable = 0n;
			}
		}
		vestingResults.push({
			address: vc.address,
			beneficiary: vc.beneficiary,
			label: vc.label,
			releasable: releasable.toString(),
		});
	}

	runtime.log(
		`SDL flows | addresses=${allAddresses.length} totalSDL=${formatUnits(totalSdl, 18)} nopSDL=${formatUnits(nopSdl, 18)} protocolSDL=${formatUnits(protocolSdl, 18)} totalStLink=${formatUnits(totalStLink, 18)}`,
	);

	const outputPayload: OutputPayload = {
		balances,
		vestingContracts: vestingResults,
		totals: {
			totalSdlTracked: totalSdl.toString(),
			totalStLinkTracked: totalStLink.toString(),
			nopSdlTotal: nopSdl.toString(),
			protocolSdlTotal: protocolSdl.toString(),
		},
		metadata: {
			addressCount: allAddresses.length,
			blockNumber: '0',
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
			const totalSdlBig = totalSdl > 10n ** 20n ? totalSdl / 10n ** 18n : totalSdl;
			const snapshotHash = keccak256(
				encodeAbiParameters(
					parseAbiParameters('uint256 ts, string wf, string risk, uint256 totalSdl, uint256 addrCount'),
					[timestampUnix, 'flows', 'ok', totalSdlBig, BigInt(allAddresses.length)],
				),
			);

			const writeCallData = encodeFunctionData({
				abi: SentinelRegistry,
				functionName: 'recordHealth',
				args: [snapshotHash, 'flows:ok'],
			});

			sepoliaClient.callContract(runtime, {
				call: encodeCallMsg({ from: zeroAddress, to: runtime.config.registry.address as Address, data: writeCallData }),
			}).result();

			runtime.log(`Registry write | flows:ok hash=${snapshotHash}`);
		} catch (e) {
			runtime.log(`Registry write failed (degraded): ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	runtime.log(`TOKEN_FLOWS_OUTPUT_JSON=${JSON.stringify(outputPayload)}`);

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
