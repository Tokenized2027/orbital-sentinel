#!/usr/bin/env node
/**
 * Orbital Sentinel — Real CRE snapshot → on-chain proof bridge.
 *
 * Reads the 6 CRE snapshot JSON files produced by the Orbital orchestration
 * and writes keccak256 proof hashes to SentinelRegistry on Sepolia.
 *
 * Only writes when a snapshot has changed (compares generated_at_utc).
 * Encodes workflow type in riskLevel string: "treasury:critical", "feeds:ok", etc.
 *
 * Replaces record-health-cron.mjs (which used fake hardcoded scenarios).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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

// ── Constants ──────────────────────────────────────────────────────────

const REGISTRY_ADDRESS = '0xAFc081cde50fA2Da7408f4E811Ca9dE128f7B334';
const DEPLOYER_KEY = '0xbf893d437ec2ab1fae3f27d4e592307225bb45161eb3d966696a7d91728efe9b';

const RPC_URLS = [
  'https://ethereum-sepolia-rpc.publicnode.com',
  'https://rpc.sepolia.org',
  'https://sepolia.drpc.org',
  'https://sepolia.gateway.tenderly.co',
];

const SNAPSHOT_DIR = '/home/avi/projects/orbital/clients/stake-link/sdl/orchestration/intelligence/data';
const STATE_FILE = '/home/avi/orbital-sentinel/scripts/.last-write-state.json';
const STALE_THRESHOLD_MS = 45 * 60 * 1000; // 45 minutes

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

// ── Workflow Definitions ───────────────────────────────────────────────

const WORKFLOWS = [
  {
    key: 'treasury',
    file: 'cre_treasury_snapshot.json',
    extractRisk: (d) => d.overallRisk ?? 'ok',
    hashFields: (d) => {
      const ts = BigInt(Math.floor(new Date(d.generated_at_utc).getTime() / 1000));
      const risk = d.overallRisk ?? 'ok';
      const fillPct = BigInt(Math.round((d.staking?.community?.fillPct ?? 0) * 1e4));
      const runway = BigInt(Math.round((d.rewards?.runwayDays ?? 0) * 100));
      return encodeAbiParameters(
        parseAbiParameters('uint256 ts, string wf, string risk, uint256 fillPct, uint256 runway'),
        [ts, 'treasury', risk, fillPct, runway],
      );
    },
  },
  {
    key: 'feeds',
    file: 'cre_feed_snapshot.json',
    extractRisk: (d) => {
      const status = d.monitor?.depegStatus;
      if (status === 'healthy' || status === 'ok') return 'ok';
      if (status === 'warning') return 'warning';
      if (status === 'critical') return 'critical';
      return 'ok';
    },
    hashFields: (d) => {
      const ts = BigInt(Math.floor(new Date(d.generated_at_utc).getTime() / 1000));
      const ratio = BigInt(Math.round((d.monitor?.stlinkLinkPriceRatio ?? 0) * 1e6));
      const bps = BigInt(Math.round((d.monitor?.depegBps ?? 0) * 100));
      const risk = d.monitor?.depegStatus === 'healthy' ? 'ok' : (d.monitor?.depegStatus ?? 'ok');
      return encodeAbiParameters(
        parseAbiParameters('uint256 ts, string wf, string risk, uint256 ratio, uint256 bps'),
        [ts, 'feeds', risk, ratio, bps],
      );
    },
  },
  {
    key: 'governance',
    file: 'cre_governance_snapshot.json',
    extractRisk: (d) => (d.summary?.urgentProposals > 0 ? 'warning' : 'ok'),
    hashFields: (d) => {
      const ts = BigInt(Math.floor(new Date(d.generated_at_utc).getTime() / 1000));
      const active = BigInt(d.summary?.activeProposals ?? 0);
      const urgent = BigInt(d.summary?.urgentProposals ?? 0);
      const risk = d.summary?.urgentProposals > 0 ? 'warning' : 'ok';
      return encodeAbiParameters(
        parseAbiParameters('uint256 ts, string wf, string risk, uint256 active, uint256 urgent'),
        [ts, 'governance', risk, active, urgent],
      );
    },
  },
  {
    key: 'morpho',
    file: 'cre_morpho_snapshot.json',
    extractRisk: (d) => {
      const util = d.morphoMarket?.utilization ?? 0;
      if (util > 0.95) return 'critical';
      if (util > 0.85) return 'warning';
      return 'ok';
    },
    hashFields: (d) => {
      const ts = BigInt(Math.floor(new Date(d.generated_at_utc).getTime() / 1000));
      const util = BigInt(Math.round((d.morphoMarket?.utilization ?? 0) * 1e6));
      const totalSupply = BigInt(d.vault?.totalSupply?.replace?.(/\D/g, '') ?? '0');
      const util01 = d.morphoMarket?.utilization ?? 0;
      const risk = util01 > 0.95 ? 'critical' : util01 > 0.85 ? 'warning' : 'ok';
      return encodeAbiParameters(
        parseAbiParameters('uint256 ts, string wf, string risk, uint256 util, uint256 supply'),
        [ts, 'morpho', risk, util, totalSupply],
      );
    },
  },
  {
    key: 'flows',
    file: 'cre_sdl_flows_snapshot.json',
    extractRisk: () => 'ok',
    hashFields: (d) => {
      const ts = BigInt(Math.floor(new Date(d.generated_at_utc).getTime() / 1000));
      const totalSdl = BigInt(d.totals?.totalSdlTracked?.slice?.(0, 20) ?? '0');
      const addrCount = BigInt(d.metadata?.addressCount ?? 0);
      return encodeAbiParameters(
        parseAbiParameters('uint256 ts, string wf, string risk, uint256 totalSdl, uint256 addrCount'),
        [ts, 'flows', 'ok', totalSdl, addrCount],
      );
    },
  },
  {
    key: 'ccip',
    file: 'cre_ccip_snapshot.json',
    extractRisk: (d) => (d.metadata?.pausedCount > 0 ? 'warning' : 'ok'),
    hashFields: (d) => {
      const ts = BigInt(Math.floor(new Date(d.generated_at_utc).getTime() / 1000));
      const ok = BigInt(d.metadata?.okCount ?? 0);
      const total = BigInt(d.metadata?.laneCount ?? 0);
      const risk = d.metadata?.pausedCount > 0 ? 'warning' : 'ok';
      return encodeAbiParameters(
        parseAbiParameters('uint256 ts, string wf, string risk, uint256 okLanes, uint256 totalLanes'),
        [ts, 'ccip', risk, ok, total],
      );
    },
  },
];

// ── Helpers ────────────────────────────────────────────────────────────

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

async function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(await readFile(STATE_FILE, 'utf-8'));
    }
  } catch { /* start fresh */ }
  return {};
}

async function saveState(state) {
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

async function readSnapshot(file) {
  const path = `${SNAPSHOT_DIR}/${file}`;
  const raw = await readFile(path, 'utf-8');
  return JSON.parse(raw);
}

async function writeOnChain(snapshotHash, riskLevel) {
  const account = privateKeyToAccount(DEPLOYER_KEY);
  let lastErr = null;

  for (const rpcUrl of RPC_URLS) {
    const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
    const walletClient = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });

    try {
      const txHash = await walletClient.writeContract({
        address: REGISTRY_ADDRESS,
        abi: registryAbi,
        functionName: 'recordHealth',
        args: [snapshotHash, riskLevel],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash, blockNumber: receipt.blockNumber, status: receipt.status };
    } catch (err) {
      lastErr = err;
    }
  }

  throw new Error(`All ${RPC_URLS.length} RPCs failed. Last: ${lastErr?.message || lastErr}`);
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  log('Starting real CRE snapshot → on-chain proof bridge');

  const state = await loadState();
  let successes = 0;
  let skips = 0;
  let failures = 0;

  for (const wf of WORKFLOWS) {
    try {
      const data = await readSnapshot(wf.file);
      const generatedAt = data.generated_at_utc;

      if (!generatedAt) {
        log(`[${wf.key}] SKIP — no generated_at_utc in snapshot`);
        skips++;
        continue;
      }

      // Check if snapshot changed since last write
      if (state[wf.key] === generatedAt) {
        log(`[${wf.key}] SKIP — unchanged (${generatedAt})`);
        skips++;
        continue;
      }

      // Check staleness
      const age = Date.now() - new Date(generatedAt).getTime();
      if (age > STALE_THRESHOLD_MS) {
        log(`[${wf.key}] SKIP — stale (${Math.round(age / 60000)}m old, threshold ${STALE_THRESHOLD_MS / 60000}m)`);
        skips++;
        continue;
      }

      // Compute hash and risk
      const risk = wf.extractRisk(data);
      const encoded = wf.hashFields(data);
      const snapshotHash = keccak256(encoded);
      const riskLevel = `${wf.key}:${risk}`;

      log(`[${wf.key}] Writing — risk=${riskLevel} hash=${snapshotHash.slice(0, 16)}...`);

      const result = await writeOnChain(snapshotHash, riskLevel);
      log(`[${wf.key}] TX ${result.txHash} — block ${result.blockNumber} status=${result.status}`);

      state[wf.key] = generatedAt;
      successes++;
    } catch (err) {
      log(`[${wf.key}] FAIL — ${err.message || err}`);
      failures++;
    }
  }

  // Save state after all workflows
  await saveState(state);

  // Read total count on-chain
  try {
    const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URLS[0]) });
    const count = await publicClient.readContract({
      address: REGISTRY_ADDRESS,
      abi: registryAbi,
      functionName: 'count',
    });
    log(`Total on-chain records: ${count}`);
  } catch { /* non-critical */ }

  log(`Done — ${successes} written, ${skips} skipped, ${failures} failed`);

  // Exit non-zero only if ALL workflows failed
  if (successes === 0 && failures > 0) {
    process.exit(1);
  }
}

main();
