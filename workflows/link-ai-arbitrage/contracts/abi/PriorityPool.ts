/**
 * ABI for stake.link Priority Pool
 * Address: 0xDdC796a66E8b83d0BcCD97dF33A6CcFBA8fd60eA
 */
export const PriorityPool = [
	{
		name: 'poolStatus',
		type: 'function',
		stateMutability: 'view',
		inputs: [],
		outputs: [{ name: '', type: 'uint8' }],
	},
	{
		name: 'totalQueued',
		type: 'function',
		stateMutability: 'view',
		inputs: [],
		outputs: [{ name: '', type: 'uint256' }],
	},
] as const;
