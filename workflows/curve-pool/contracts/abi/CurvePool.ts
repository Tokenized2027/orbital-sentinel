/**
 * Minimal ABI for Curve NG StableSwap pool (stLINK/LINK)
 * Pool: 0x7E13876B92F1a62C599C231f783f682E96B91761
 */
export const CurvePool = [
	{
		name: 'balances',
		type: 'function',
		stateMutability: 'view',
		inputs: [{ name: 'i', type: 'uint256' }],
		outputs: [{ name: '', type: 'uint256' }],
	},
	{
		name: 'A',
		type: 'function',
		stateMutability: 'view',
		inputs: [],
		outputs: [{ name: '', type: 'uint256' }],
	},
	{
		name: 'get_virtual_price',
		type: 'function',
		stateMutability: 'view',
		inputs: [],
		outputs: [{ name: '', type: 'uint256' }],
	},
] as const;
