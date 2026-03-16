# stLINK Arb Vault — Production Readiness Audit

This document captures the **non-AI production-readiness audit** and hardening work for the stLINK Premium Arbitrage Vault execution layer that Orbital Sentinel monitors.

Scope here is the automation path only:

`deposit LINK / reSDL -> queue to Priority Pool -> claim stLINK -> sell stLINK to LINK on Curve -> requeue LINK -> split profits across depositors + builder fee`

## Scope

- Canonical implementation repo: `Tokenized2027/orbital`
- Canonical path: `clients/stake-link/arb-vault/`
- Excluded from scope:
  - AI recommendation logic
  - live deployment
  - `wstLINK` execution support

## Date

- Audit and hardening completed: March 10, 2026

## What Was Fixed

### 1. Capital profit allocation

Capital-side profit distribution was hardened so unclaimable buckets do not accumulate silently on non-user shares.

### 2. Rebase-aware stLINK handling

The vault was adjusted away from naive manual inventory assumptions and hardened for `stLINK`’s rebasing behavior.

### 3. Bootstrap and queue unwind

The execution layer now has explicit support for:

- bootstrapping the first cycle from fresh LINK capital
- withdrawing queued LINK when operators need to unwind idle queue exposure

### 4. Keeper claim reliability

The keeper was changed from a root-edge trigger to a **state-driven** monitor:

- fetch current on-chain root every poll
- fetch the IPFS tree
- verify IPFS root matches on-chain root
- claim whenever unclaimed balance still exists
- remain restart-safe and retry-safe on the same root

### 5. Signal sanity alignment

The arb-vault monitor logic was aligned with the stricter premium sanity checks already used in `orbital-sentinel`.

### 6. Bytecode-size blocker

The vault had exceeded the Ethereum runtime code-size ceiling before hardening.

Resolved by:

- enabling `via_ir`
- adding a size guard script
- verifying runtime size at `23,323` bytes
- preserving `1,253` bytes of headroom below the `24,576` byte EIP-170 limit

## Added Verification Coverage

### Contract E2E

A real Solidity cycle test now covers:

- bootstrap queue
- claim
- swap
- requeue
- depositor profit split
- duplicate-claim rejection

### Invariants

Invariant coverage now includes queue/accounting consistency and the enhanced safety set around exchange rate, fee bounds, and oracle consistency.

### Historical fork proof

A pinned historical Priority Pool fork test now proves a real archived distribution can still be verified and claimed correctly:

- historical block: `24,563,892`
- live root verification against archived IPFS fixture
- valid merkle proof
- successful historical claim on fork
- same-root double-claim revert

### Keeper E2E

The keeper now has an Anvil-based end-to-end harness validating:

- tree fetch
- proof generation
- claim submission
- idempotent second run

## CI Evidence

Dedicated arb-vault CI was added in the canonical implementation repo and passed successfully on March 10, 2026.

Coverage includes:

- format check
- vault bytecode size guard
- E2E regression
- invariants
- enhanced invariants
- fork smoke tests
- historical Priority Pool fork regression
- keeper build
- keeper E2E

## Current Release Posture

### Ready

- contract hardening
- keeper hardening
- test coverage
- CI gating
- production runbook

### Not Yet Done

- no live mainnet deployment was performed
- no live keeper rehearsal was completed on the dev server

The dev server rehearsal is currently blocked by the simple truth: there is no deployed vault address configured locally yet.

## v1 Release Boundary

Recommended v1 scope remains:

- `LINK` capital deposits
- `reSDL` priority deposits

Explicitly out of scope for v1:

- `wstLINK` deposits
- live production claiming before deployment and keeper credential setup

## Companion Security Audit

For the contract-level audit summary, see:

- [Arb Vault Security Audit Summary](./arb-vault-security-audit.md)
