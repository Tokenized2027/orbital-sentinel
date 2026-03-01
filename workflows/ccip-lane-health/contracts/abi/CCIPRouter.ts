// Minimal CCIP Router v1.2 ABI — lane health reads only
export const CCIPRouter = [
    {
        "inputs": [
            { "internalType": "uint64", "name": "destChainSelector", "type": "uint64" }
        ],
        "name": "getOnRamp",
        "outputs": [
            { "internalType": "address", "name": "onRamp", "type": "address" }
        ],
        "stateMutability": "view",
        "type": "function"
    }
] as const;
