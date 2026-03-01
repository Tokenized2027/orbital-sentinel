/**
 * ABI for OrbitalSentinelRegistry.sol
 * Deployed to Ethereum Sepolia — address configured in workflow config.registry.address
 *
 * Security: owner-only writes, on-chain duplicate prevention, non-empty riskLevel validation.
 * Audit: AUDIT-REPORT.md — 4 findings fixed, 24 tests, 70k fuzz iterations.
 */
export const SentinelRegistry = [
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
	{
		name: 'owner',
		type: 'function',
		stateMutability: 'view',
		inputs: [],
		outputs: [{ name: '', type: 'address' }],
	},
	{
		name: 'transferOwnership',
		type: 'function',
		stateMutability: 'nonpayable',
		inputs: [{ name: 'newOwner', type: 'address' }],
		outputs: [],
	},
	{
		name: 'recorded',
		type: 'function',
		stateMutability: 'view',
		inputs: [{ name: '', type: 'bytes32' }],
		outputs: [{ name: '', type: 'bool' }],
	},
	{
		name: 'count',
		type: 'function',
		stateMutability: 'view',
		inputs: [],
		outputs: [{ name: '', type: 'uint256' }],
	},
	{
		name: 'latest',
		type: 'function',
		stateMutability: 'view',
		inputs: [],
		outputs: [
			{ name: 'snapshotHash', type: 'bytes32' },
			{ name: 'riskLevel', type: 'string' },
			{ name: 'ts', type: 'uint256' },
			{ name: 'recorder', type: 'address' },
		],
	},
	{
		name: 'records',
		type: 'function',
		stateMutability: 'view',
		inputs: [{ name: '', type: 'uint256' }],
		outputs: [
			{ name: 'snapshotHash', type: 'bytes32' },
			{ name: 'riskLevel', type: 'string' },
			{ name: 'ts', type: 'uint256' },
			{ name: 'recorder', type: 'address' },
		],
	},
	{
		name: 'HealthRecorded',
		type: 'event',
		inputs: [
			{ name: 'snapshotHash', type: 'bytes32', indexed: true },
			{ name: 'riskLevel', type: 'string', indexed: false },
			{ name: 'ts', type: 'uint256', indexed: false },
		],
	},
	{
		name: 'OwnershipTransferred',
		type: 'event',
		inputs: [
			{ name: 'previousOwner', type: 'address', indexed: true },
			{ name: 'newOwner', type: 'address', indexed: true },
		],
	},
	{
		name: 'NotOwner',
		type: 'error',
		inputs: [],
	},
	{
		name: 'AlreadyRecorded',
		type: 'error',
		inputs: [],
	},
	{
		name: 'EmptyRiskLevel',
		type: 'error',
		inputs: [],
	},
] as const;
