# AI Scan Campaign Report — SentinelRegistry

Date: 2026-03-12

Scope:
- `contracts/SentinelRegistry.sol`

Status:
- Confirmed novel findings: 1
- Open findings on current branch: 0
- Severity split at discovery: 0 Critical, 0 High, 1 Medium, 0 Low
- Existing report comparison baseline: `AUDIT-REPORT.md`
- Remediation update: Fixed locally on 2026-03-12. `recordHealth()` is owner-only again and the tests/docs are aligned with that trust model.

## Executive Summary

SentinelRegistry is still tiny and easy to reason about. The scan identified a trust-model drift between the live code and the published security story, and that drift is fixed in the current branch.

At discovery time:
- `recordHealth()` was permissionless.
- arbitrary callers, including `address(0)` inside Foundry simulations, were intentionally allowed by the test suite.

At the same time, the repo’s security docs, README, whitepaper snippets, and generated ABI comments described `recordHealth()` as owner-only. That mismatch was the only reportable issue I found here, and it mattered more than a normal docs typo because this contract is presented as an on-chain proof anchor.

## Findings

| ID | Severity | Title | Novel vs `AUDIT-REPORT.md` | Verification |
|---|---|---|---|---|
| SENT-SCAN-01 | Medium | `recordHealth()` was permissionless in code but owner-only in published security docs | Yes — the existing audit claimed the opposite | Manual trace + updated tests |

### SENT-SCAN-01 — `recordHealth()` was permissionless in code but owner-only in published security docs

Locations:
- `contracts/SentinelRegistry.sol`
- `contracts/test/SentinelRegistry.t.sol`
- `contracts/test/SentinelRegistry.Fuzz.t.sol`
- `contracts/test/DeepAudit.t.sol`
- `AUDIT-REPORT.md`
- `README.md`
- `CHAINLINK.md`

Why it mattered:
- The contract did not apply `onlyOwner` to `recordHealth()`.
- Tests explicitly asserted that any caller could write records and that a zero-address prank was accepted in simulation.
- Several repo artifacts still said the opposite and framed the registry as deployer/owner-gated.

Impact:
- Any external account could publish plausible-looking `riskLevel` entries on-chain.
- Consumers relying on `latest()` or raw on-chain logs could be spoofed unless they independently validated `recorder`.
- The mismatch also weakened confidence in the existing audit narrative because the live code diverged from the published "fixed" state.

Resolution:
- Owner-only writes were the intended design.
- `onlyOwner` was restored on `recordHealth()`.
- Unit, fuzz, and deep-audit tests were updated to reject non-owner writes and preserve the current owner/writer model.

Recommended fix:
- Implemented: restored `onlyOwner` on `recordHealth()` and aligned the tests with the documented trust model.

## Cross-Reference / Convergence

| Finding | Manual Review | Current Tests | Slither | Existing `AUDIT-REPORT.md` | Methodology Lens |
|---|---|---|---|---|---|
| `SENT-SCAN-01` | Yes | `test_recordHealth_revertsForNonOwner`, `testFuzz_nonOwner_alwaysReverts` | No direct detector hit | Contradicted by existing audit at discovery time | Pashov reviewer/judge, Claudit trust-boundary drift, consumer AI adversarial validation |

## Novel Findings List

- `SENT-SCAN-01`: the live contract and tests allowed permissionless writes while the repo advertised owner-only integrity guarantees.

Remediation status:
- Fixed on the current branch. The registry has owner-only writes again and the surrounding docs now explain that the bridge writer must use the owner signer.

## Verification

Local verification completed:
- `forge test`
- `forge test --match-contract SentinelRegistryTest --match-test test_recordHealth_revertsForNonOwner`
- `forge test --match-contract SentinelRegistryFuzzTest --match-test testFuzz_nonOwner_alwaysReverts`
- `slither-scan-campaign.json`

Relevant passing tests in the current suite:
- `SentinelRegistryTest.test_recordHealth_revertsForNonOwner`
- `SentinelRegistryFuzzTest.testFuzz_nonOwner_alwaysReverts`
- `DeepAuditSentinelTest.test_ownershipTransfer_newOwnerCanRecord`

## Methodology Sources Used

GitHub sources I could verify and use as methodology references:
- `https://github.com/pashov/skills`
- `https://github.com/trailofbits/skills`
- `https://github.com/marchev/claudit`
- `https://github.com/auditmos/skills`
