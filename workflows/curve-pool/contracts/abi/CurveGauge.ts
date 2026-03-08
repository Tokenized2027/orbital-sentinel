/**
 * Curve LiquidityGauge ABI (V4+ / NG style)
 * stLINK gauge: 0x985ca600257bfc1adc2b630b8a7e2110b834a20e
 *
 * Reads: reward token count, reward token addresses, reward rates, total staked LP
 */
export const CurveGauge = [
	{
		name: 'reward_count',
		type: 'function',
		stateMutability: 'view',
		inputs: [],
		outputs: [{ name: '', type: 'uint256' }],
	},
	{
		name: 'reward_tokens',
		type: 'function',
		stateMutability: 'view',
		inputs: [{ name: 'i', type: 'uint256' }],
		outputs: [{ name: '', type: 'address' }],
	},
	{
		name: 'reward_data',
		type: 'function',
		stateMutability: 'view',
		inputs: [{ name: 'token', type: 'address' }],
		outputs: [
			{ name: 'token', type: 'address' },
			{ name: 'distributor', type: 'address' },
			{ name: 'period_finish', type: 'uint256' },
			{ name: 'rate', type: 'uint256' },
			{ name: 'last_update', type: 'uint256' },
			{ name: 'integral', type: 'uint256' },
		],
	},
	{
		name: 'totalSupply',
		type: 'function',
		stateMutability: 'view',
		inputs: [],
		outputs: [{ name: '', type: 'uint256' }],
	},
	{
		name: 'inflation_rate',
		type: 'function',
		stateMutability: 'view',
		inputs: [],
		outputs: [{ name: '', type: 'uint256' }],
	},
] as const;
