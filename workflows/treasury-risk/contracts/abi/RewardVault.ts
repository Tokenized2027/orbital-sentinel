// Chainlink Reward Vault v0.2 — getRewardBuckets returns 3 buckets × 3 fields each
// Verified on-chain: 288 bytes = 9 words = 3 fields per bucket (no cumulatedReward)
export const RewardVault = [
    {
        "inputs": [],
        "name": "getRewardBuckets",
        "outputs": [
            {
                "components": [
                    {
                        "components": [
                            { "internalType": "uint80", "name": "emissionRate", "type": "uint80" },
                            { "internalType": "uint80", "name": "rewardDurationEndsAt", "type": "uint80" },
                            { "internalType": "uint256", "name": "vestedRewardPerToken", "type": "uint256" }
                        ],
                        "internalType": "struct RewardVault.RewardBucket",
                        "name": "operatorBase",
                        "type": "tuple"
                    },
                    {
                        "components": [
                            { "internalType": "uint80", "name": "emissionRate", "type": "uint80" },
                            { "internalType": "uint80", "name": "rewardDurationEndsAt", "type": "uint80" },
                            { "internalType": "uint256", "name": "vestedRewardPerToken", "type": "uint256" }
                        ],
                        "internalType": "struct RewardVault.RewardBucket",
                        "name": "communityBase",
                        "type": "tuple"
                    },
                    {
                        "components": [
                            { "internalType": "uint80", "name": "emissionRate", "type": "uint80" },
                            { "internalType": "uint80", "name": "rewardDurationEndsAt", "type": "uint80" },
                            { "internalType": "uint256", "name": "vestedRewardPerToken", "type": "uint256" }
                        ],
                        "internalType": "struct RewardVault.RewardBucket",
                        "name": "operatorDelegated",
                        "type": "tuple"
                    }
                ],
                "internalType": "struct RewardVault.RewardBuckets",
                "name": "",
                "type": "tuple"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    }
] as const;
