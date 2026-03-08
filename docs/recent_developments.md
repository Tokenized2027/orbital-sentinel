# Recent Developments

This file tracks notable implementation updates and sprint completions.

- 2026-03-06: Product roadmap created at docs/roadmap-2026.md. Sprint queue SPRINT-021 through SPRINT-030 registered.
- 2026-03-05: SDL CCIP Bridge AI endpoint added to sentinel-ai server (docs/bridge route + GPT-5.2 analysis).
- 2026-03-04: Unified whitepaper consolidating all documentation published at docs/whitepaper.html and dashboard/public/whitepaper.html. Visual explainer and dashboard polish completed.
- 2026-03-03: Fixed inaccurate CRE deployment claims across all docs. Corrected language distinguishing LAA (live on DON) from other workflows (local simulate).
- 2026-03-02: Security audit completed for SentinelRegistry.sol (AUDIT-REPORT.md). 12 findings fixed across full stack (access control, duplicate prevention, input validation, pragma pinning). 31 tests (17 unit + 7 fuzz + 7 deep audit), 80,000 fuzz iterations, 0 failures. Contract redeployed to 0xE5B1b708b237F9F0F138DE7B03EEc1Eb1a871d40 (v2, post-audit).
- 2026-03-01: Composite intelligence layer (Phase 1.5) operational. cross-workflow LAA analysis reads 5 workflow snapshots, calls GPT-5.3-Codex, produces ecosystem-aware arb recommendation. First composite proof on Sepolia at block 10,371,778.
- 2026-02-28: LAA workflow deployed live to CRE mainnet DON (workflow ID: 005f8a76...fe96). Running 7x/day at 00, 03, 07, 10, 14, 17, 21 UTC.
- 2026-02-27: Unified cycle (sentinel-unified-cycle.sh) established. All 7 supporting workflows running via local cre simulate, 7x/day, feeding composite intelligence.
- 2026-02-25: SentinelRegistry.sol v1 deployed to Sepolia. On-chain proof writing from all 8 workflows via record-all-snapshots.mjs.
- 2026-02-20: All 8 CRE workflows implemented and simulating successfully via cre simulate.
- 2026-02-15: Dashboard (Next.js, port 3016) live at sentinel.schuna.co.il. Reads HealthRecorded events from Sepolia, displays per-workflow statistics.
