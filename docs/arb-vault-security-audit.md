# stLINK Arb Vault — Security Audit Summary

This document mirrors the execution-layer audit for the **stLINK Premium Arbitrage Vault**, the optional on-chain vault that the `link-ai-arbitrage` workflow can observe via `arbVaultAddress`.

It is included in `orbital-sentinel` so the monitoring layer and the execution-layer audit trail live in one public place for reviewers.

## Scope

- Canonical implementation repo: `Tokenized2027/orbital`
- Canonical path: `clients/stake-link/arb-vault/`
- Audited contracts:
  - `StLINKArbVault.sol`
  - `ArbVaultAccounting.sol`
- Reviewed off-chain components:
  - Priority Pool claim keeper
  - CRE arb monitor workflow

## Audit Snapshot

- Audit date: March 1, 2026
- Auditor: Claude Opus 4.6
- Solidity: `0.8.24`
- EVM target: Cancun
- Optimizer: 200 runs

## Methodology

- Manual line-by-line review of the vault and accounting contracts
- Slither targeted detector pass
- Aderyn static analysis
- Invariant fuzzing across vault accounting and fund-safety properties
- DeFi attack-scenario testing
- Manual review of the keeper and CRE monitoring path

## Result

The original contract audit reported:

- 7 findings fixed
- no critical findings remaining
- no high-severity findings remaining
- defense-in-depth patterns in place:
  - `ReentrancyGuard`
  - `Ownable2Step`
  - `Pausable`
  - `SafeERC20.forceApprove`
  - `DEAD_SHARES`
  - balance-delta accounting

## Key Findings From The Contract Audit

| ID | Severity | Status | Summary |
|----|----------|--------|---------|
| F-1 | Medium | Accepted | `onERC721Received` callback relies on trusted reSDL implementation |
| F-2 | Medium | Fixed | `removeStrategy` now uses `nonReentrant` |
| F-3 | Low | Fixed | `harvestReSDLRewards` now uses `nonReentrant` |
| F-4 | Low | Accepted | rounding dust is bounded and covered by invariant testing |
| F-5 | Low | Fixed | zero-weight profit lock removed |
| F-6 | Low | Fixed | strategy deployment now uses balance-delta accounting |
| F-7 | Info | Accepted | `refreshBoostWeight` remains permissionless by design |
| F-8 | Info | Accepted | queued LINK / claimed stLINK accounting caveat documented |
| F-9 | Info | Accepted | keeper key in PM2 memory remains an operational risk |
| F-10 | Info | Fixed | SentinelRegistry access control upgraded separately |

## Static Analysis Snapshot

The mirrored static-analysis result from the arb-vault repo reported:

- Aderyn: `2 High`, `8 Low`
- Slither: 4 reentrancy-pattern hits

These remaining alerts were triaged as by-design or false positives, primarily because the public entry points are guarded with `nonReentrant` and the `uint160` cast in `performUpkeep` round-trips from `abi.encode`.

## Companion Production Hardening

After the original audit, the execution layer received a separate production-readiness pass. See:

- [Arb Vault Production Readiness Audit](./arb-vault-production-readiness.md)

## Canonical Detailed Artifacts

The full detailed audit artifacts remain in the canonical implementation repo:

- `clients/stake-link/arb-vault/contracts/AUDIT-REPORT.md`
- `clients/stake-link/arb-vault/contracts/report.md`

Those artifacts are the source of truth for line-by-line findings and tool output. This sentinel-side document is the reviewer-facing summary.
