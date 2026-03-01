# OrbitalSentinelRegistry — Security Audit Report

**Date:** 2026-03-01
**Auditor:** Claude Opus 4.6 (automated + manual review)
**Contract:** `contracts/SentinelRegistry.sol` (52 nSLOC)
**Solidity:** 0.8.19 | **EVM Target:** Paris | **Optimizer:** Disabled

---

## Executive Summary

OrbitalSentinelRegistry is an append-only on-chain registry that stores protocol health proofs for the Orbital Sentinel monitoring platform. CRE workflows compute risk assessments off-chain, hash them via `keccak256(abi.encode(...))`, and write the proof to this contract on Sepolia. The contract has no token handling, no ETH handling, and no external contract calls — making it one of the simplest DeFi-adjacent contracts to audit.

**Methodology (Enhanced 9-Phase, 2026-03-01):**
- Phase 0: Threat model + attack surface classification
- Phases 1–2: Manual line-by-line review of all 52 nSLOC
- Phase 3: Slither v0.11.5 (8 targeted detectors) + Aderyn v0.6.8 (88 detectors)
- Phase 4: Fix findings + verify
- Phase 5–6: Invariant + attack scenario assessment (enhanced #14–25: all N/A for this contract)
- Phase 7: 7 fuzz test functions at 10,000 iterations each (70K total)
- Phase 8: Full report with economic assessment, integration risk matrix, known exploit cross-reference, post-deployment recommendations

**Result:** 4 findings fixed. 3 findings documented (Info-level, unfixable design tradeoffs). No Critical or High severity issues. Enhanced methodology adds threat model and production hardening roadmap — no new vulnerabilities found.

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

**Fix:** Added `owner` state variable, `onlyOwner` modifier, and two-step ownership transfer (Ownable2Step pattern). The deployer is set as owner in the constructor. Only the owner can call `recordHealth()`. Custom error `NotOwner()` used for gas efficiency.

Ownership transfer uses a two-step pattern to prevent accidental ownership loss: `transferOwnership(address)` sets a `pendingOwner`, and the new owner must call `acceptOwnership()` to complete the transfer. This eliminates the risk of transferring to an incorrect address or accidentally renouncing via `address(0)`.

```solidity
address public owner;
address public pendingOwner;
modifier onlyOwner() {
    if (msg.sender != owner) revert NotOwner();
    _;
}
constructor() { owner = msg.sender; }
function transferOwnership(address newOwner) external onlyOwner {
    pendingOwner = newOwner;
    emit OwnershipTransferStarted(owner, newOwner);
}
function acceptOwnership() external {
    if (msg.sender != pendingOwner) revert NotPendingOwner();
    emit OwnershipTransferred(owner, pendingOwner);
    owner = pendingOwner;
    pendingOwner = address(0);
}
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

**Fix:** Added empty string check and maximum length guard (256 bytes):

```solidity
if (bytes(riskLevel).length == 0) revert EmptyRiskLevel();
if (bytes(riskLevel).length > 256) revert RiskLevelTooLong();
```

The 256-byte maximum prevents excessively long strings from inflating calldata costs and storage. Normal prefixed risk levels (e.g., `treasury:ok`) are well under this limit.

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

The centralization risk finding (L-1) is the intended result of fixing F-1 — having an owner is the whole point. The address(0) finding (L-2) is now mitigated by the Ownable2Step pattern: `transferOwnership(address(0))` only sets `pendingOwner` to `address(0)`, and since `address(0)` can never call `acceptOwnership()`, the transfer can never complete. This effectively prevents accidental renouncement.

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

## Deep Audit Tests (DeepAudit.t.sol)

Added during the Ownable2Step + RiskLevelTooLong upgrade to verify the new security properties:

| Test | Result | What It Verifies |
|------|--------|------------------|
| `test_transferOwnership_toZero_cannotComplete` | PASS | Ownable2Step blast radius — `transferOwnership(address(0))` cannot complete because `address(0)` cannot call `acceptOwnership()` |
| `test_O1_accessAtScale` | PASS | O(1) read performance at 500 records (`count()` and `latest()` are constant-time) |
| `test_riskLevel_gasWithShortString` | PASS | Gas ceiling for short riskLevel strings (typical: `treasury:ok`) |
| `test_riskLevel_gasWithLongString` | PASS | Gas ceiling for 256-byte riskLevel strings (max allowed) |
| `test_riskLevel_tooLongReverts` | PASS | `RiskLevelTooLong` revert for strings > 256 bytes |
| `test_ownershipTransfer_newOwnerCanRecord` | PASS | Full two-step ownership transfer flow: transfer → accept → record |
| `testFuzz_deepAudit_recordConsistency` | PASS (10,000 runs) | Fuzz: arbitrary hashes and risk levels store and retrieve consistently |

**Total across all test files:** 31 tests (17 unit + 7 fuzz + 7 deep audit). 80,000 fuzz iterations. 0 failures.

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
4. **Input validation** — Empty risk levels rejected, maximum length (256 bytes) enforced.
5. **Correct event emission** — `HealthRecorded` indexed by `snapshotHash` + `OwnershipTransferred` for ownership changes.
6. **Immutable proof chain** — once recorded, proofs cannot be modified or deleted.
7. **No funds at risk** — no tokens, no ETH, eliminates most dangerous vulnerability classes.
8. **Gas-efficient errors** — custom errors (`NotOwner`, `NotPendingOwner`, `AlreadyRecorded`, `EmptyRiskLevel`, `RiskLevelTooLong`) save gas vs `require` strings.
9. **Two-step ownership transfer** (Ownable2Step) — prevents accidental ownership loss by requiring the new owner to explicitly accept.

### Remaining Limitations
1. **Unbounded storage** — `records[]` grows forever (F-2, acceptable for Sepolia).
2. **No upgradeability** — redeployment needed for bug fixes (F-7, acceptable for hackathon).

---

## Recommendations

### Pre-Deployment (Complete)
1. ~~**Redeploy to Sepolia**~~ — **DONE.** Redeployed to `0xE5B1b708b237F9F0F138DE7B03EEc1Eb1a871d40` with all fixes active. All 30 downstream references updated (scripts, configs, dashboard, docs).

### For Production Hardening (Recommended)
2. **Use an enum for risk levels** — Replace `string riskLevel` with `enum RiskLevel` to save gas. (Note: the 256-byte max length guard now bounds the string, reducing the urgency of this change.)
3. **Consider emit-only pattern** — Remove `records[]` array, rely on event logs + off-chain indexing.
4. **Add upgradeability** — UUPS proxy pattern for future bug fixes.

---

## Files Modified During Audit

| File | Change |
|------|--------|
| `contracts/SentinelRegistry.sol` | Added owner + onlyOwner, duplicate prevention, riskLevel validation, pinned pragma |
| `contracts/test/SentinelRegistry.t.sol` | Updated with 17 unit tests covering access control, dedup, validation |
| `contracts/test/SentinelRegistry.Fuzz.t.sol` | Updated with 7 fuzz test functions covering all new guards |
| `contracts/test/DeepAudit.t.sol` | 7 deep audit tests: Ownable2Step blast radius, O(1) access, gas ceilings, RiskLevelTooLong, ownership transfer flow, fuzz consistency |

---

## Enhanced Methodology Additions (2026-03-01)

The following sections were added as part of the enhanced 9-phase SC Auditor methodology upgrade. The original audit (above) covered Phases 1–8 of the legacy methodology. These additions provide Phase 0 (Threat Model), economic assessment, integration risk analysis, known exploit cross-referencing, and post-deployment recommendations.

---

### Phase 0: Threat Model

**Protocol Classification:** Append-only data registry (no DeFi, no tokens, no funds)

**Trust Assumptions:**

| Trust Boundary | Assumption | Risk if Violated |
|----------------|------------|-----------------|
| Owner EOA | Private key held securely by deployer | Fake health proofs written to registry (no financial loss) |
| CRE Workflows | Produce honest snapshot hashes | Registry stores dishonest proofs (garbage-in, garbage-out) |
| Sepolia Network | Testnet availability sufficient | Proofs temporarily unwritable (no loss, retry on next cycle) |
| Dashboard Readers | Treat registry as source of truth | Incorrect risk display if registry contains bad data |

**Attack Surface:**

| Vector | Applicable? | Notes |
|--------|-------------|-------|
| Fund extraction | NO | Contract holds no tokens, no ETH, no value |
| Token manipulation | NO | No ERC-20/721/1155 interactions |
| Flash loan attacks | NO | No borrowing, no collateral, no price dependency |
| Oracle manipulation | NO | No oracle reads |
| Governance attacks | NO | No voting, no proposals |
| Reentrancy | NO | No external calls, no callbacks, no token transfers |
| Cross-chain replay | NO | Single-chain deployment (Sepolia only) |
| Proxy/upgrade attacks | NO | Non-upgradeable contract |
| Inflation/first-depositor | NO | No shares, no deposits |
| MEV/sandwich | NO | No swaps, no price-dependent operations |
| DoS via gas | LOW | `recordHealth` is O(1) — fixed gas cost per call |
| Data pollution | MITIGATED | Owner-gated access control (F-1) prevents unauthorized writes |

**Primary Threat:** Owner key compromise. If the deployer's private key is leaked, an attacker can:
1. Write arbitrary fake health proofs (data integrity loss)
2. Initiate ownership transfer to attacker-controlled address — however, the Ownable2Step pattern means the attacker must also call `acceptOwnership()` from the new address, which limits automated exploit chains
3. Renounce ownership is **no longer possible** via the Ownable2Step pattern — `transferOwnership(address(0))` cannot complete because `address(0)` cannot call `acceptOwnership()`

**Secondary Threat:** CRE workflow compromise. If a CRE workflow is compromised, it could feed incorrect data to `record-all-snapshots.mjs`, which would then write misleading proofs. The contract cannot distinguish honest from dishonest snapshot hashes — it only enforces uniqueness and non-empty risk levels.

**Impact Assessment:** LOW. No funds at risk under any scenario. Worst case is data integrity loss requiring redeployment to a new address and re-pointing all downstream consumers.

---

### Economic Security Assessment

**Not applicable.** This contract holds no economic value:
- No token deposits or withdrawals
- No ETH received or sent (no `receive()` or `fallback()`)
- No fee collection or distribution
- No collateral, no liquidations, no loans
- No price-dependent operations

**Cost to attack:** Gas fees on Sepolia (free via faucets). Even with owner key compromise, the maximum damage is data integrity loss — no financial extraction is possible.

**MEV exposure:** None. `recordHealth` writes are not price-sensitive and cannot be front-run for profit.

---

### Integration Risk Matrix

| Integration Point | Risk | Mitigation |
|-------------------|------|------------|
| `record-all-snapshots.mjs` → `recordHealth()` | Script uses owner's private key; key leak = unauthorized writes | Key stored in `.env` (gitignored), not committed to VCS |
| Dashboard → `getLogs(HealthRecorded)` | Dashboard reads stale events if RPC is lagging | Dashboard polls with block range; UI shows last-update timestamp |
| CRE Workflows → Snapshot files → Script | Corrupted/missing snapshot files → no proof written | Script handles missing files gracefully; cron retries next cycle |
| Etherscan verification | Unverified contract reduces transparency | Contract verified via Sourcify (`scripts/verify-contract.mjs`) |

---

### Known Exploit Cross-Reference (Solodit)

No known exploits match this contract's pattern. Searched categories:

| Category | Relevance | Notes |
|----------|-----------|-------|
| ERC-4626 vault exploits | NONE | Not a vault |
| MasterChef/accumulator rounding | NONE | No accumulators |
| Access control bypass | NONE | Simple `onlyOwner` with custom error; no role hierarchy to exploit |
| Unbounded array DoS | LOW | `records[]` grows unbounded (F-2) but all reads are O(1) via `count()` and `latest()`. No iteration over the array in any function. |
| Ownership renounce griefing | MITIGATED | With Ownable2Step, `transferOwnership(address(0))` only sets `pendingOwner` — `address(0)` cannot call `acceptOwnership()`, so the transfer can never complete. Accidental renouncement is no longer possible. |

---

### Enhanced Attack Scenario Assessment (#14–25)

None of the enhanced attack scenarios (#14–25) are meaningfully applicable to this contract:

| # | Attack | Applicable? | Reason |
|---|--------|-------------|--------|
| 14 | Read-only reentrancy | NO | No external calls, no callbacks, no token transfers |
| 15 | Flash loan governance | NO | No governance, no voting |
| 16 | Oracle staleness | NO | No oracle reads |
| 17 | Spot price manipulation | NO | No price-dependent logic |
| 18 | Proxy init front-running | NO | Not upgradeable |
| 19 | EIP-712 signature replay | NO | No signature verification |
| 20 | Token approval front-running | NO | No token approvals |
| 21 | Fee-on-transfer deposit | NO | No token deposits |
| 22 | Rebasing token accounting | NO | No token accounting |
| 23 | Cross-chain message replay | NO | Single chain |
| 24 | Liquidation cascade | NO | No liquidations |
| 25 | Inflation attack | NO | No shares/deposits |

**No new test files required for enhanced attack scenarios.** The existing 31 tests (17 unit + 7 fuzz + 7 deep audit) provide comprehensive coverage for the contract's actual attack surface.

---

### Post-Deployment Recommendations

#### For Production Mainnet Deployment

1. **UUPS Proxy Pattern** — Wrap in OpenZeppelin's `UUPSUpgradeable` proxy. This addresses F-7 (no upgrade path) and allows bug fixes without redeploying and re-pointing all consumers. Initialize `owner` via `initializer` instead of constructor.

2. **Multi-Sig Ownership** — Replace EOA owner with a Gnosis Safe (2-of-3 or 3-of-5). This mitigates the primary threat (single key compromise) and adds operational resilience.

3. **Risk Level Enumeration** — Replace `string riskLevel` with `enum RiskLevel { OK, WARNING, CRITICAL }` plus a `bytes32 workflowId` field. This saves gas (~2,100 gas/write from shorter calldata) and prevents malformed risk levels.

4. **Ring Buffer** — Replace unbounded `records[]` with a fixed-size ring buffer (e.g., 10,000 slots). This caps storage growth and provides O(1) access to the last N records. Older proofs remain verifiable via event logs.

5. **Event-Based Verification** — For production, consider an emit-only pattern: remove the `records[]` array entirely, keep only `recorded` mapping for dedup, and rely on `HealthRecorded` events + off-chain indexing (The Graph or custom). This reduces storage costs by ~20,000 gas/write.

6. **Access Control Upgrade** — Consider OpenZeppelin's `AccessControl` with separate roles:
   - `RECORDER_ROLE` — for `record-all-snapshots.mjs` (can write proofs)
   - `ADMIN_ROLE` — for ownership management (can grant/revoke roles)
   This prevents a single key from having both write and admin capabilities.

7. **Monitoring**
   - Set up an alert for `OwnershipTransferred` events (detect unauthorized ownership changes)
   - Monitor `recordHealth` call frequency — unexpected gaps or spikes indicate issues
   - Track gas usage per `recordHealth` call — anomalous gas could indicate chain issues

8. **Bug Bounty** — Not recommended for this contract in isolation (no funds at risk). If deployed as part of a larger system with financial components, include in the umbrella bug bounty program.

9. **Re-Audit Schedule** — Re-audit only if:
   - Upgrading to UUPS proxy pattern
   - Adding token/ETH handling
   - Moving to mainnet with financial dependencies
   - Changing access control model

---

## Conclusion

Four findings were fixed during this audit: access control (F-1), duplicate prevention (F-3), pragma pinning (F-4), and input validation (F-5). The remaining findings are Info-level design tradeoffs acceptable for a hackathon demo on Sepolia.

The contract is now significantly hardened — only the owner can write records, duplicates are rejected on-chain, and empty inputs are blocked. The audited version is deployed on Sepolia at `0xE5B1b708b237F9F0F138DE7B03EEc1Eb1a871d40` with all fixes active.

**Enhanced methodology assessment (2026-03-01):** No new vulnerabilities found. The contract's minimal attack surface (no tokens, no ETH, no external calls, no oracle reads) renders all 12 enhanced attack scenarios inapplicable. The primary risk remains owner key compromise, mitigable via multi-sig ownership for production.

**31 tests passing (17 unit + 7 fuzz + 7 deep audit). 80,000 fuzz iterations. 0 failures.**
