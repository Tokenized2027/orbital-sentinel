#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SNAPSHOT_PATH="${SNAPSHOT_PATH:-${ROOT_DIR}/../../intelligence/data/cre_feed_snapshot.json}"
CRE_BIN="${CRE_BIN:-${HOME}/.local/bin/cre}"

if [ -x "${HOME}/.bun/bin/bun" ]; then
  export PATH="${HOME}/.bun/bin:${PATH}"
fi

if [ ! -x "${CRE_BIN}" ]; then
  echo "CRE binary not found or not executable at ${CRE_BIN}" >&2
  exit 1
fi

if [ "$#" -gt 0 ]; then
  TARGETS=("$@")
else
  TARGETS=("staging-settings" "polygon-settings")
fi

tmp_dir="$(mktemp -d)"
tmp_json="$(mktemp)"
cleanup() {
  rm -rf "${tmp_dir}" "${tmp_json}"
}
trap cleanup EXIT

cd "${ROOT_DIR}"

run_target() {
  local target="$1"
  local out_file="$2"
  local max_attempts=3
  local attempt=1

  while true; do
    echo "Running CRE simulate for ${target} (attempt ${attempt}/${max_attempts})..."
    if "${CRE_BIN}" workflow simulate my-workflow --target "${target}" > "${out_file}" 2>&1; then
      return 0
    fi

    if [ "${attempt}" -ge "${max_attempts}" ]; then
      echo "CRE simulate failed for ${target} after ${max_attempts} attempts." >&2
      return 1
    fi

    attempt=$((attempt + 1))
    sleep 2
  done
}

output_files=()
for target in "${TARGETS[@]}"; do
  out_file="${tmp_dir}/${target}.log"
  run_target "${target}" "${out_file}"
  output_files+=("${out_file}")
done

python3 - "${tmp_json}" "${SNAPSHOT_PATH}" "${output_files[@]}" <<'PY'
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


def parse_output(text: str) -> dict | None:
    workflow_output = None

    marker_matches = re.findall(r"SDL_CRE_OUTPUT_JSON=(\{.*\})", text)
    if marker_matches:
        try:
            workflow_output = json.loads(marker_matches[-1])
        except Exception:
            workflow_output = None

    if workflow_output is None:
        decoder = json.JSONDecoder()
        candidates = []
        required = {"name", "address", "decimals", "latestAnswerRaw", "scaled"}
        for idx in range(len(text)):
            try:
                obj, _ = decoder.raw_decode(text[idx:])
            except Exception:
                continue

            payload = obj
            if isinstance(obj, str):
                try:
                    payload = json.loads(obj)
                except Exception:
                    payload = None

            if (
                isinstance(payload, list)
                and payload
                and isinstance(payload[0], dict)
                and required.issubset(payload[0].keys())
            ):
                candidates.append(payload)

        if candidates:
            chain_match = re.search(r'chain=([a-zA-Z0-9._-]+)', text)
            chain_name = chain_match.group(1) if chain_match else "unknown"
            workflow_output = {
                "chainName": chain_name,
                "feeds": candidates[-1],
                "internalData": {"status": "disabled"},
                "monitor": {"depegStatus": "unknown"},
            }

    return workflow_output


tmp_json_path = Path(sys.argv[1])
snapshot_path = Path(sys.argv[2])
raw_paths = [Path(p) for p in sys.argv[3:]]

parsed_outputs = []
for raw_path in raw_paths:
    text = raw_path.read_text(encoding="utf-8", errors="replace")
    parsed = parse_output(text)
    if not parsed:
        raise SystemExit(f"Could not find structured workflow output in {raw_path}")
    parsed_outputs.append(parsed)

chains = []
merged_feeds = {}
feed_sources = {}
internal_data = {"status": "disabled"}
monitor = {"depegStatus": "unknown"}

for output in parsed_outputs:
    chain_name = output.get("chainName") or "unknown"
    if chain_name not in chains:
        chains.append(chain_name)

    for feed in output.get("feeds") or []:
        name = feed.get("name")
        if not name:
            continue
        if name not in merged_feeds:
            merged_feeds[name] = feed
            feed_sources[name] = chain_name

    candidate_internal = output.get("internalData") or {}
    if candidate_internal.get("status") in ("ok", "error"):
        internal_data = candidate_internal

    candidate_monitor = output.get("monitor") or {}
    for k in ("linkUsd", "ethUsd", "polUsd", "stlinkLinkPriceRatio", "depegBps"):
        if candidate_monitor.get(k) is not None:
            monitor[k] = candidate_monitor[k]
    # Only upgrade depegStatus — never downgrade to "unknown"
    cds = candidate_monitor.get("depegStatus")
    if cds and (cds != "unknown" or monitor.get("depegStatus") == "unknown"):
        monitor["depegStatus"] = cds

snapshot = {
    "generated_at_utc": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    "chain_name": chains[0] if len(chains) == 1 else "multi",
    "chains": chains,
    "source": "cre_simulate",
    "feeds": list(merged_feeds.values()),
    "feed_sources": feed_sources,
    "internal_data": internal_data,
    "monitor": monitor,
}

snapshot_path.parent.mkdir(parents=True, exist_ok=True)
tmp_json_path.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
tmp_json_path.replace(snapshot_path)
print(f"Wrote merged snapshot to {snapshot_path}")
PY
