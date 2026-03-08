// ERC-20 — balanceOf only (used to check reward vault LINK balance)
export const ERC20 = [
    {
        "inputs": [
            { "internalType": "address", "name": "account", "type": "address" }
        ],
        "name": "balanceOf",
        "outputs": [
            { "internalType": "uint256", "name": "", "type": "uint256" }
        ],
        "stateMutability": "view",
        "type": "function"
    }
] as const;
