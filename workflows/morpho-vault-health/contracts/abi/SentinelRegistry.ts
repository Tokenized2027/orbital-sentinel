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
] as const;
