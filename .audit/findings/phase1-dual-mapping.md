# Phase 1: Dual Mapping

## 1A: Function-State Matrix

### SentinelRegistry.sol (On-Chain)

| Function | Entry? | State Reads | State Writes | Guards | External Calls |
|----------|--------|-------------|--------------|--------|----------------|
| `constructor()` | Deploy | - | `owner` | None | - |
| `transferOwnership(address)` | External | `owner` | `pendingOwner` | `onlyOwner` | - |
| `acceptOwnership()` | External | `pendingOwner`, `owner` | `owner`, `pendingOwner` | `msg.sender == pendingOwner` | - |
| `recordHealth(bytes32, string)` | External | `recorded[hash]` | `recorded[hash]`, `records[]` | `onlyOwner`, `!recorded`, `len>0`, `len<=256` | - |
| `count()` | External view | `records.length` | - | None | - |
| `latest()` | External view | `records[]`, `records.length` | - | `require(length>0)` | - |

### cre_analyze_endpoint.py (AI Proxy)

| Function | Entry? | State Reads | State Writes | Guards | External Calls |
|----------|--------|-------------|--------------|--------|----------------|
| `_check_auth()` | Internal | `_CRE_SECRET`, headers | - | timing-safe compare | - |
| `analyze()` | POST /api/cre/analyze | request body | - | `_check_auth()` | Anthropic API |
| `analyze_arb()` | POST /api/cre/analyze-arb | request body | - | `_check_auth()` | OpenAI API |
| `analyze_composite()` | POST /api/cre/analyze-composite | request body | - | `_check_auth()` | OpenAI API |
| `analyze_bridge()` | POST /api/cre/analyze-bridge | request body | - | `_bridge_check_auth()` | OpenAI API |
| `_bridge_check_auth()` | Internal | `CRE_SECRET` env | - | timing-safe compare | - |

### record-all-snapshots.mjs (Proof Bridge)

| Function | Entry? | State Reads | State Writes | Guards | External Calls |
|----------|--------|-------------|--------------|--------|----------------|
| `main()` | Script entry | snapshot JSONs, state file | state file | - | Sepolia RPC, PostgreSQL |
| `readSnapshot(file)` | Internal | filesystem | - | - | - |
| `writeOnChain(hash, risk)` | Internal | - | - | - | Sepolia writeContract |
| `insertRecord(...)` | Internal | - | PostgreSQL | - | pg.Pool.query |
| `loadState()` | Internal | state file | - | - | - |
| `saveState(state)` | Internal | - | state file | - | - |

### CRE Workflows (8x main.ts)

| Function Pattern | State Reads | State Writes | Guards | External Calls |
|-----------------|-------------|--------------|--------|----------------|
| `onCron()` | runtime.config | - | CRE SDK scheduling | EVMClient (mainnet reads) |
| `readPoolMetrics()` etc. | - | - | - | EVMClient.callContract |
| `fetchAIAnalysis()` | - | - | - | HTTPClient.sendRequest |
| Registry write section | - | - | - | EVMClient.callContract (Sepolia) |

## 1B: Coupled State Dependency Map

### What must change when X changes?

| When This Changes | These Must Also Update |
|-------------------|----------------------|
| `owner` in SentinelRegistry | All scripts using PRIVATE_KEY must use the new owner's key |
| PRIVATE_KEY in .env | CRE_ETH_PRIVATE_KEY must match (same key, different format) |
| Snapshot `generated_at_utc` | Hash changes -> new on-chain record (by design) |
| Workflow risk thresholds in config | `extractRisk()` in record-all-snapshots.mjs must match |
| SentinelRegistry address | All workflow configs, dashboard, scripts must update |
| CRE_ANALYZE_SECRET | AI endpoint and all workflow configs must match |
| DATABASE_URL | Dashboard and record-all-snapshots.mjs must match |
| AI model versions (claude-haiku-4-5, gpt-5.3-codex) | Prompt behavior may change, affecting risk assessments |

### Critical Couplings:

1. **Risk level encoding mismatch**: Workflows compute risk levels using one set of thresholds. `record-all-snapshots.mjs` re-derives risk using its own `extractRisk()` functions. If these diverge, the on-chain proof misrepresents the workflow's assessment.

2. **Hash encoding consistency**: Each workflow computes `snapshotHash` using `encodeAbiParameters` with a specific schema. `record-all-snapshots.mjs` computes hashes with DIFFERENT schemas (more fields, different types). These are INDEPENDENT hash computations -- they never need to match. But if a workflow writes on-chain AND the bridge also writes, you get two different hashes for the same snapshot.

3. **Timestamp source inconsistency**: Workflows use `Date.now()` for timestamps. `record-all-snapshots.mjs` uses `generated_at_utc` from snapshot files. These are different timestamps for the same data, producing different hashes.

## 1C: Cross-Reference (Overlay Gaps)

### Gap 1: Dual On-Chain Write Path
Both CRE workflows AND `record-all-snapshots.mjs` can write to SentinelRegistry. They compute DIFFERENT hashes for the same data (different ABI parameter schemas). This means:
- The `AlreadyRecorded` dedup check does NOT prevent both from writing
- Same workflow run can produce two on-chain records with different hashes
- **Risk**: Record inflation, misleading count/history

### Gap 2: Bridge Auth Check Inconsistency
`_check_auth()` (main endpoints) is fail-closed: no secret = reject all.
`_bridge_check_auth()` is fail-OPEN: no CRE_SECRET = accept all.
**Risk**: Bridge endpoint is unauthenticated by default.

### Gap 3: No Integrity Check on Snapshot Files
`record-all-snapshots.mjs` reads JSON files from disk with zero integrity validation. No checksums, no signatures, no file ownership checks. Any process with write access to the intelligence/data directory can inject false data that gets committed on-chain.

### Gap 4: Token Flows Hardcodes "flows:ok" Risk
`token-flows/main.ts` line 303 always writes `flows:ok` regardless of actual balance data. No risk classification is applied.

### Gap 5: CCIP Workflow Missing Registry Write
`ccip-lane-health/main.ts` does NOT write to SentinelRegistry on-chain (unlike all other workflows). It only outputs JSON. The bridge script handles CCIP proofs instead.
