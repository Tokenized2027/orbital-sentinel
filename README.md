# Orbital Sentinel

**Autonomous AI agent platform for DeFi protocol health monitoring, built on Chainlink CRE.**

Orbital Sentinel runs 7 production CRE workflows that continuously read live Ethereum mainnet data and feed it through a Claude AI analysis layer. All workflows write verifiable risk proofs on-chain via `SentinelRegistry` on Sepolia — every 15 minutes, fully autonomous, no human in the loop. Each proof is a `keccak256` hash of workflow-specific metrics with a prefixed risk level (e.g., `treasury:ok`, `feeds:warning`, `morpho:critical`, `ccip:ok`).

---

## What It Does

```
Chainlink CRE Workflow
  ├── Read on-chain data (EVMClient → mainnet contracts)
  ├── Fetch off-chain signals (HTTPClient → price feeds, governance, lending)
  ├── POST to AI analysis endpoint (Claude Sonnet → risk assessment)
  └── Write proof on-chain (SentinelRegistry.sol → Sepolia)
```

All 7 workflows run autonomously on a cron schedule. Each workflow writes a proof hash on-chain via the SentinelRegistry contract on Sepolia. The real-time dashboard shows CRE capability tags per workflow and per-workflow on-chain proof statistics.

---

## The 7 Workflows

### 1. `treasury-risk` — Protocol Treasury Health
Monitors staking pool utilization, reward vault runway, lending market exposure, and priority queue depth. Computes an overall risk score (`ok / warning / critical`) and calls Claude Sonnet for a structured assessment. Writes a `keccak256` snapshot hash to `SentinelRegistry` on Sepolia.

**Chainlink usage:** `EVMClient.callContract()` reads `getTotalPrincipal()`, `getMaxPoolSize()`, `getRewardBuckets()`, `balanceOf()` from deployed staking contracts on Ethereum mainnet.

### 2. `governance-monitor` — DAO Governance Lifecycle
Polls Snapshot GraphQL for active proposals across multiple governance spaces. Flags urgent votes (<24h remaining). Fetches forum topics for community signal. Outputs proposal urgency ranking.

**Chainlink usage:** `HTTPClient.sendRequest()` with `consensusIdenticalAggregation` for deterministic multi-source data fetching.

### 3. `price-feeds` — Chainlink Oracle Price Monitoring
Reads LINK/USD, ETH/USD, and other asset prices directly from Chainlink Data Feed contracts. Computes depeg basis points for liquid staking derivatives.

**Chainlink usage:** Reads `latestAnswer()` and `latestRoundData()` from Chainlink AggregatorV3 price feed contracts on Ethereum mainnet and Polygon.

### 4. `morpho-vault-health` — Lending Market Risk
Reads Morpho Blue market utilization rates and ERC4626 vault TVL. Flags high utilization (risk of liquidity crunch for borrowers).

**Chainlink usage:** `EVMClient.callContract()` reads Morpho Blue market structs and vault share prices from Ethereum mainnet.

### 5. `token-flows` — Whale & Holder Intelligence
Tracks token and staked-token balances across classified address categories (validators, whales, DEX pools, vesting schedules). Detects large movements that may indicate protocol stress.

**Chainlink usage:** `EVMClient.callContract()` reads `balanceOf()` and vesting `releasable()` across 50+ classified addresses.

### 6. `ccip-lane-health` — CCIP Lane Availability
Monitors Chainlink CCIP lane health by reading the Router's `getOnRamp()`, OnRamp `paused()` state, and `LockReleaseTokenPool` rate limiter buckets per destination chain. Detects paused lanes, unconfigured routes, and rate limiter depletion.

**Chainlink usage:** `EVMClient.callContract()` reads CCIP Router, OnRamp, and LockReleaseTokenPool contracts on Ethereum mainnet.

### 7. `curve-pool` — Curve Pool Balance Monitoring
Monitors Curve StableSwap pool balance composition for stLINK/LINK. Flags imbalanced reserves that may indicate liquidity stress or arbitrage opportunities.

**Chainlink usage:** `EVMClient.callContract()` reads Curve pool balances and Chainlink LINK/USD price feed on Ethereum mainnet.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Chainlink CRE Runtime                   │
│                                                          │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────┐  │
│  │ EVMClient    │   │ HTTPClient   │   │ CronTrigger │  │
│  │ (mainnet     │   │ (AI analysis │   │ (scheduled  │  │
│  │  reads)      │   │  endpoint)   │   │  execution) │  │
│  └──────┬───────┘   └──────┬───────┘   └──────┬──────┘  │
│         │                  │                   │         │
│         └──────────────────┴───────────────────┘         │
│                            │                             │
│                     ┌──────▼──────┐                      │
│                     │  Workflow   │                      │
│                     │  Handler   │                      │
│                     └──────┬──────┘                      │
└────────────────────────────│────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │  Risk Output │  │ Claude Sonnet │  │ SentinelReg  │
    │  (JSON)      │  │ Assessment   │  │ (Sepolia tx) │
    └──────────────┘  └──────────────┘  └──────────────┘
```

---

## Quickstart

### Prerequisites

- [CRE CLI](https://docs.chain.link/chainlink-automation) installed at `~/.local/bin/cre`
- [Bun](https://bun.sh) runtime
- An Ethereum RPC endpoint (public or private)
- `ANTHROPIC_API_KEY` for AI analysis

### Simulate a workflow

```bash
cd workflows/treasury-risk

# Install dependencies
bun install

# Copy and fill in config
cp my-workflow/config.example.json my-workflow/config.staging.json

# Run simulation
./run_snapshot.sh staging-settings
```

Expected output includes:
```json
{
  "overallRisk": "ok",
  "staking": { "community": { "fillPct": 87.3, "risk": "ok" }, ... },
  "rewards": { "runwayDays": 109, "risk": "ok" },
  "aiAnalysis": {
    "assessment": "Protocol treasury is healthy...",
    "risk_label": "ok",
    "action_items": [...],
    "confidence": 0.95
  },
  "registryTx": "hash=0x... registry=0x..."
}
```

### Start the AI analysis endpoint

```bash
pip install flask anthropic
export ANTHROPIC_API_KEY=your_key
python platform/cre_analyze_endpoint.py
# Listening on :5000
```

### Deploy SentinelRegistry to Sepolia

```bash
cd contracts
forge create SentinelRegistry.sol:OrbitalSentinelRegistry \
  --rpc-url https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY \
  --private-key YOUR_PRIVATE_KEY
```

Update `registry.address` in your workflow config with the deployed address.

---

## SentinelRegistry (Sepolia)

Every workflow run writes a verifiable hash to `OrbitalSentinelRegistry` on Sepolia:

```solidity
function recordHealth(bytes32 snapshotHash, string calldata riskLevel) external
event HealthRecorded(bytes32 indexed snapshotHash, string riskLevel, uint256 ts)
```

Risk levels use a prefixed format: `treasury:ok`, `feeds:warning`, `morpho:critical`, `governance:ok`, `flows:ok`, `ccip:ok`.

`snapshotHash = keccak256(abi.encode(timestamp, workflowType, risk, metric1, metric2))`

Deployed address: ``0xAFc081cde50fA2Da7408f4E811Ca9dE128f7B334``

View on Sepolia Etherscan: `https://sepolia.etherscan.io/address/0xAFc081cde50fA2Da7408f4E811Ca9dE128f7B334`

---

## Analytics Integration

Sentinel on-chain records feed back into the standalone dashboard, creating a closed intelligence loop:

```
CRE Snapshots (live data, updated every 10-30 min)
  ↓
record-all-snapshots.mjs (bridge, every 15 min via cron)
  ↓ keccak256 proof hash per workflow
SentinelRegistry (Sepolia)
  ↓ HealthRecorded events
Sentinel Collector (cron, viem getLogs)
  ↓ sentinel_records table
Dashboard API (/api/sentinel)
  ↓ JSON + per-workflow stats + Etherscan links
Sentinel Dashboard (Next.js)
  → Workflow grid with CRE tags, on-chain records with workflow column
```

The collector reads `HealthRecorded` events from the registry contract, stores them in PostgreSQL via Drizzle ORM, and serves them through the dashboard. Each record links back to its Sepolia Etherscan transaction for full auditability. The dashboard parses prefixed risk levels (`treasury:ok`) to show per-workflow proof statistics.

---

## Project Structure

```
orbital-sentinel/
├── workflows/
│   ├── treasury-risk/          ← EVM reads + AI analysis + on-chain write
│   ├── governance-monitor/     ← DAO proposal monitoring + on-chain write
│   ├── price-feeds/            ← Chainlink Data Feed reads + on-chain write
│   ├── morpho-vault-health/    ← Lending market utilization + on-chain write
│   ├── token-flows/            ← Whale & holder tracking + on-chain write
│   ├── ccip-lane-health/       ← CCIP lane availability + rate limiter monitoring
│   └── curve-pool/             ← Curve pool balance composition monitoring
├── contracts/
│   └── SentinelRegistry.sol    ← On-chain risk proof registry (Sepolia)
├── dashboard/                  ← Next.js standalone dashboard
│   ├── app/components/         ← WorkflowGrid, SentinelRegistry, PegMonitor, etc.
│   ├── app/api/                ← /api/sentinel, /api/cre-signals
│   └── lib/db/                 ← Drizzle ORM schema + queries (PostgreSQL)
├── platform/
│   └── cre_analyze_endpoint.py ← Flask AI analysis server (Claude Sonnet)
├── scripts/
│   ├── record-all-snapshots.mjs ← Bridge: CRE snapshots → on-chain proofs (cron)
│   ├── record-health.mjs       ← One-shot recordHealth call
│   └── verify-contract.mjs     ← Sourcify contract verification
├── docs/
│   ├── CRE-ECOSYSTEM-REFERENCE.md ← CRE capabilities, SDK patterns, ecosystem context
│   ├── submission.md           ← Hackathon submission copy-paste
│   └── demo-video-script.md    ← Recording guide
├── README.md
└── CHAINLINK.md                ← All Chainlink touchpoints documented
```

---

## Chainlink Files Index

Every file in this repo that uses Chainlink products, organized by category. Required for hackathon submission — see [CHAINLINK.md](./CHAINLINK.md) for detailed usage documentation.

### CRE Workflow Definitions (`@chainlink/cre-sdk`)

All 7 workflows import `Runner`, `handler`, `CronCapability`, `EVMClient`, `getNetwork`, and `encodeCallMsg` from the CRE SDK:

| # | Workflow | File | Chainlink Features |
|---|----------|------|--------------------|
| 1 | Treasury Risk | [`workflows/treasury-risk/my-workflow/main.ts`](./workflows/treasury-risk/my-workflow/main.ts) | EVMClient (4 mainnet reads), HTTPClient (AI analysis), CronCapability, SentinelRegistry write |
| 2 | Governance Monitor | [`workflows/governance-monitor/my-workflow/main.ts`](./workflows/governance-monitor/my-workflow/main.ts) | HTTPClient + consensusIdenticalAggregation (Snapshot + Discourse), CronCapability, SentinelRegistry write |
| 3 | Price Feeds | [`workflows/price-feeds/my-workflow/main.ts`](./workflows/price-feeds/my-workflow/main.ts) | EVMClient reads Chainlink Data Feeds (LINK/USD, ETH/USD), CronCapability, SentinelRegistry write |
| 4 | Morpho Vault Health | [`workflows/morpho-vault-health/my-workflow/main.ts`](./workflows/morpho-vault-health/my-workflow/main.ts) | EVMClient (Morpho Blue + ERC4626), CronCapability, SentinelRegistry write |
| 5 | Token Flows | [`workflows/token-flows/my-workflow/main.ts`](./workflows/token-flows/my-workflow/main.ts) | EVMClient (50+ ERC20 balanceOf reads), CronCapability, SentinelRegistry write |
| 6 | CCIP Lane Health | [`workflows/ccip-lane-health/my-workflow/main.ts`](./workflows/ccip-lane-health/my-workflow/main.ts) | EVMClient (CCIP Router + OnRamp + TokenPool), CronCapability, SentinelRegistry write |
| 7 | Curve Pool | [`workflows/curve-pool/my-workflow/main.ts`](./workflows/curve-pool/my-workflow/main.ts) | EVMClient (Curve pool + LINK/USD Data Feed), CronCapability, SentinelRegistry write |

### On-Chain Contract (Sepolia)

| File | Description |
|------|-------------|
| [`contracts/SentinelRegistry.sol`](./contracts/SentinelRegistry.sol) | `OrbitalSentinelRegistry` — `recordHealth(bytes32, string)` writes keccak256 risk proofs. Deployed: [`0xAFc081cde50fA2Da7408f4E811Ca9dE128f7B334`](https://sepolia.etherscan.io/address/0xAFc081cde50fA2Da7408f4E811Ca9dE128f7B334) |

### ABI Files (Chainlink Contract Interfaces)

| File | Contract |
|------|----------|
| [`workflows/treasury-risk/contracts/abi/StakingPool.ts`](./workflows/treasury-risk/contracts/abi/StakingPool.ts) | Chainlink staking pool (getTotalPrincipal, getMaxPoolSize) |
| [`workflows/treasury-risk/contracts/abi/RewardVault.ts`](./workflows/treasury-risk/contracts/abi/RewardVault.ts) | Chainlink reward vault (getRewardBuckets) |
| [`workflows/treasury-risk/contracts/abi/SentinelRegistry.ts`](./workflows/treasury-risk/contracts/abi/SentinelRegistry.ts) | SentinelRegistry ABI for on-chain writes |
| [`workflows/price-feeds/contracts/abi/PriceFeedAggregator.ts`](./workflows/price-feeds/contracts/abi/PriceFeedAggregator.ts) | Chainlink AggregatorV3 (latestAnswer, latestRoundData) |
| [`workflows/price-feeds/contracts/abi/SentinelRegistry.ts`](./workflows/price-feeds/contracts/abi/SentinelRegistry.ts) | SentinelRegistry ABI |
| [`workflows/morpho-vault-health/contracts/abi/MorphoBlue.ts`](./workflows/morpho-vault-health/contracts/abi/MorphoBlue.ts) | Morpho Blue market struct |
| [`workflows/morpho-vault-health/contracts/abi/ERC4626Vault.ts`](./workflows/morpho-vault-health/contracts/abi/ERC4626Vault.ts) | ERC4626 vault (totalAssets) |
| [`workflows/morpho-vault-health/contracts/abi/SentinelRegistry.ts`](./workflows/morpho-vault-health/contracts/abi/SentinelRegistry.ts) | SentinelRegistry ABI |
| [`workflows/ccip-lane-health/contracts/abi/CCIPRouter.ts`](./workflows/ccip-lane-health/contracts/abi/CCIPRouter.ts) | Chainlink CCIP Router (getOnRamp) |
| [`workflows/ccip-lane-health/contracts/abi/CCIPOnRamp.ts`](./workflows/ccip-lane-health/contracts/abi/CCIPOnRamp.ts) | Chainlink CCIP OnRamp (paused) |
| [`workflows/ccip-lane-health/contracts/abi/LockReleaseTokenPool.ts`](./workflows/ccip-lane-health/contracts/abi/LockReleaseTokenPool.ts) | Chainlink CCIP TokenPool (rate limiter) |
| [`workflows/curve-pool/contracts/abi/CurvePool.ts`](./workflows/curve-pool/contracts/abi/CurvePool.ts) | Curve StableSwap pool (balances, A, virtual_price) |
| [`workflows/curve-pool/contracts/abi/PriceFeedAggregator.ts`](./workflows/curve-pool/contracts/abi/PriceFeedAggregator.ts) | Chainlink LINK/USD feed for TVL calc |
| [`workflows/curve-pool/contracts/abi/SentinelRegistry.ts`](./workflows/curve-pool/contracts/abi/SentinelRegistry.ts) | SentinelRegistry ABI |
| [`workflows/governance-monitor/contracts/abi/SentinelRegistry.ts`](./workflows/governance-monitor/contracts/abi/SentinelRegistry.ts) | SentinelRegistry ABI |
| [`workflows/token-flows/contracts/abi/SentinelRegistry.ts`](./workflows/token-flows/contracts/abi/SentinelRegistry.ts) | SentinelRegistry ABI |

### Bridge Scripts (On-Chain Proof Writers)

| File | Description |
|------|-------------|
| [`scripts/record-all-snapshots.mjs`](./scripts/record-all-snapshots.mjs) | Cron bridge: reads all 7 CRE workflow snapshots, writes keccak256 proofs to SentinelRegistry on Sepolia |
| [`scripts/record-health.mjs`](./scripts/record-health.mjs) | One-shot recordHealth call for a single workflow snapshot |
| [`scripts/record-health-cron.mjs`](./scripts/record-health-cron.mjs) | Cron variant of record-health |
| [`scripts/verify-contract.mjs`](./scripts/verify-contract.mjs) | Sourcify contract verification for SentinelRegistry |

### CRE Simulation Scripts

Each workflow has a `run_snapshot.sh` that runs `cre simulate`:

| File |
|------|
| [`workflows/treasury-risk/run_snapshot.sh`](./workflows/treasury-risk/run_snapshot.sh) |
| [`workflows/governance-monitor/run_snapshot.sh`](./workflows/governance-monitor/run_snapshot.sh) |
| [`workflows/price-feeds/run_snapshot.sh`](./workflows/price-feeds/run_snapshot.sh) |
| [`workflows/morpho-vault-health/run_snapshot.sh`](./workflows/morpho-vault-health/run_snapshot.sh) |
| [`workflows/token-flows/run_snapshot.sh`](./workflows/token-flows/run_snapshot.sh) |
| [`workflows/ccip-lane-health/run_snapshot.sh`](./workflows/ccip-lane-health/run_snapshot.sh) |
| [`workflows/curve-pool/run_snapshot.sh`](./workflows/curve-pool/run_snapshot.sh) |

### AI Analysis Endpoint

| File | Description |
|------|-------------|
| [`platform/cre_analyze_endpoint.py`](./platform/cre_analyze_endpoint.py) | Flask server called by CRE workflows via HTTPClient for AI risk assessment |

### Dashboard (On-Chain Proof Reader)

| File | Description |
|------|-------------|
| [`dashboard/app/api/sentinel/route.ts`](./dashboard/app/api/sentinel/route.ts) | API route reading SentinelRegistry on-chain proof data |
| [`dashboard/app/api/cre-signals/route.ts`](./dashboard/app/api/cre-signals/route.ts) | API route for CRE workflow signal data |
| [`dashboard/app/components/SentinelRegistry.tsx`](./dashboard/app/components/SentinelRegistry.tsx) | UI: on-chain proof records with Etherscan links |
| [`dashboard/app/components/WorkflowGrid.tsx`](./dashboard/app/components/WorkflowGrid.tsx) | UI: workflow grid with CRE capability tags |
| [`dashboard/lib/db/schema.ts`](./dashboard/lib/db/schema.ts) | Drizzle ORM schema for `sentinel_records` table |
| [`dashboard/lib/db/queries.ts`](./dashboard/lib/db/queries.ts) | Queries for sentinel proof statistics |

### Documentation

| File | Description |
|------|-------------|
| [`CHAINLINK.md`](./CHAINLINK.md) | Complete Chainlink touchpoint map (SDK, EVMClient, Data Feeds, CCIP, HTTPClient, CronCapability, getNetwork) |
| [`docs/CRE-ECOSYSTEM-REFERENCE.md`](./docs/CRE-ECOSYSTEM-REFERENCE.md) | CRE capabilities, SDK patterns, runtime requirements |
| [`docs/submission.md`](./docs/submission.md) | Hackathon submission details |

---

## Demo

**Video:** *Coming soon — will be linked here before submission deadline.*

---

## Built For

**Chainlink Convergence Hackathon 2026**
Tracks: CRE & AI + DeFi & Tokenization + Autonomous Agents (Moltbook)

**By:** [Orbital](https://github.com/Tokenized2027) — managed AI ops platform for DeFi protocols.

**License:** MIT
