#!/usr/bin/env node
/**
 * Orbital Sentinel — Record a health snapshot on Sepolia SentinelRegistry.
 *
 * Simulates what the CRE treasury-risk workflow does in Step 4:
 * compute a keccak256 snapshot hash and call recordHealth() on-chain.
 */
import {
  createWalletClient,
  createPublicClient,
  http,
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

// --- Config ---
const REGISTRY_ADDRESS = '0xE5B1b708b237F9F0F138DE7B03EEc1Eb1a871d40';
const DEPLOYER_KEY = '0xbf893d437ec2ab1fae3f27d4e592307225bb45161eb3d966696a7d91728efe9b';
const RPC_URL = 'https://sepolia.gateway.tenderly.co';

// --- ABI (only what we need) ---
const registryAbi = [
  {
    type: 'function',
    name: 'recordHealth',
    inputs: [
      { name: 'snapshotHash', type: 'bytes32' },
      { name: 'riskLevel', type: 'string' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'count',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'latest',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'snapshotHash', type: 'bytes32' },
          { name: 'riskLevel', type: 'string' },
          { name: 'ts', type: 'uint256' },
          { name: 'recorder', type: 'address' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'HealthRecorded',
    inputs: [
      { name: 'snapshotHash', type: 'bytes32', indexed: true },
      { name: 'riskLevel', type: 'string', indexed: false },
      { name: 'ts', type: 'uint256', indexed: false },
    ],
  },
];

async function main() {
  const account = privateKeyToAccount(DEPLOYER_KEY);

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(RPC_URL),
  });

  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(RPC_URL),
  });

  // Check balance first
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`Wallet: ${account.address}`);
  console.log(`Balance: ${Number(balance) / 1e18} Sepolia ETH`);

  if (balance === 0n) {
    console.error('No Sepolia ETH — need testnet funds. Use https://faucets.chain.link/sepolia');
    process.exit(1);
  }

  // Build a realistic snapshot (mimics treasury-risk workflow output)
  const timestampUnix = BigInt(Math.floor(Date.now() / 1000));
  const riskLevel = 'ok';
  const assessment = 'Protocol treasury is healthy. Community staking pool at 87.3% capacity. Reward vault runway ~109 days. No anomalies detected.';

  // Compute snapshot hash — same encoding as the CRE workflow
  const snapshotHash = keccak256(
    encodeAbiParameters(
      parseAbiParameters('uint256 ts, string risk, string assessment'),
      [timestampUnix, riskLevel, assessment],
    ),
  );

  console.log(`\nSnapshot:`);
  console.log(`  timestamp: ${timestampUnix}`);
  console.log(`  riskLevel: ${riskLevel}`);
  console.log(`  assessment: ${assessment.slice(0, 80)}...`);
  console.log(`  snapshotHash: ${snapshotHash}`);

  // Call recordHealth
  console.log(`\nSending recordHealth() to ${REGISTRY_ADDRESS}...`);
  const txHash = await walletClient.writeContract({
    address: REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: 'recordHealth',
    args: [snapshotHash, riskLevel],
  });

  console.log(`TX sent: ${txHash}`);
  console.log(`Explorer: https://sepolia.etherscan.io/tx/${txHash}`);

  // Wait for confirmation
  console.log('Waiting for confirmation...');
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`Confirmed in block ${receipt.blockNumber} — status: ${receipt.status}`);

  // Read back
  const count = await publicClient.readContract({
    address: REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: 'count',
  });
  console.log(`\nTotal records on-chain: ${count}`);

  const latest = await publicClient.readContract({
    address: REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: 'latest',
  });
  console.log(`Latest record:`);
  console.log(`  hash: ${latest.snapshotHash}`);
  console.log(`  risk: ${latest.riskLevel}`);
  console.log(`  ts:   ${latest.ts}`);
  console.log(`  recorder: ${latest.recorder}`);
}

main().catch((err) => {
  console.error('Failed:', err.message || err);
  process.exit(1);
});
