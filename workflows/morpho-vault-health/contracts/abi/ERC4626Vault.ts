export const ERC4626Vault = [
	{
		name: 'totalAssets',
		type: 'function',
		stateMutability: 'view',
		inputs: [],
		outputs: [{ name: '', type: 'uint256' }],
	},
	{
		name: 'totalSupply',
		type: 'function',
		stateMutability: 'view',
		inputs: [],
		outputs: [{ name: '', type: 'uint256' }],
	},
	{
		name: 'convertToAssets',
		type: 'function',
		stateMutability: 'view',
		inputs: [{ name: 'shares', type: 'uint256' }],
		outputs: [{ name: '', type: 'uint256' }],
	},
] as const;
