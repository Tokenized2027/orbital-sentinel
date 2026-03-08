#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SNAPSHOT_PATH="${SNAPSHOT_PATH:-${ROOT_DIR}/../../intelligence/data/sentinel_governance_snapshot.json}"
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
  TARGETS=("staging-settings")
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
    # Strategy 1: SENTINEL_OUTPUT_JSON= marker (may be truncated for large payloads)
    marker_matches = re.findall(r"SENTINEL_OUTPUT_JSON=(\{.*\})", text)
    if marker_matches:
        try:
            return json.loads(marker_matches[-1])
        except Exception:
            pass

    # Strategy 2: Parse the "Workflow Simulation Result:" block (always complete)
    sim_match = re.search(r'Workflow Simulation Result:\s*"(.*)"', text, re.DOTALL)
    if sim_match:
        try:
            raw = sim_match.group(1)
            # CRE wraps in quotes with \n escapes — unescape
            unescaped = raw.encode().decode("unicode_escape")
            return json.loads(unescaped)
        except Exception:
            pass

    # Strategy 3: Find any JSON object with expected keys
    decoder = json.JSONDecoder()
    required = {"timestamp", "proposals", "summary"}
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


tmp_json_path = Path(sys.argv[1])
snapshot_path = Path(sys.argv[2])
raw_paths = [Path(p) for p in sys.argv[3:]]

parsed_output = None
for raw_path in raw_paths:
    text = raw_path.read_text(encoding="utf-8", errors="replace")
    parsed = parse_output(text)
    if parsed:
        parsed_output = parsed
        break

if not parsed_output:
    raise SystemExit("Could not find structured workflow output (SENTINEL_OUTPUT_JSON marker)")

snapshot = {
    "generated_at_utc": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    "source": "cre_simulate",
    "proposals": parsed_output.get("proposals", []),
    "forumTopics": parsed_output.get("forumTopics", []),
    "summary": parsed_output.get("summary", {}),
}

snapshot_path.parent.mkdir(parents=True, exist_ok=True)
tmp_json_path.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
tmp_json_path.replace(snapshot_path)
print(f"Wrote governance snapshot to {snapshot_path}")
PY
