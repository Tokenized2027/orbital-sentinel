// SDL Vesting — releasableAmount (used to check claimable vested SDL)
export const SDLVesting = [
    {
        "inputs": [
            { "internalType": "address", "name": "beneficiary", "type": "address" }
        ],
        "name": "releasableAmount",
        "outputs": [
            { "internalType": "uint256", "name": "", "type": "uint256" }
        ],
        "stateMutability": "view",
        "type": "function"
    }
] as const;
