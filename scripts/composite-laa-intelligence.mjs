#!/usr/bin/env node
/**
 * Orbital Sentinel — Composite LAA Intelligence (Phase 1.5)
 *
 * Reads all 6 non-LAA workflow snapshots + the LAA snapshot, POSTs the combined
 * data to the AI analysis endpoint for cross-workflow composite analysis, then
 * writes cre_composite_snapshot.json for on-chain proof recording.
 *
 * Env:
 *   AI_ENDPOINT  — full URL to the composite analysis route (default: http://localhost:5050/api/cre/analyze-composite)
 *   CRE_SECRET   — auth header value for the AI endpoint
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { config } from 'dotenv';

// Load .env from repo root (same pattern as record-all-snapshots.mjs)
config({ path: new URL('../.env', import.meta.url).pathname });

const DATA_DIR =
  process.env.DATA_DIR ||
  '$HOME/projects/orbital/clients/stake-link/sdl/orchestration/intelligence/data';

const AI_ENDPOINT =
  process.env.AI_ENDPOINT || 'http://localhost:5050/api/cre/analyze-composite';

const CRE_SECRET = process.env.CRE_SECRET || process.env.CRE_ANALYZE_SECRET || '';

const SNAPSHOT_FILES = {
  laa: 'cre_laa_snapshot.json',
  feeds: 'cre_feed_snapshot.json',
  treasury: 'cre_treasury_snapshot.json',
  morpho: 'cre_morpho_snapshot.json',
  ccip: 'cre_ccip_snapshot.json',
  curve: 'cre_curve_pool_snapshot.json',
};

const OUTPUT_FILE = `${DATA_DIR}/cre_composite_snapshot.json`;

const log = (msg) => console.log(`[${new Date().toISOString()}] [composite] ${msg}`);

async function readSnapshot(file) {
  const path = `${DATA_DIR}/${file}`;
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, 'utf-8'));
}

async function main() {
  log('Starting composite LAA intelligence...');

  // Read all snapshots
  const snapshots = {};
  let available = 0;
  for (const [key, file] of Object.entries(SNAPSHOT_FILES)) {
    const data = await readSnapshot(file);
    if (data) {
      snapshots[key] = data;
      available++;
    } else {
      log(`  [${key}] snapshot not found, skipping`);
    }
  }

  if (!snapshots.laa) {
    log('LAA snapshot missing — cannot run composite analysis');
    process.exit(1);
  }

  log(`Read ${available}/${Object.keys(SNAPSHOT_FILES).length} snapshots`);

  // POST to AI endpoint
  const headers = { 'Content-Type': 'application/json' };
  if (CRE_SECRET) headers['X-CRE-Secret'] = CRE_SECRET;

  const res = await fetch(AI_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify(snapshots),
  });

  if (!res.ok) {
    const body = await res.text();
    log(`AI endpoint returned ${res.status}: ${body}`);
    process.exit(1);
  }

  const aiResult = await res.json();
  log(
    `AI response: rec=${aiResult.recommendation} risk=${aiResult.composite_risk} confidence=${aiResult.confidence}`,
  );

  // Build composite snapshot with aggregated metrics
  const morphoMarket = snapshots.morpho?.morphoMarket || {};
  const feedMonitor = snapshots.feeds?.monitor || {};
  const treasuryStaking = snapshots.treasury?.staking?.community || {};
  const treasuryQueue = snapshots.treasury?.queue || {};
  const ccipMeta = snapshots.ccip?.metadata || {};
  const curvePool = snapshots.curve?.pool || {};
  const laaQuotes = snapshots.laa?.premiumQuotes || [];

  const composite = {
    ...aiResult,
    generated_at_utc: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    source_snapshots: Object.keys(snapshots),
    metrics: {
      laa_signal: snapshots.laa.signal || 'unknown',
      laa_premium_bps: laaQuotes[0]?.premiumBps ?? 0,
      link_usd: feedMonitor.linkUsd ?? 0,
      stlink_link_ratio: feedMonitor.stlinkLinkPriceRatio ?? 0,
      treasury_community_fill_pct: treasuryStaking.fillPct ?? 0,
      treasury_queue_link: Number(treasuryQueue.queueLink ?? 0),
      morpho_utilization: morphoMarket.utilization ?? 0,
      morpho_supply_apy: snapshots.morpho?.apy?.supplyApy ?? 0,
      ccip_ok_lanes: ccipMeta.okCount ?? 0,
      ccip_total_lanes: ccipMeta.laneCount ?? 0,
      curve_imbalance_pct: curvePool.imbalancePct ?? 0,
      curve_tvl_usd: curvePool.tvlUsd ?? 0,
    },
  };

  await writeFile(OUTPUT_FILE, JSON.stringify(composite, null, 2));
  log(`Wrote composite snapshot to ${OUTPUT_FILE}`);
}

main().catch((err) => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
