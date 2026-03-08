/**
 * ABI for Curve StableSwap NG (stLINK/LINK pool)
 * Pool address: 0x7E13876B92F1a62C599C231f783f682E96B91761
 * coin[0] = LINK, coin[1] = stLINK
 */
export const CurveStableSwapNG = [
	{
		name: 'get_dy',
		type: 'function',
		stateMutability: 'view',
		inputs: [
			{ name: 'i', type: 'int128' },
			{ name: 'j', type: 'int128' },
			{ name: 'dx', type: 'uint256' },
		],
		outputs: [{ name: '', type: 'uint256' }],
	},
	{
		name: 'balances',
		type: 'function',
		stateMutability: 'view',
		inputs: [{ name: 'i', type: 'uint256' }],
		outputs: [{ name: '', type: 'uint256' }],
	},
	{
		name: 'coins',
		type: 'function',
		stateMutability: 'view',
		inputs: [{ name: 'i', type: 'uint256' }],
		outputs: [{ name: '', type: 'address' }],
	},
	{
		name: 'get_virtual_price',
		type: 'function',
		stateMutability: 'view',
		inputs: [],
		outputs: [{ name: '', type: 'uint256' }],
	},
] as const;
