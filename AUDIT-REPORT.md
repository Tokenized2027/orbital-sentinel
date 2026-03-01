# OrbitalSentinelRegistry — Security Audit Report

**Date:** 2026-03-01
**Auditor:** Claude Opus 4.6 (automated + manual review)
**Contract:** `contracts/SentinelRegistry.sol` (52 nSLOC)
**Solidity:** 0.8.19 | **EVM Target:** Paris | **Optimizer:** Disabled

---

## Executive Summary

OrbitalSentinelRegistry is an append-only on-chain registry that stores protocol health proofs for the Orbital Sentinel monitoring platform. CRE workflows compute risk assessments off-chain, hash them via `keccak256(abi.encode(...))`, and write the proof to this contract on Sepolia. The contract has no token handling, no ETH handling, and no external contract calls — making it one of the simplest DeFi-adjacent contracts to audit.

**Methodology:**
- Manual line-by-line review of all 52 nSLOC
- Slither v0.11.5 — 8 targeted detectors
- Aderyn v0.6.8 — 88 detectors
- 7 fuzz test functions at 10,000 iterations each
- 17 unit tests verified passing

**Result:** 4 findings fixed. 3 findings documented (Info-level, unfixable design tradeoffs). No Critical or High severity issues.

---

## Findings Summary

| ID | Severity | Status | Description |
|----|----------|--------|-------------|
| F-1 | Medium | **FIXED** | No access control — added `owner` + `onlyOwner` modifier |
| F-2 | Low | ACKNOWLEDGED | Unbounded `records[]` array growth |
| F-3 | Low | **FIXED** | No duplicate prevention — added `mapping(bytes32 => bool) recorded` |
| F-4 | Low | **FIXED** | Unspecific Solidity pragma (`^0.8.19` -> `0.8.19`) |
| F-5 | Info | **FIXED** | No `riskLevel` validation — added non-empty check |
| F-6 | Info | ACKNOWLEDGED | Optimizer disabled (Sepolia testnet, acceptable) |
| F-7 | Info | ACKNOWLEDGED | No upgrade path (non-upgradeable contract) |

---

## Detailed Findings

### F-1: No Access Control [Medium — FIXED]

**Location:** `SentinelRegistry.sol:29` (original), now `SentinelRegistry.sol:54`

**Description:** `recordHealth()` was fully permissionless. Any EOA or contract could write arbitrary records to the registry, polluting it with fake health proofs.

**Fix:** Added `owner` state variable, `onlyOwner` modifier, and `transferOwnership()` function. The deployer is set as owner in the constructor. Only the owner can call `recordHealth()`. Custom error `NotOwner()` used for gas efficiency.

```solidity
address public owner;
modifier onlyOwner() {
    if (msg.sender != owner) revert NotOwner();
    _;
}
constructor() { owner = msg.sender; }
function recordHealth(...) external onlyOwner { ... }
```

---

### F-2: Unbounded Array Growth [Low — Acknowledged]

**Location:** `SentinelRegistry.sol:20`

**Description:** The `records` array grows indefinitely with no cap or pruning. Each record costs ~20,000 gas for the SSTORE, and `count()` / `latest()` are both O(1), so there's no immediate gas concern. However, the storage footprint grows linearly forever.

**Impact:** Negligible on Sepolia. On mainnet, storage costs would accumulate (~$0.50 per record at typical gas prices).

**Recommendation:** For production, consider a ring buffer (fixed-size with modular index) or emit-only pattern (events + off-chain indexing, no `records[]` array).

---

### F-3: No Duplicate Hash Prevention [Low — FIXED]

**Location:** `SentinelRegistry.sol:30` (original), now `SentinelRegistry.sol:55`

**Description:** The same `snapshotHash` could be recorded multiple times. The `record-all-snapshots.mjs` script used `.last-write-state.json` to prevent duplicates at the application layer, but the contract had no on-chain guard.

**Fix:** Added `mapping(bytes32 => bool) public recorded` and a check before recording:

```solidity
if (recorded[snapshotHash]) revert AlreadyRecorded();
recorded[snapshotHash] = true;
```

---

### F-4: Unspecific Solidity Pragma [Low — FIXED]

**Location:** `SentinelRegistry.sol:2`

**Description:** `pragma solidity ^0.8.19;` allows compilation with any 0.8.x version >= 19.

**Fix:** Pinned to `pragma solidity 0.8.19;` to match `foundry.toml` configuration.

---

### F-5: No riskLevel Validation [Info — FIXED]

**Location:** `SentinelRegistry.sol:29` (original), now `SentinelRegistry.sol:56`

**Description:** The `riskLevel` parameter accepted any string, including empty strings. Since the actual format is prefixed (e.g., `treasury:ok`, `morpho:critical`), full enum validation would be impractical. A non-empty check prevents obviously invalid records.

**Fix:** Added empty string check:

```solidity
if (bytes(riskLevel).length == 0) revert EmptyRiskLevel();
```

---

### F-6: Optimizer Disabled [Info — Acknowledged]

**Location:** `foundry.toml:4`

**Description:** `optimizer = false` results in higher gas costs. Irrelevant for Sepolia testnet.

---

### F-7: No Upgrade Path [Info — Acknowledged]

**Description:** Not upgradeable. Acceptable for hackathon. For production, consider UUPS proxy.

---

## Static Analysis Results

### Slither v0.11.5

8 targeted detectors: `reentrancy-eth`, `reentrancy-no-eth`, `arbitrary-send-erc20`, `unchecked-transfer`, `locked-ether`, `suicidal`, `uninitialized-state`, `tx-origin`.

**Result:** 0 findings. Clean.

### Aderyn v0.6.8

88 detectors across all severity categories.

**Pre-fix result:** 0 High, 1 Low (unspecific pragma).
**Post-fix result:** 0 High, 2 Low (centralization risk + address(0) in transferOwnership — both by-design).

The centralization risk finding (L-1) is the intended result of fixing F-1 — having an owner is the whole point. The address(0) finding (L-2) is the intentional renounce ownership pattern.

---

## Fuzz Testing Results

| Test | Fuzz Runs | Result | What It Verifies |
|------|-----------|--------|------------------|
| `testFuzz_recordHealth_storesCorrectly` | 10,000 | PASS | Any unique hash + non-empty risk stores and retrieves correctly |
| `testFuzz_latest_alwaysReturnsMostRecent` | 10,000 | PASS | `latest()` always returns the most recent record |
| `testFuzz_count_matchesRecordCalls` | 10,000 | PASS | `count()` equals number of `recordHealth()` calls |
| `testFuzz_nonOwner_alwaysReverts` | 10,000 | PASS | Non-owner always blocked from recording |
| `testFuzz_duplicateHash_reverts` | 10,000 | PASS | Duplicate hashes always revert |
| `testFuzz_emptyRiskLevel_reverts` | 10,000 | PASS | Empty risk level always reverts |
| `testFuzz_transferOwnership` | 10,000 | PASS | Ownership transfer works correctly for any address |

**Total:** 70,000 fuzz iterations. 0 failures.

---

## Unit Testing Results

| Test | Result | What It Verifies |
|------|--------|------------------|
| `test_owner_isDeployer` | PASS | Deployer is initial owner |
| `test_transferOwnership` | PASS | Owner can transfer ownership |
| `test_transferOwnership_revertsForNonOwner` | PASS | Non-owner cannot transfer |
| `test_renounceOwnership` | PASS | Owner can renounce to address(0) |
| `test_recordHealth_emitsEvent` | PASS | `HealthRecorded` event emitted correctly |
| `test_recordHealth_revertsForNonOwner` | PASS | Non-owner blocked from recording |
| `test_recordHealth_revertsDuplicate` | PASS | Duplicate hash reverts |
| `test_recorded_tracksHashes` | PASS | `recorded` mapping tracks stored hashes |
| `test_recordHealth_revertsEmptyRiskLevel` | PASS | Empty risk level reverts |
| `test_recordHealth_acceptsPrefixedRiskLevel` | PASS | Prefixed risk levels work (e.g., "treasury:ok") |
| `test_count_startsAtZero` | PASS | Fresh contract starts at 0 |
| `test_count_incrementsAfterRecord` | PASS | Count increments correctly |
| `test_latest_revertsWhenEmpty` | PASS | `latest()` reverts when empty |
| `test_latest_returnsLastRecord` | PASS | Returns most recent record |
| `test_recordHealth_storesRecorder` | PASS | Correct recorder address |
| `test_recordHealth_differentRiskLevels` | PASS | All three risk levels stored correctly |
| `test_records_accessByIndex` | PASS | Index-based access returns correct data |

**Total:** 17 unit tests. 0 failures.

---

## Architecture Assessment

### Strengths
1. **Simplicity** — 52 nSLOC leaves minimal surface for bugs.
2. **Access control** — Only the owner can write records, preventing spam.
3. **Duplicate prevention** — On-chain dedup guard prevents redundant writes.
4. **Input validation** — Empty risk levels rejected.
5. **Correct event emission** — `HealthRecorded` indexed by `snapshotHash` + `OwnershipTransferred` for ownership changes.
6. **Immutable proof chain** — once recorded, proofs cannot be modified or deleted.
7. **No funds at risk** — no tokens, no ETH, eliminates most dangerous vulnerability classes.
8. **Gas-efficient errors** — custom errors (`NotOwner`, `AlreadyRecorded`, `EmptyRiskLevel`) save gas vs `require` strings.

### Remaining Limitations
1. **Unbounded storage** — `records[]` grows forever (F-2, acceptable for Sepolia).
2. **No upgradeability** — redeployment needed for bug fixes (F-7, acceptable for hackathon).

---

## Recommendations

### Pre-Deployment (Complete)
1. ~~**Redeploy to Sepolia**~~ — **DONE.** Redeployed to `0xE5B1b708b237F9F0F138DE7B03EEc1Eb1a871d40` with all fixes active. All 30 downstream references updated (scripts, configs, dashboard, docs).

### For Production Hardening (Recommended)
2. **Use an enum for risk levels** — Replace `string riskLevel` with `enum RiskLevel` to save gas.
3. **Consider emit-only pattern** — Remove `records[]` array, rely on event logs + off-chain indexing.
4. **Add upgradeability** — UUPS proxy pattern for future bug fixes.

---

## Files Modified During Audit

| File | Change |
|------|--------|
| `contracts/SentinelRegistry.sol` | Added owner + onlyOwner, duplicate prevention, riskLevel validation, pinned pragma |
| `contracts/test/SentinelRegistry.t.sol` | Updated with 17 unit tests covering access control, dedup, validation |
| `contracts/test/SentinelRegistry.Fuzz.t.sol` | Updated with 7 fuzz test functions covering all new guards |

---

## Conclusion

Four findings were fixed during this audit: access control (F-1), duplicate prevention (F-3), pragma pinning (F-4), and input validation (F-5). The remaining findings are Info-level design tradeoffs acceptable for a hackathon demo on Sepolia.

The contract is now significantly hardened — only the owner can write records, duplicates are rejected on-chain, and empty inputs are blocked. The audited version is deployed on Sepolia at `0xE5B1b708b237F9F0F138DE7B03EEc1Eb1a871d40` with all fixes active.

**24 tests passing (17 unit + 7 fuzz). 70,000 fuzz iterations. 0 failures.**
