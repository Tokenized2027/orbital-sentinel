# Claude CLI Prompt Library

## Orbital Sentinel

This repo is a high-risk DeFi intelligence product centered on CRE workflows, composite AI analysis, smart contracts, dashboard visibility, and verifiable on-chain proof hashes. Accuracy matters more than novelty.

## Read First

- `README.md`
- `Makefile`
- `foundry.toml`
- `contracts/`
- `workflows/`

## Recommended Prompt Order

1. CRE Workflow Correctness Audit
2. Composite Intelligence Validation
3. On-Chain Proof Reproducibility Audit
4. Contract And Dashboard Parity Review
5. Deployment Gate

## Claude CLI Usage

Suggested task headers:

- `CRE Workflow Audit`
- `Composite Intelligence Validation`
- `Proof Reproducibility Audit`
- `Contract Dashboard Parity`
- `Sentinel Deployment Gate`

## Default Task Menu

If the task is broad workflow trust or model correctness:
- start with `CRE Workflow Audit`

If the task is about cross-workflow AI reasoning:
- start with `Composite Intelligence Validation`

If the task is about proof integrity:
- start with `Proof Reproducibility Audit`

If the task is about docs, dashboard, and contract alignment:
- start with `Contract Dashboard Parity`

If the task is about release readiness:
- start with `Sentinel Deployment Gate`

## Copy/Paste Commands

```text
CRE Workflow Audit
Composite Intelligence Validation
Proof Reproducibility Audit
Contract Dashboard Parity
Sentinel Deployment Gate
```

## Fast Start

1. Read `README.md`
2. Read `Makefile`
3. Read `foundry.toml`
4. Read `PROMPT-LIBRARY.md`
5. Start with the matching command above

## Before Using Any Prompt

1. Read `README.md` first.
2. If a local `CLAUDE.md` exists, obey it first.
3. Treat `contracts/`, `workflows/`, `scripts/`, and `dashboard/` as one product, not four isolated parts.
4. Use the repo's real checks where relevant: `make cre-check`, `make ready-to-push`, `forge build`, `forge test -vv`.

## 1. CRE Workflow Correctness Audit
```text
Audit all Sentinel workflows with a focus on correctness, not just passing typechecks.

Check:
1. whether each workflow reads the intended on-chain data
2. whether thresholds and interpretations are defensible
3. whether failure modes degrade safely
4. whether any workflow can silently produce misleading intelligence

Output: workflow-by-workflow findings with the highest-risk logic issues first.
```

## 2. Composite Intelligence Validation
```text
Review the composite LAA intelligence layer end to end.

Trace:
1. raw workflow outputs
2. cross-workflow aggregation
3. AI analysis request construction
4. recommendation generation
5. override logic vs isolated LAA signal

Output: where the composite layer adds real value, where it introduces unverifiable reasoning, and how to tighten it.
```

## 3. On-Chain Proof Reproducibility Audit
```text
Audit the proof-writing path.

Check:
1. proof hash construction
2. determinism of encoded fields
3. reproducibility from stored snapshots
4. mismatch risk between dashboard data and on-chain proof
5. failure handling when proof writes fail

Output: reproducibility confidence level and exact integrity risks.
```

## 4. Contract And Dashboard Parity Review
```text
Review whether the contracts, workflows, dashboard, and docs all tell the same truth.

Check:
1. named workflows and actual implementations
2. deployed contract assumptions
3. dashboard numbers and labels
4. README / whitepaper claims vs code reality

Output: parity gaps and the docs/code updates required.
```

## 5. Deployment Gate
```text
Run the repo's full release gate for Sentinel.

Use:
- forge build
- forge test -vv
- make cre-check
- make ready-to-push

Then answer:
1. what is mainnet-ready
2. what is simulation-only
3. what still has hidden operator risk

Output: ready / not ready with blockers sorted by severity.
```
