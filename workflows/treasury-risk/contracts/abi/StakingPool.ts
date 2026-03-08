// Chainlink Community / Operator Staking Pool v0.2 — subset of functions we read
// Note: Staking v0.2 uses get-prefixed getters (getTotalPrincipal, getMaxPoolSize)
export const StakingPool = [
    {
        "inputs": [],
        "name": "getTotalPrincipal",
        "outputs": [
            { "internalType": "uint256", "name": "", "type": "uint256" }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "getMaxPoolSize",
        "outputs": [
            { "internalType": "uint256", "name": "", "type": "uint256" }
        ],
        "stateMutability": "view",
        "type": "function"
    }
] as const;
