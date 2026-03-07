# Phase 3: State Inconsistency (Pass 2)

## 3A: Mutation Matrix

### SentinelRegistry.sol State Variables

| State Variable | Modified By | Read By |
|---------------|-------------|---------|
| `owner` | `constructor()`, `acceptOwnership()` | `onlyOwner` modifier, `transferOwnership()` |
| `pendingOwner` | `transferOwnership()`, `acceptOwnership()` | `acceptOwnership()` |
| `records[]` | `recordHealth()` | `records(uint)`, `latest()`, `count()` |
| `recorded[bytes32]` | `recordHealth()` | `recordHealth()` |

**Analysis**: All state mutations are properly guarded. No function modifies two independent state variables in an inconsistent order. The `recordHealth()` function updates both `recorded[hash]` and `records[]` atomically in the same transaction. SOUND.

### cre_analyze_endpoint.py State

This is a stateless Flask server. No persistent state mutations. Each request is independent. SOUND.

### record-all-snapshots.mjs State

| State | Modified By | Read By |
|-------|-------------|---------|
| `.last-write-state.json` | `saveState()` at end of main() | `loadState()` at start of main() |
| PostgreSQL `sentinel_records` | `insertRecord()` | Dashboard queries |
| SentinelRegistry on-chain | `writeOnChain()` | Dashboard reads |

**Analysis**: State file is saved AFTER all workflows are processed. If the script crashes mid-execution:
- Some workflows may have written on-chain but the state file doesn't reflect it
- On next run, the script reads the old state, sees the snapshot hasn't changed (same `generated_at_utc`), and SKIPS
- This means the DB insert might be missed for workflows that wrote on-chain before the crash
- **Gap**: On-chain record exists but DB record may not. Dashboard shows incomplete data.
- **Mitigation**: `AlreadyRecorded` prevents double on-chain write on retry. But DB gap persists.

## 3B: Parallel Path Comparison

### Risk Level Derivation: Workflow vs Bridge

For each workflow, I compare the risk logic in the CRE workflow main.ts vs the extractRisk() in record-all-snapshots.mjs:

#### Treasury Risk
- **Workflow** (treasury-risk/main.ts:530): `worstRisk(community.risk, operator.risk, rewards.risk, morphoRisk, queueRisk)` -- considers 5 factors
- **Bridge** (record-all-snapshots.mjs:97): `d.overallRisk ?? 'ok'` -- reads the pre-computed overall risk from snapshot
- **Consistent?**: YES -- bridge reads the workflow's own computed risk. SOUND.

#### Price Feeds
- **Workflow** (price-feeds/main.ts:299-300): `depegBps <= 100 ? 'healthy' : depegBps <= 300 ? 'warning' : 'critical'`
- **Bridge** (record-all-snapshots.mjs:123-128): Maps 'healthy'/'ok' -> 'ok', 'warning' -> 'warning', 'critical' -> 'critical'
- **Consistent?**: YES. SOUND.

#### Governance
- **Workflow** (governance-monitor/main.ts:343): `urgentProposals.length > 0 ? 'warning' : 'ok'`
- **Bridge** (record-all-snapshots.mjs:148): `d.summary?.urgentProposals > 0 ? 'warning' : 'ok'`
- **Consistent?**: YES. SOUND.

#### Morpho
- **Workflow** (morpho-vault-health/main.ts:343): `util > 0.95 ? 'critical' : util > 0.85 ? 'warning' : 'ok'`
- **Bridge** (record-all-snapshots.mjs:196-198): Same thresholds.
- **Consistent?**: YES. SOUND.

#### Curve Pool
- **Workflow** (curve-pool/main.ts:285-289): Uses config thresholds (default: warning=15, critical=30)
- **Bridge** (record-all-snapshots.mjs:226-229): Hardcoded `imbalance > 30 ? 'critical' : imbalance > 15 ? 'warning' : 'ok'`
- **Consistent?**: YES if config uses defaults. If config thresholds are changed, they DIVERGE. **SUSPECT** (S-ST-01).

#### CCIP
- **Workflow** (ccip-lane-health/main.ts): Does NOT write to registry.
- **Bridge** (record-all-snapshots.mjs:259): `d.metadata?.pausedCount > 0 ? 'warning' : 'ok'`
- **Consistent?**: N/A -- only bridge writes. But the bridge uses a simplified risk check (only paused lanes). Does not account for rate limiter risk or unconfigured lanes. **SUSPECT** (S-ST-02).

#### LAA
- **Workflow** (link-ai-arbitrage/main.ts:421): writes `laa:${signal}` (execute/wait/unprofitable/etc.)
- **Bridge** (record-all-snapshots.mjs:76-81): Maps signal to risk: execute->ok, unprofitable/pool_closed/no_stlink->warning, wait->ok
- **Consistent?**: PARTIALLY. The workflow writes the raw signal. The bridge writes a risk interpretation. These encode different information. Two different hashes, two different on-chain records. But since the hashes are different, both can be written without conflict. **SUSPECT** (S-ST-03) -- confusing dual records.

#### Token Flows
- **Workflow** (token-flows/main.ts:303): Always writes `flows:ok`.
- **Bridge**: No extractRisk for token-flows (not in the WORKFLOWS array in bridge).
- Wait -- let me verify...

Actually, checking record-all-snapshots.mjs more carefully: the WORKFLOWS array does NOT include token-flows. It has: laa, treasury, feeds, governance, morpho, curve, ccip, composite (8 total). Token flows is NOT bridged. Only the CRE workflow itself writes on-chain (always "ok"). This is a gap.

## 3C: Operation Ordering

### SentinelRegistry.recordHealth()
```
1. Check recorded[hash] -> revert if duplicate
2. Set recorded[hash] = true
3. Push to records[]
4. Emit event
```
Ordering is correct. The duplicate check happens BEFORE state mutation. No reentrancy vector (no external calls). SOUND.

### acceptOwnership()
```
1. Check msg.sender == pendingOwner
2. Emit OwnershipTransferred(owner, pendingOwner)
3. Set owner = pendingOwner
4. Set pendingOwner = address(0)
```
Event emitted before state change -- unconventional but safe (no reentrancy). The event reads old owner and pendingOwner correctly. SOUND.

### record-all-snapshots.mjs main()
```
1. Load state from file
2. For each workflow:
   a. Read snapshot
   b. Check if changed (compare generated_at_utc with saved state)
   c. Compute hash and risk
   d. Write on-chain
   e. Wait for receipt
   f. Insert into DB
   g. Update in-memory state
3. Save state file (once, at end)
```

**Gap**: Step 3 happens AFTER all workflows. If step 2d succeeds for workflow A but 2f fails, and then the script crashes before step 3, the state file still has the old timestamp for workflow A. On next run, it will try to write A again, hitting `AlreadyRecorded`. This is handled gracefully (skip). But the DB still lacks A's record.

## 3D: Feynman-Enriched Targets

From Pass 1, the key suspects to investigate further:

1. **V-PY-01 (Bridge fail-open auth)**: This is the highest-severity finding. The bridge endpoint accepts ALL requests when CRE_SECRET is not set. Need to verify if CRE_SECRET is actually set in production.

2. **S-BR-01 (No snapshot integrity)**: Combined with the disk-based trust model, this creates a chain: any process that can write to the intelligence/data directory can manipulate what gets committed on-chain.

3. **S-WF-01 (Stale prices)**: Combined with the AI analysis endpoint, stale prices could cause the AI to produce incorrect risk assessments.

4. **S-ST-01 (Curve threshold divergence)**: If curve pool thresholds are customized in the workflow config but the bridge uses hardcoded values, the on-chain proof from the bridge could show a different risk level than what the workflow actually computed.

## New Finding from State Analysis

### S-ST-04: Private Key Exposed in .env Comment
File: `/home/avi/orbital-sentinel/.env`, line 7
The .env file contains a comment: "Rotated 2026-03-03 (old key was exposed in public repo)"
The CURRENT key is: `0x757d82342cad485884be834f8fec2ac326beaa311126cd5cf276b69b36c5c7e2`
While .env is gitignored, this key is the Sepolia deployer. If this file is ever accidentally committed or leaked, the registry owner is compromised.

### S-ST-05: CRE_ETH_PRIVATE_KEY is same key in different format
Line 9 duplicates the private key without the 0x prefix. Two copies of the same secret in one file increases exposure surface.

### S-ST-06: Database URL contains plaintext password
Line 18: `postgresql://devuser:Mbwet%2FF%2F7ENsFDXOgd8HJOOC1JJwQsL5@localhost:5432/sdl_analytics`
The password is URL-encoded but plaintext in the file. Standard practice for .env files, but worth noting.
