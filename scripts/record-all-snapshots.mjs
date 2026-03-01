#!/usr/bin/env node
/**
 * Orbital Sentinel — Real CRE snapshot → on-chain proof bridge.
 *
 * Reads the 8 CRE snapshot JSON files produced by the Orbital orchestration
 * and writes keccak256 proof hashes to SentinelRegistry on Sepolia.
 *
 * Only writes when a snapshot has changed (compares generated_at_utc).
 * Encodes workflow type in riskLevel string: "treasury:critical", "feeds:ok", etc.
 *
 * Replaces record-health-cron.mjs (which used fake hardcoded scenarios).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import pg from 'pg';
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
    key: 'stlink-arb',
    file: 'cre_stlink_arb_snapshot.json',
    extractRisk: (d) => {
      const signal = d.signal ?? 'wait';
      if (signal === 'execute') return 'ok';
      if (signal === 'unprofitable' || signal === 'pool_closed' || signal === 'no_stlink') return 'warning';
      return 'ok'; // 'wait' is normal
    },
    hashFields: (d) => {
      const ts = BigInt(Math.floor(new Date(d.generated_at_utc || d.metadata?.timestamp).getTime() / 1000));
      const signal = d.signal ?? 'wait';
      const premium = BigInt(d.premiumQuotes?.[0]?.premiumBps ?? 0);
      const linkBal = BigInt(d.poolState?.linkBalance ?? '0');
      const risk = signal === 'execute' ? 'ok' : signal === 'wait' ? 'ok' : 'warning';
      return encodeAbiParameters(
        parseAbiParameters('uint256 ts, string wf, string signal, uint256 premium, uint256 linkBal'),
        [ts, 'stlink-arb', risk, premium, linkBal],
      );
    },
  },
  {
    key: 'treasury',
    file: 'cre_treasury_snapshot.json',
    extractRisk: (d) => d.overallRisk ?? 'ok',
    hashFields: (d) => {
      const ts = BigInt(Math.floor(new Date(d.generated_at_utc).getTime() / 1000));
      const risk = d.overallRisk ?? 'ok';
      // Community pool
      const communityStaked = BigInt(Math.round(Number(d.staking?.community?.staked ?? 0)));
      const communityCap = BigInt(Math.round(Number(d.staking?.community?.cap ?? 0)));
      const communityFillPct = BigInt(Math.round((d.staking?.community?.fillPct ?? 0) * 100));
      // Operator pool
      const operatorStaked = BigInt(Math.round(Number(d.staking?.operator?.staked ?? 0)));
      const operatorCap = BigInt(Math.round(Number(d.staking?.operator?.cap ?? 0)));
      const operatorFillPct = BigInt(Math.round((d.staking?.operator?.fillPct ?? 0) * 100));
      // Priority pool queue
      const queueLink = BigInt(Math.round(Number(d.queue?.queueLink ?? 0)));
      // Rewards vault
      const vaultBalance = BigInt(Math.round(Number(d.rewards?.vaultBalance ?? 0)));
      const runwayDays = BigInt(Math.round((d.rewards?.runwayDays ?? 0) * 100));
      return encodeAbiParameters(
        parseAbiParameters('uint256 ts, string wf, string risk, uint256 communityStaked, uint256 communityCap, uint256 communityFillPct, uint256 operatorStaked, uint256 operatorCap, uint256 operatorFillPct, uint256 queueLink, uint256 vaultBalance, uint256 runwayDays'),
        [ts, 'treasury', risk, communityStaked, communityCap, communityFillPct, operatorStaked, operatorCap, operatorFillPct, queueLink, vaultBalance, runwayDays],
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
      const risk = d.monitor?.depegStatus === 'healthy' ? 'ok' : (d.monitor?.depegStatus ?? 'ok');
      // stLINK/LINK ratio (6 decimal precision)
      const ratio = BigInt(Math.round((d.monitor?.stlinkLinkPriceRatio ?? 0) * 1e6));
      const depegBps = BigInt(Math.round((d.monitor?.depegBps ?? 0) * 100));
      // Oracle prices (8 decimal precision, matching Chainlink feed decimals)
      const linkUsd = BigInt(Math.round((d.monitor?.linkUsd ?? 0) * 1e8));
      const ethUsd = BigInt(Math.round((d.monitor?.ethUsd ?? 0) * 1e8));
      return encodeAbiParameters(
        parseAbiParameters('uint256 ts, string wf, string risk, uint256 ratio, uint256 depegBps, uint256 linkUsd, uint256 ethUsd'),
        [ts, 'feeds', risk, ratio, depegBps, linkUsd, ethUsd],
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

      // Extract 7 most recent SLURPs with vote outcomes
      const proposals = (d.proposals ?? []);
      const slurps = proposals
        .filter((p) => /SLURP[- ]?\d+/i.test(p.title))
        .slice(0, 7);

      // Encode each SLURP: number, yesPct (basis points), votes, passed (1/0)
      const slurpData = slurps.map((p) => {
        const m = p.title.match(/SLURP[- ]?(\d+)/i);
        const num = BigInt(m ? m[1] : 0);
        const total = p.scores_total || 1;
        const yesPct = BigInt(Math.round(((p.scores?.[0] ?? 0) / total) * 10000));
        const votes = BigInt(p.votes ?? 0);
        const passed = BigInt((p.scores?.[0] ?? 0) > (p.scores?.[1] ?? 0) ? 1 : 0);
        return { num, yesPct, votes, passed };
      });

      // Pack SLURP numbers into a single uint256 (7 x 16-bit values)
      let slurpNums = 0n;
      let slurpYesPcts = 0n;
      let slurpVotes = 0n;
      let slurpOutcomes = 0n;
      for (let i = 0; i < 7; i++) {
        const s = slurpData[i] ?? { num: 0n, yesPct: 0n, votes: 0n, passed: 0n };
        slurpNums |= (s.num & 0xFFFFn) << BigInt(i * 16);
        slurpYesPcts |= (s.yesPct & 0xFFFFn) << BigInt(i * 16);
        slurpVotes |= (s.votes & 0xFFFFn) << BigInt(i * 16);
        slurpOutcomes |= (s.passed & 0x1n) << BigInt(i);
      }

      return encodeAbiParameters(
        parseAbiParameters('uint256 ts, string wf, string risk, uint256 active, uint256 urgent, uint256 slurpNums, uint256 slurpYesPcts, uint256 slurpVotes, uint256 slurpOutcomes'),
        [ts, 'governance', risk, active, urgent, slurpNums, slurpYesPcts, slurpVotes, slurpOutcomes],
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
      const util01 = d.morphoMarket?.utilization ?? 0;
      const risk = util01 > 0.95 ? 'critical' : util01 > 0.85 ? 'warning' : 'ok';
      // Utilization (6 decimal precision)
      const util = BigInt(Math.round(util01 * 1e6));
      // Supply & borrow (raw wei values, truncated to whole tokens for hash)
      const totalSupplyAssets = BigInt(d.morphoMarket?.totalSupplyAssets ?? '0') / (10n ** 18n);
      const totalBorrowAssets = BigInt(d.morphoMarket?.totalBorrowAssets ?? '0') / (10n ** 18n);
      // Vault share price (6 decimal precision)
      const sharePrice = BigInt(Math.round((d.vault?.sharePrice ?? 0) * 1e6));
      // Vault total assets (whole tokens)
      const vaultTotalAssets = BigInt(d.vault?.totalAssets ?? '0') / (10n ** 18n);
      return encodeAbiParameters(
        parseAbiParameters('uint256 ts, string wf, string risk, uint256 util, uint256 totalSupply, uint256 totalBorrow, uint256 sharePrice, uint256 vaultAssets'),
        [ts, 'morpho', risk, util, totalSupplyAssets, totalBorrowAssets, sharePrice, vaultTotalAssets],
      );
    },
  },
  {
    key: 'curve',
    file: 'cre_curve_pool_snapshot.json',
    extractRisk: (d) => {
      const imbalance = d.pool?.imbalancePct ?? 0;
      if (imbalance > 30) return 'critical';
      if (imbalance > 15) return 'warning';
      return 'ok';
    },
    hashFields: (d) => {
      const ts = BigInt(Math.floor(new Date(d.generated_at_utc).getTime() / 1000));
      const risk = (d.pool?.imbalancePct ?? 0) > 30 ? 'critical' : (d.pool?.imbalancePct ?? 0) > 15 ? 'warning' : 'ok';
      // Pool composition (whole tokens)
      const linkBalance = BigInt(Math.round(d.pool?.linkBalance ?? 0));
      const stlinkBalance = BigInt(Math.round(d.pool?.stlinkBalance ?? 0));
      const imbalancePct = BigInt(Math.round((d.pool?.imbalancePct ?? 0) * 100));
      // Pool metrics (6 decimal precision for virtualPrice)
      const virtualPrice = BigInt(Math.round((d.pool?.virtualPrice ?? 0) * 1e6));
      const tvlUsd = BigInt(Math.round(d.pool?.tvlUsd ?? 0));
      // LINK price from oracle (8 decimals)
      const linkUsd = BigInt(Math.round((d.prices?.linkUsd ?? 0) * 1e8));
      return encodeAbiParameters(
        parseAbiParameters('uint256 ts, string wf, string risk, uint256 linkBalance, uint256 stlinkBalance, uint256 imbalancePct, uint256 virtualPrice, uint256 tvlUsd, uint256 linkUsd'),
        [ts, 'curve', risk, linkBalance, stlinkBalance, imbalancePct, virtualPrice, tvlUsd, linkUsd],
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

// ── Database ──────────────────────────────────────────────────────────

const DB_URL = 'postgresql://devuser:Mbwet%2FF%2F7ENsFDXOgd8HJOOC1JJwQsL5@localhost:5432/sdl_analytics';
let _pool = null;

function getPool() {
  if (!_pool) _pool = new pg.Pool({ connectionString: DB_URL, max: 2 });
  return _pool;
}

async function insertRecord({ snapshotHash, riskLevel, blockTimestamp, blockNumber, txHash, recorder }) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO sentinel_records (protocol_id, snapshot_hash, risk_level, block_timestamp, block_number, tx_hash, recorder)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT ON CONSTRAINT uq_sentinel_tx DO NOTHING`,
    ['stake.link', snapshotHash, riskLevel, blockTimestamp, blockNumber, txHash, recorder],
  );
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

      // Insert into dashboard DB
      try {
        const account = privateKeyToAccount(DEPLOYER_KEY);
        await insertRecord({
          snapshotHash,
          riskLevel,
          blockTimestamp: new Date(),
          blockNumber: Number(result.blockNumber),
          txHash: result.txHash,
          recorder: account.address,
        });
        log(`[${wf.key}] DB record inserted`);
      } catch (dbErr) {
        log(`[${wf.key}] DB insert failed (non-critical): ${dbErr.message}`);
      }

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

  // Close DB pool
  if (_pool) await _pool.end();

  log(`Done — ${successes} written, ${skips} skipped, ${failures} failed`);

  // Exit non-zero only if ALL workflows failed
  if (successes === 0 && failures > 0) {
    process.exit(1);
  }
}

main();
