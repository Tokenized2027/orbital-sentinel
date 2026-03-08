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
DATA_DIR="$HOME/projects/orbital/clients/stake-link/sdl/orchestration/intelligence/data"
LOG_PREFIX="[$(date -u +"%Y-%m-%dT%H:%M:%SZ")]"

log() { echo "${LOG_PREFIX} $1"; }

# ── Telegram alerting on failure ──────────────────────────────────────
_TG_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
_TG_CHAT="${TELEGRAM_CHAT_ID:-}"

notify_failure() {
  local exit_code=$?
  if [ "${exit_code}" -ne 0 ] && [ -n "${_TG_TOKEN}" ]; then
    local msg="⚠️ Sentinel Unified Cycle FAILED (exit ${exit_code}) at $(date -u +"%H:%M UTC"). Check logs: ~/logs/sentinel-unified.log"
    curl -s -X POST "https://api.telegram.org/bot${_TG_TOKEN}/sendMessage" \
      -d chat_id="${_TG_CHAT}" -d text="${msg}" >/dev/null 2>&1 || true
    log "Failure notification sent to Telegram"
  fi
}
trap notify_failure EXIT

# Prevent concurrent cycle executions (F-B5 audit fix)
LOCK_FILE="/tmp/sentinel-unified-cycle.lock"
exec 200>"${LOCK_FILE}"
if ! flock -n 200; then
  log "Another cycle is already running. Exiting."
  # Exit 0 so the trap doesn't fire a false alarm
  exit 0
fi

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

# Sentinel CRE workflows (7)
run_workflow "treasury"   "${SENTINEL_ROOT}/workflows/treasury-risk"      "cre_treasury_snapshot.json"
run_workflow "feeds"       "${SENTINEL_ROOT}/workflows/price-feeds"        "cre_feed_snapshot.json"
run_workflow "governance" "${SENTINEL_ROOT}/workflows/governance-monitor"  "cre_governance_snapshot.json"
run_workflow "morpho"     "${SENTINEL_ROOT}/workflows/morpho-vault-health" "cre_morpho_snapshot.json"
run_workflow "curve"      "${SENTINEL_ROOT}/workflows/curve-pool"          "cre_curve_pool_snapshot.json"
run_workflow "ccip"       "${SENTINEL_ROOT}/workflows/ccip-lane-health"    "cre_ccip_snapshot.json"

# LINK AI Arbitrage (LAA) — was cross-repo, now local
run_workflow "laa" "${SENTINEL_ROOT}/workflows/link-ai-arbitrage" "cre_laa_snapshot.json"

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

# ── Phase 1.5: Composite Intelligence ──────────────────────────────
#
# Reads all workflow snapshots and produces a cross-workflow AI analysis
# that enriches the LAA arb decision with ecosystem-wide context.
# Requires the AI endpoint to be running (platform/cre_analyze_endpoint.py).

log "Running composite LAA intelligence..."
cd "${SCRIPT_DIR}"
if AI_ENDPOINT="http://localhost:5050/api/cre/analyze-composite" /usr/bin/node composite-laa-intelligence.mjs; then
  log "Composite intelligence OK"
else
  log "Composite intelligence FAILED (non-blocking, continuing to proof write)"
fi

# ── Phase 2: Write on-chain proofs ──────────────────────────────────

log "Writing on-chain proofs..."
cd "${SCRIPT_DIR}"
/usr/bin/node record-all-snapshots.mjs

log "=== Sentinel Unified Cycle DONE ==="
