#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SNAPSHOT_PATH="/home/avi/projects/orbital/clients/stake-link/sdl/orchestration/intelligence/data/cre_ccip_snapshot.json"
CRE_BIN="${CRE_BIN:-${HOME}/.local/bin/cre}"

if [ -x "${HOME}/.bun/bin/bun" ]; then
  export PATH="${HOME}/.bun/bin:${PATH}"
fi

if [ ! -x "${CRE_BIN}" ]; then
  echo "CRE binary not found or not executable at ${CRE_BIN}" >&2
  exit 1
fi

if [ "$#" -gt 0 ]; then
  TARGET="$1"
else
  TARGET="staging-settings"
fi

tmp_log="$(mktemp)"
tmp_json="$(mktemp)"
cleanup() {
  rm -f "${tmp_log}" "${tmp_json}"
}
trap cleanup EXIT

cd "${ROOT_DIR}"

max_attempts=3
attempt=1

while true; do
  echo "Running CRE simulate for ${TARGET} (attempt ${attempt}/${max_attempts})..."
  if "${CRE_BIN}" workflow simulate my-workflow --target "${TARGET}" > "${tmp_log}" 2>&1; then
    break
  fi

  if [ "${attempt}" -ge "${max_attempts}" ]; then
    echo "CRE simulate failed for ${TARGET} after ${max_attempts} attempts." >&2
    exit 1
  fi

  attempt=$((attempt + 1))
  sleep 2
done

python3 - "${tmp_log}" "${tmp_json}" "${SNAPSHOT_PATH}" <<'PY'
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


def parse_output(text: str) -> dict | None:
    """Extract CRE workflow output from simulate output."""
    # Strategy 1: SENTINEL_OUTPUT_JSON= marker
    marker_matches = re.findall(r"SENTINEL_OUTPUT_JSON=(\{.*\})", text)
    if marker_matches:
        try:
            return json.loads(marker_matches[-1])
        except Exception:
            pass

    # Strategy 2: Parse the "Workflow Simulation Result:" block
    sim_match = re.search(r'Workflow Simulation Result:\s*"(.*)"', text, re.DOTALL)
    if sim_match:
        try:
            raw = sim_match.group(1)
            unescaped = raw.encode().decode("unicode_escape")
            return json.loads(unescaped)
        except Exception:
            pass

    # Strategy 3: Find any JSON object with expected CCIP keys
    decoder = json.JSONDecoder()
    required = {"sourceChain", "routerAddress", "lanes"}
    for idx in range(len(text)):
        if text[idx] != "{":
            continue
        try:
            obj, _ = decoder.raw_decode(text[idx:])
        except Exception:
            continue
        if isinstance(obj, dict) and required.issubset(obj.keys()):
            return obj

    return None


log_path = Path(sys.argv[1])
tmp_json_path = Path(sys.argv[2])
snapshot_path = Path(sys.argv[3])

text = log_path.read_text(encoding="utf-8", errors="replace")
parsed = parse_output(text)

if not parsed:
    print("ERROR: Could not find SENTINEL_OUTPUT_JSON marker in CRE output.", file=sys.stderr)
    raise SystemExit(1)

snapshot = {
    "generated_at_utc": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    "chain_name": parsed.get("sourceChain", "unknown"),
    "source": "cre_simulate",
    **parsed,
}

snapshot_path.parent.mkdir(parents=True, exist_ok=True)
tmp_json_path.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
tmp_json_path.replace(snapshot_path)
print(f"Wrote CCIP lane health snapshot to {snapshot_path}")
PY
