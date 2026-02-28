/**
 * ABI for OrbitalSentinelRegistry.sol
 * Deployed to Ethereum Sepolia — address configured in workflow config.registry.address
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
] as const;
