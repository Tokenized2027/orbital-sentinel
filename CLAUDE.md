<!-- ECOSYSTEM METADATA
repo: orbital-sentinel
language: TypeScript, Solidity, Python
deploy_target: Sepolia (contracts), BOSGAME (dashboard + scripts), CRE Runtime (workflows)
production_status: hackathon-demo
ci: GitHub Actions (contracts + dashboard + workflows + format)
health_check: dashboard at :3016, SentinelRegistry on Sepolia
-->

# Orbital Sentinel

Autonomous DeFi health monitoring platform built on Chainlink CRE for the Chainlink Convergence Hackathon 2026.

**Deadline: March 8, 2026.**

7 CRE workflows read Ethereum mainnet, run AI analysis (Claude Sonnet), and write keccak256 risk proofs to `SentinelRegistry` on Sepolia. A Next.js dashboard displays workflow status and on-chain proof history.

---

## Critical Rules

1. **Never hardcode private keys.** Always from env (`PRIVATE_KEY`). The `.env` is gitignored.
2. **Never deploy contracts without explicit approval.** SentinelRegistry is already deployed at `0xE5B1b708b237F9F0F138DE7B03EEc1Eb1a871d40` on Sepolia. Redeployment changes all downstream references.
3. **Mainnet reads only.** All EVM reads target Ethereum mainnet. No write operations to mainnet ever.
4. **All writes go to Sepolia only.** On-chain proofs, test transactions, everything.
5. **Run `forge test` before any Solidity changes.** Foundry config at `foundry.toml`, solc 0.8.19.
6. **All workflows must be idempotent.** Re-running a workflow with the same input must not corrupt state.
7. **Proof hashes are immutable.** Once a `snapshotHash` is written on-chain, it cannot be altered. The hash encoding (`keccak256(abi.encode(...))`) must stay consistent across TypeScript and Solidity.
8. **Workflow isolation.** Each workflow is a standalone CRE project with its own `package.json`, `node_modules`, config, and ABIs. Do not share state between workflows at runtime.
9. **CRE SDK patterns:** Use `consensusIdenticalAggregation` for all HTTPClient calls. Use `encodeCallMsg` for all EVMClient calls. Use `getNetwork` for chain resolution. Use `CronCapability` for scheduling.
10. **AI analysis costs money.** The Flask endpoint (`platform/cre_analyze_endpoint.py`) uses two providers: Claude Haiku (`ANTHROPIC_API_KEY`) for treasury analysis, GPT-5.3-Codex (`OPENAI_API_KEY`) for arb vault analysis. Every workflow simulation that hits this endpoint costs API credits (~$0.004/call for arb).
11. **Dashboard uses existing SDL database.** The `sentinel_records` table lives in the `sdl_analytics` PostgreSQL database (port 5432).

---

## Architecture

```
orbital-sentinel/
├── workflows/                    # 7 CRE workflow projects (Bun + CRE SDK)
│   ├── treasury-risk/            #   Staking pool health + reward runway
│   ├── governance-monitor/       #   DAO proposal tracking (Snapshot + Discourse)
│   ├── price-feeds/              #   Chainlink Data Feed reads (LINK/USD, ETH/USD)
│   ├── morpho-vault-health/      #   Morpho Blue utilization + ERC4626 TVL
│   ├── token-flows/              #   Whale/holder balance tracking (50+ addresses)
│   ├── ccip-lane-health/         #   CCIP Router + OnRamp + TokenPool monitoring
│   └── curve-pool/               #   Curve StableSwap balance composition
├── contracts/                    # Solidity (Foundry)
│   ├── SentinelRegistry.sol      #   On-chain risk proof registry (owner-gated, dedup, validated)
│   ├── SentinelRegistry.ts       #   TypeScript ABI export
│   └── test/                     #   Foundry tests (24 total: 17 unit + 7 fuzz)
├── dashboard/                    # Next.js 15 standalone app (port 3016)
│   ├── app/
│   │   ├── api/sentinel/         #   GET — on-chain proof data
│   │   ├── api/cre-signals/      #   GET — CRE workflow signal data
│   │   ├── components/           #   WorkflowGrid, SentinelRegistry, PegMonitor, etc.
│   │   ├── page.tsx              #   Main dashboard page
│   │   └── globals.css
│   └── lib/db/                   #   Drizzle ORM (schema.ts, queries.ts)
├── platform/
│   └── cre_analyze_endpoint.py   # Flask AI analysis server (Claude Haiku for treasury, GPT-5.3-Codex for arb)
├── scripts/
│   ├── record-all-snapshots.mjs  # Cron bridge: CRE snapshots -> on-chain proofs
│   ├── record-health.mjs         # One-shot recordHealth call
│   ├── record-health-cron.mjs    # Cron variant
│   └── verify-contract.mjs       # Sourcify contract verification
├── intelligence/                 # Intelligence data directory (gitignored contents)
├── docs/
│   ├── CRE-ECOSYSTEM-REFERENCE.md
│   ├── submission.md
│   ├── demo-video-script.md
│   └── verification.md
├── foundry.toml                  # Foundry config (solc 0.8.19)
├── CHAINLINK.md                  # Every Chainlink touchpoint documented
└── README.md
```

### Data Flow

```
CRE Workflows (cron, every 15-30 min)
  -> EVMClient reads from Ethereum mainnet contracts
  -> HTTPClient POSTs to AI analysis endpoint (Claude Sonnet)
  -> Workflow computes keccak256 proof hash
  -> record-all-snapshots.mjs writes proof to SentinelRegistry on Sepolia
  -> Dashboard collector reads HealthRecorded events via viem getLogs
  -> sentinel_records table in PostgreSQL
  -> Dashboard API serves to Next.js frontend
```

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node / Bun | 22 / latest |
| Workflows | @chainlink/cre-sdk | ^1.0.9 |
| Smart Contracts | Solidity (Foundry) | 0.8.19 |
| Dashboard | Next.js (Turbopack) | 15.2 |
| UI | React | 19 |
| ORM | drizzle-orm | ^0.39 |
| Database | PostgreSQL | existing sdl_analytics DB |
| On-chain lib | viem | 2.34+ |
| AI Analysis | Flask + anthropic (Python) | Claude Sonnet |
| Language | TypeScript | 5.7+ |
| Schema validation | zod | 3.25 |
| Formatter | Prettier | semi, singleQuote, trailingComma: all |

---

## Key File Paths

| What | Path |
|------|------|
| Repo root | `/home/avi/orbital-sentinel` |
| Workflow entry point pattern | `workflows/<name>/my-workflow/main.ts` |
| Workflow config pattern | `workflows/<name>/my-workflow/config.staging.json` |
| Workflow CRE settings | `workflows/<name>/project.yaml` |
| Workflow simulation script | `workflows/<name>/run_snapshot.sh` |
| ABI files per workflow | `workflows/<name>/contracts/abi/*.ts` |
| Contract source | `contracts/SentinelRegistry.sol` |
| Security audit | `AUDIT-REPORT.md` |
| Contract tests | `contracts/test/SentinelRegistry.t.sol`, `contracts/test/SentinelRegistry.Fuzz.t.sol` |
| Dashboard app | `dashboard/app/page.tsx` |
| Dashboard DB schema | `dashboard/lib/db/schema.ts` |
| Dashboard DB queries | `dashboard/lib/db/queries.ts` |
| Dashboard API: sentinel | `dashboard/app/api/sentinel/route.ts` |
| Dashboard API: CRE signals | `dashboard/app/api/cre-signals/route.ts` |
| AI endpoint | `platform/cre_analyze_endpoint.py` |
| Unified cycle script | `scripts/sentinel-unified-cycle.sh` |
| Cron bridge script | `scripts/record-all-snapshots.mjs` |
| CRE ecosystem docs | `docs/CRE-ECOSYSTEM-REFERENCE.md` |
| Hackathon submission | `docs/submission.md` |

---

## Environment Variables

### Root `.env` (scripts, contract deployment)

| Variable | Purpose | Required |
|----------|---------|----------|
| `PRIVATE_KEY` | Deployer wallet key (Sepolia writes) | Yes (scripts) |
| `SEPOLIA_RPC_URL` | Sepolia RPC endpoint | Yes |
| `ETHERSCAN_API_KEY` | Contract verification | Optional |
| `CHAINLINK_CRE_URL` | CRE runtime URL | For CRE deploy |
| `CHAINLINK_CRE_API_KEY` | CRE auth | For CRE deploy |
| `CHAINLINK_CRE_ORG_CODE` | CRE org code | For CRE deploy |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | SentinelRegistry address | Dashboard |
| `NEXT_PUBLIC_RPC_URL` | Sepolia RPC for frontend | Dashboard |

### Dashboard `.env.local`

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (sdl_analytics DB) |
| `CRE_DATA_DIR` | Path to CRE intelligence data directory |

### Workflow configs

Each workflow has `config.staging.json` and `config.example.json` inside `my-workflow/`. RPCs are set in `project.yaml` per workflow.

### AI endpoint

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Claude Haiku API key for treasury risk assessment |
| `OPENAI_API_KEY` | OpenAI GPT-5.3-Codex key for arb vault analysis |

---

## Development Workflow

### Run a workflow simulation

```bash
cd /home/avi/orbital-sentinel/workflows/treasury-risk
./run_snapshot.sh staging-settings
```

This calls `cre simulate` using the CRE CLI at `~/.local/bin/cre`. Each workflow is self-contained.

### Start the AI analysis endpoint

```bash
cd /home/avi/orbital-sentinel/platform
ANTHROPIC_API_KEY=... python cre_analyze_endpoint.py
# Listens on :5000
```

Costs API credits on every call.

### Start the dashboard

```bash
cd /home/avi/orbital-sentinel/dashboard
npm run dev
# Next.js 15 on port 3016 (Turbopack)
```

### Write on-chain proofs manually

```bash
cd /home/avi/orbital-sentinel/scripts
node record-health.mjs
```

Or the cron bridge that reads all 7 snapshots:

```bash
node record-all-snapshots.mjs
```

### Foundry (Solidity)

```bash
cd /home/avi/orbital-sentinel
forge build
forge test
```

### Install workflow dependencies

Each workflow uses Bun:

```bash
cd /home/avi/orbital-sentinel/workflows/<name>/my-workflow
bun install
```

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Running `npm install` in a workflow dir | Use `bun install` -- workflows use Bun, not npm |
| Changing proof hash encoding in TS but not updating docs | Hash encoding must match `keccak256(abi.encode(...))` -- verify against CHAINLINK.md |
| Editing config.staging.json and committing it | Staging configs are gitignored. Use config.example.json as template |
| Running `forge create` without explicit approval | SentinelRegistry is already deployed. Redeployment breaks all references |
| Adding a workflow and forgetting CHAINLINK.md | Every Chainlink touchpoint must be documented in CHAINLINK.md for hackathon |
| Sharing state between workflows | Each workflow is isolated. No shared runtime state |
| Modifying `record-all-snapshots.mjs` without understanding dedup | On-chain `AlreadyRecorded` revert prevents duplicates; script handles gracefully |
| Running dashboard without DATABASE_URL | Needs the sdl_analytics PostgreSQL database connection |
| Calling AI endpoint in a loop during testing | Each call costs Anthropic API credits |

---

## Current State

- **All 7 workflows:** implemented and simulating successfully
- **SentinelRegistry:** deployed on Sepolia at `0xE5B1b708b237F9F0F138DE7B03EEc1Eb1a871d40` (v2, post-audit). Access control, dedup, validation active on-chain.
- **Dashboard:** running on port 3016, reads on-chain proofs + CRE signals
- **Cron bridge:** `record-all-snapshots.mjs` writes proofs for all 7 workflows
- **AI endpoint:** Flask server with Claude Sonnet analysis
- **Hackathon tracks:** CRE & AI, DeFi & Tokenization, Autonomous Agents (Moltbook)
- **Demo video:** script at `docs/demo-video-script.md`, video not yet recorded
- **Submission doc:** `docs/submission.md`

---

## Quality Gates

Before any commit:

1. `forge build` -- Solidity compiles
2. `forge test` -- all 24 contract tests pass (17 unit + 7 fuzz)
3. `forge test --fuzz-runs 10000` -- fuzz tests pass at high iterations
4. Workflow simulation succeeds (`./run_snapshot.sh staging-settings`) for any modified workflow
5. Dashboard builds: `cd dashboard && npx next build`
6. No secrets in committed files (check `.gitignore` covers `.env`, `config.staging.json`, `secrets.yaml`)
7. `CHAINLINK.md` updated if any Chainlink touchpoint changed
8. `README.md` updated if project structure or workflow list changed

---

## Contract Reference

| Field | Value |
|-------|-------|
| Contract | `OrbitalSentinelRegistry` |
| Network | Ethereum Sepolia |
| Address | `0xE5B1b708b237F9F0F138DE7B03EEc1Eb1a871d40` (v2, post-audit) |
| Solidity | 0.8.19 |
| Key function | `recordHealth(bytes32 snapshotHash, string riskLevel)` — **owner-only** |
| Access control | `owner` + `onlyOwner` modifier + `transferOwnership(address)` |
| Duplicate prevention | `mapping(bytes32 => bool) recorded` — reverts `AlreadyRecorded` on duplicates |
| Input validation | Reverts `EmptyRiskLevel` on empty `riskLevel` string |
| Events | `HealthRecorded(bytes32 indexed, string, uint256)`, `OwnershipTransferred(address indexed, address indexed)` |
| Risk level format | Prefixed: `treasury:ok`, `feeds:warning`, `morpho:critical`, etc. |
| Audit | `AUDIT-REPORT.md` — 4 findings fixed, 24 tests, 70k fuzz iterations. Enhanced methodology (2026-03-01): threat model, economic assessment, post-deployment recs |
| Etherscan | `https://sepolia.etherscan.io/address/0xE5B1b708b237F9F0F138DE7B03EEc1Eb1a871d40` |

---

## Unified CRE Cycle Schedule

All 7 workflows run together in a unified cycle, 7 times per day (~3h 25min apart). The master script `scripts/sentinel-unified-cycle.sh` runs all CRE simulations in parallel, then writes all on-chain proofs in one batch via `record-all-snapshots.mjs`.

| Cycle | UTC Time | Cron |
|-------|----------|------|
| 1 | 00:00 | `0 0 * * *` |
| 2 | 03:25 | `25 3 * * *` |
| 3 | 06:50 | `50 6 * * *` |
| 4 | 10:15 | `15 10 * * *` |
| 5 | 13:40 | `40 13 * * *` |
| 6 | 17:05 | `5 17 * * *` |
| 7 | 20:30 | `30 20 * * *` |

**Per cycle:** 7 CRE simulations (parallel) + 7 on-chain proof writes (sequential). Total: 49 on-chain proofs/day.

**Workflows in each cycle:** treasury-risk, price-feeds, governance-monitor, morpho-vault-health, curve-pool, ccip-lane-health, stlink-arb-monitor.
