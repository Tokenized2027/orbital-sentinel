#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# Orbital Sentinel — Unified CRE Cycle
#
# Runs ALL 7 CRE workflow simulations in parallel, then writes
# all on-chain proofs in one batch via record-all-snapshots.mjs.
#
# Designed to run 7 times/day at even intervals (~3h25m apart).
# Replaces the old per-workflow crons + 15-min bridge cron.
# ──────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SENTINEL_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DATA_DIR="/home/avi/projects/orbital/clients/stake-link/sdl/orchestration/intelligence/data"
LOG_PREFIX="[$(date -u +"%Y-%m-%dT%H:%M:%SZ")]"

log() { echo "${LOG_PREFIX} $1"; }

log "=== Sentinel Unified Cycle START ==="

# ── Phase 1: Run all 7 CRE snapshot generators in parallel ──────────

mkdir -p "${DATA_DIR}"

PIDS=()
NAMES=()
EXITS=()

run_workflow() {
  local name="$1"
  local dir="$2"
  local snapshot_file="$3"

  log "[${name}] Starting CRE simulate..."
  SNAPSHOT_PATH="${DATA_DIR}/${snapshot_file}" \
    bash "${dir}/run_snapshot.sh" staging-settings 2>&1 | \
    sed "s/^/${LOG_PREFIX} [${name}] /" &
  PIDS+=($!)
  NAMES+=("${name}")
}

# Sentinel CRE workflows (6)
run_workflow "treasury"   "${SENTINEL_ROOT}/workflows/treasury-risk"      "cre_treasury_snapshot.json"
run_workflow "feeds"       "${SENTINEL_ROOT}/workflows/price-feeds"        "cre_feed_snapshot.json"
run_workflow "governance" "${SENTINEL_ROOT}/workflows/governance-monitor"  "cre_governance_snapshot.json"
run_workflow "morpho"     "${SENTINEL_ROOT}/workflows/morpho-vault-health" "cre_morpho_snapshot.json"
run_workflow "curve"      "${SENTINEL_ROOT}/workflows/curve-pool"          "cre_curve_pool_snapshot.json"
run_workflow "ccip"       "${SENTINEL_ROOT}/workflows/ccip-lane-health"    "cre_ccip_snapshot.json"

# Orbital arb-vault CRE workflow (1)
run_workflow "stlink-arb" "/home/avi/projects/orbital/clients/stake-link/arb-vault/workflows/stlink-arb-monitor" "cre_stlink_arb_snapshot.json"

# ── Wait for all to finish ──────────────────────────────────────────

FAIL_COUNT=0
for i in "${!PIDS[@]}"; do
  if wait "${PIDS[$i]}"; then
    log "[${NAMES[$i]}] CRE simulate OK"
  else
    log "[${NAMES[$i]}] CRE simulate FAILED (exit $?)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
done

log "Phase 1 done — ${#PIDS[@]} workflows, ${FAIL_COUNT} failures"

if [ "${FAIL_COUNT}" -eq "${#PIDS[@]}" ]; then
  log "ALL workflows failed — skipping on-chain write"
  exit 1
fi

# ── Phase 2: Write on-chain proofs ──────────────────────────────────

log "Writing on-chain proofs..."
cd "${SCRIPT_DIR}"
/usr/bin/node record-all-snapshots.mjs

log "=== Sentinel Unified Cycle DONE ==="
