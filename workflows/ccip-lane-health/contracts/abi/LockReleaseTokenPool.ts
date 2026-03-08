// Minimal LockReleaseTokenPool ABI — rate limiter state only
export const LockReleaseTokenPool = [
	{
		inputs: [
			{ internalType: 'uint64', name: 'remoteChainSelector', type: 'uint64' },
		],
		name: 'getCurrentOutboundRateLimiterState',
		outputs: [
			{
				components: [
					{ internalType: 'uint128', name: 'tokens', type: 'uint128' },
					{ internalType: 'uint32', name: 'lastUpdated', type: 'uint32' },
					{ internalType: 'bool', name: 'isEnabled', type: 'bool' },
					{ internalType: 'uint128', name: 'capacity', type: 'uint128' },
					{ internalType: 'uint128', name: 'rate', type: 'uint128' },
				],
				internalType: 'struct RateLimiter.TokenBucket',
				name: '',
				type: 'tuple',
			},
		],
		stateMutability: 'view',
		type: 'function',
	},
] as const;
