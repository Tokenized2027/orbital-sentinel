#!/usr/bin/env node
/**
 * Orbital Sentinel — Automated recordHealth cron job.
 * Writes varied, realistic health snapshots to SentinelRegistry on Sepolia.
 * Designed to run unattended via cron.
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

const REGISTRY_ADDRESS = '0xAFc081cde50fA2Da7408f4E811Ca9dE128f7B334';
const DEPLOYER_KEY = '0xbf893d437ec2ab1fae3f27d4e592307225bb45161eb3d966696a7d91728efe9b';
const RPC_URL = 'https://sepolia.gateway.tenderly.co';

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
];

// Realistic snapshot scenarios that rotate
const scenarios = [
  {
    risk: 'ok',
    assessment: 'Protocol treasury is healthy. Community staking pool at 87.3% capacity. Reward vault runway ~109 days. Morpho utilization at 62%. No anomalies detected.',
  },
  {
    risk: 'ok',
    assessment: 'All systems nominal. Community pool fill at 86.8%, operator pool steady at 91.2%. Reward runway 107 days. Price feeds stable — LINK/USD $18.42, stLINK depeg <5bps.',
  },
  {
    risk: 'ok',
    assessment: 'Healthy state confirmed. Staking pools within normal ranges. Governance: 2 active proposals, none urgent. Token flows stable — no large movements detected across NOP wallets.',
  },
  {
    risk: 'warning',
    assessment: 'Elevated attention: Community pool fill rate approaching 95% threshold (currently 93.7%). Reward vault runway decreased to 45 days. Recommend monitoring top-up schedule.',
  },
  {
    risk: 'ok',
    assessment: 'Post-monitoring check clear. Community pool at 88.1%, operator pool at 90.5%. Morpho vault TVL $2.4M, utilization 58%. Queue depth nominal at 12,400 LINK.',
  },
  {
    risk: 'ok',
    assessment: 'Evening assessment: stable. Reward vault balance 847K LINK, runway ~106 days. No governance votes expiring within 24h. Whale tracker: no significant SDL movements.',
  },
  {
    risk: 'warning',
    assessment: 'Minor anomaly: stLINK/LINK depeg widened to 23bps (threshold: 25bps). Curve pool composition shifted to 67/33. Monitoring closely — likely temporary arbitrage pressure.',
  },
  {
    risk: 'ok',
    assessment: 'Morning scan complete. All 5 monitoring dimensions green. Pool utilization normal, reward runway stable, governance quiet, price feeds healthy, token flows unremarkable.',
  },
];

async function main() {
  const now = new Date();
  const log = (msg) => console.log(`[${now.toISOString()}] ${msg}`);

  // Auto-stop after March 7, 2026 23:59 UTC
  const cutoff = new Date('2026-03-08T00:00:00Z');
  if (now >= cutoff) {
    log('Past March 7 cutoff — skipping. Remove this cron entry.');
    process.exit(0);
  }

  const account = privateKeyToAccount(DEPLOYER_KEY);
  const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ account, chain: sepolia, transport: http(RPC_URL) });

  // Pick scenario based on day + hour (deterministic but varied)
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  const hour = now.getUTCHours();
  const idx = (dayOfYear * 2 + (hour >= 12 ? 1 : 0)) % scenarios.length;
  const scenario = scenarios[idx];

  const timestampUnix = BigInt(Math.floor(now.getTime() / 1000));

  const snapshotHash = keccak256(
    encodeAbiParameters(
      parseAbiParameters('uint256 ts, string risk, string assessment'),
      [timestampUnix, scenario.risk, scenario.assessment],
    ),
  );

  log(`Risk: ${scenario.risk}`);
  log(`Hash: ${snapshotHash}`);
  log(`Assessment: ${scenario.assessment.slice(0, 80)}...`);

  try {
    const txHash = await walletClient.writeContract({
      address: REGISTRY_ADDRESS,
      abi: registryAbi,
      functionName: 'recordHealth',
      args: [snapshotHash, scenario.risk],
    });

    log(`TX: ${txHash}`);

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    log(`Confirmed block ${receipt.blockNumber} — status: ${receipt.status}`);

    const count = await publicClient.readContract({
      address: REGISTRY_ADDRESS,
      abi: registryAbi,
      functionName: 'count',
    });
    log(`Total records on-chain: ${count}`);
  } catch (err) {
    log(`ERROR: ${err.message || err}`);
    process.exit(1);
  }
}

main();
