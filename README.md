# Orbital Sentinel

**AI-powered DeFi arbitrage intelligence built on Chainlink CRE, with cross-workflow ecosystem awareness and on-chain proof verification.**

Orbital Sentinel's core product is the **LINK AI Arbitrage (LAA)** workflow: an autonomous system that detects stLINK/LINK arbitrage opportunities on Curve and makes execution decisions informed by real-time data from 5 additional CRE workflows monitoring the entire stake.link ecosystem. The LAA workflow is **live on CRE mainnet**, running 7x/day on the DON. All 8 workflows are implemented and simulating successfully, with the remaining 7 ready for CRE deployment. Every decision is backed by a verifiable `keccak256` proof hash written to Ethereum Sepolia.

What makes this different from a simple arb bot: **the LAA doesn't decide in isolation.** A composite intelligence layer reads treasury health, oracle prices, lending market utilization, CCIP bridge status, and Curve pool structure, then feeds that full ecosystem context to an AI analyst (GPT-5.3-Codex) that can override the raw signal. When the math says "execute" but the ecosystem says "the Priority Pool queue is 365K LINK deep and the basis is unstable," the composite layer says "wait."

**[Read the full Whitepaper](https://sentinel.schuna.co.il/whitepaper.html)** | [Live Dashboard](https://sentinel.schuna.co.il) | [SentinelRegistry on Etherscan](https://sepolia.etherscan.io/address/0xE5B1b708b237F9F0F138DE7B03EEc1Eb1a871d40)

---

## The Core Product: LINK AI Arbitrage (LAA)

The arb mechanism: sell stLINK for LINK on Curve (when stLINK trades at a premium), then deposit LINK to the Priority Pool at 1:1 to mint new stLINK, pocketing the spread.

### What LAA Reads (via CRE EVMClient, Ethereum Mainnet)

| Contract | Data | Why |
|----------|------|-----|
| Curve StableSwap NG | `balances()`, `get_dy()` at 4 swap sizes | Pool composition + premium quotes with slippage |
| Priority Pool | `poolStatus()`, `totalQueued()` | Gate check (open/draining/closed) + queue depth |
| Arb Vault (optional) | `totalStLINKHeld()`, `minProfitBps()`, `cycleCount()` | Vault state for capital management |

### Signal Logic

```
Priority Pool closed?     → pool_closed
Vault has zero stLINK?    → no_stlink
Premium ≤ 0 bps?          → unprofitable
Premium < minProfitBps?   → wait
Otherwise                 → execute
```

### What LAA Misses (Without Composite Intelligence)

The LAA workflow only sees the Curve pool and Priority Pool. It has no idea that:
- LINK/USD is dropping 5% today (price-feeds workflow)
- The community staking pool is 100% full, supporting premium persistence (treasury-risk)
- Morpho utilization is at 89.65%, locking wstLINK as collateral (morpho-vault-health)
- A CCIP lane is degraded, disrupting cross-chain LINK flows (ccip-lane-health)
- The Curve pool imbalance just shifted 3% toward equilibrium (curve-pool)

This is where the composite intelligence layer comes in.

---

## Composite Intelligence: Cross-Workflow AI Synthesis

After all CRE workflows complete in the unified cycle, a composite intelligence script reads data from all 6 sources and sends the full ecosystem context to an AI analyst (GPT-5.3-Codex). The AI produces an ecosystem-aware recommendation that can confirm or override the isolated LAA signal.

```
Phase 1: CRE Workflows (LAA on mainnet DON, others via local simulate)
  ┌─────────────────────────────────────────────────────────────┐
  │  8 CRE workflows (reads from Ethereum mainnet)             │
  │                                                             │
  │  LAA ─────────── Curve pool, Premium quotes, Priority Pool  │  CRE mainnet DON
  │  price-feeds ─── LINK/USD, ETH/USD (Chainlink Data Feeds)  │  local simulate
  │  treasury-risk ─ Staking pools, Reward runway, Queue depth  │  local simulate
  │  morpho-vault ── Utilization, Supply/Borrow, APY            │  local simulate
  │  curve-pool ──── Composition, TVL, Gauge rewards            │  local simulate
  │  ccip-lanes ──── Router, OnRamp, TokenPool (3 dest chains)  │  local simulate
  │  governance ──── Snapshot proposals, Forum activity          │  local simulate
  │  token-flows ─── Whale/holder balance tracking              │  local simulate
  └──────────────────────────┬──────────────────────────────────┘
                             │
Phase 1.5: Composite Intelligence
  ┌──────────────────────────▼──────────────────────────────────┐
  │  composite-laa-intelligence.mjs                             │
  │                                                             │
  │  Reads all 6 snapshots → builds cross-workflow context      │
  │  → POSTs to /api/cre/analyze-composite (GPT-5.3-Codex)     │
  │  → AI produces ecosystem-aware recommendation               │
  │  → Writes cre_composite_snapshot.json                       │
  └──────────────────────────┬──────────────────────────────────┘
                             │
Phase 2: On-Chain Proofs
  ┌──────────────────────────▼──────────────────────────────────┐
  │  record-all-snapshots.mjs                                   │
  │                                                             │
  │  8 workflow proofs + 1 composite proof → SentinelRegistry   │
  │  keccak256(abi.encode(metrics...)) → Sepolia                │
  └─────────────────────────────────────────────────────────────┘
```

### How Each Workflow Influences the LAA Decision

| Workflow | Signal for LAA | Example Impact |
|----------|----------------|----------------|
| **price-feeds** | LINK/USD price, stLINK/LINK depeg bps | 17 bps arb premium means nothing if LINK drops 5% during the cycle |
| **treasury-risk** | Pool fill %, queue depth, reward runway | 100% community pool fill = premium persists (bullish). 365K LINK queue = slow capital recycling (caution) |
| **morpho-vault-health** | Utilization %, supply APY | 89.65% utilization = wstLINK locked as collateral = less sell pressure on stLINK (premium support) |
| **ccip-lane-health** | Lane status, paused count, rate limiters | Degraded CCIP lanes restrict cross-chain LINK flows, affecting Curve pool dynamics |
| **curve-pool** | Imbalance %, TVL, gauge rewards, virtual price | Deep imbalance with active gauge rewards = premium is structural, not transient |

### Real Example (Live Mainnet Data, March 2026)

```
Isolated LAA signal:        EXECUTE  (17 bps premium, pool open)
Composite recommendation:   WAIT     (ecosystem under stress)
Confidence:                 0.94     (all 5 context workflows loaded)
Optimal swap size:          500 stLINK (reduced from 5000)

Reasoning: "Premium is real and likely to persist (100% community pool fill,
89.65% Morpho utilization), but Priority Pool queue is 365K LINK (slow
recycling), stLINK/LINK depeg at 95 bps (basis instability), and premium
is thin (16-17 bps). Wait for queue normalization or probe with small size."
```

The composite proof hash encoding this decision is on Sepolia: [`0xd2e041...`](https://sepolia.etherscan.io/tx/0xd2e0414a08ca361cfd23666c44457385164a7d5ee2c1a33953a2bc466acae7eb)

---

## The 5 Supporting CRE Workflows

Each workflow is a standalone CRE project that reads live Ethereum mainnet data and writes its own on-chain proof. Together, they form the ecosystem intelligence layer that feeds the LAA composite analysis. All workflows are CRE-compatible and ready for DON deployment.

### 1. `price-feeds` : Chainlink Oracle Price Monitoring
Reads LINK/USD, ETH/USD from Chainlink AggregatorV3 Data Feed contracts. Computes stLINK/LINK depeg basis points. Provides USD-denominated context for arb profitability.

**CRE:** `EVMClient.callContract()` reads `latestAnswer()` from Chainlink price feed contracts.

### 2. `treasury-risk` : Protocol Treasury Health
Monitors staking pool utilization (community + operator), reward vault runway, and priority queue depth. Calls Claude Haiku for structured risk assessment.

**CRE:** `EVMClient.callContract()` reads `getTotalPrincipal()`, `getMaxPoolSize()`, `getRewardBuckets()`, `balanceOf()`. `HTTPClient` + `consensusIdenticalAggregation` for AI analysis.

### 3. `morpho-vault-health` : Lending Market Risk
Reads Morpho Blue market utilization and ERC4626 vault TVL. High utilization means wstLINK is locked as collateral, reducing stLINK supply on open markets.

**CRE:** `EVMClient.callContract()` reads Morpho Blue market structs and vault share prices.

### 4. `ccip-lane-health` : CCIP Lane Availability
Monitors Chainlink CCIP Router `getOnRamp()`, OnRamp `paused()` state, and `LockReleaseTokenPool` rate limiters per destination chain (Arbitrum, Base, Polygon).

**CRE:** `EVMClient.callContract()` reads CCIP Router, OnRamp, and LockReleaseTokenPool contracts.

### 5. `curve-pool` : Curve Pool Structure
Monitors Curve StableSwap pool composition, virtual price, amplification factor, TVL, and gauge reward incentives. Provides market structure context for premium sustainability.

**CRE:** `EVMClient.callContract()` reads Curve pool balances and Chainlink LINK/USD Data Feed.

### Additional Workflows

- **`governance-monitor`** : Polls Snapshot GraphQL for active proposals across governance spaces. Uses `HTTPClient` + `consensusIdenticalAggregation` for deterministic multi-source fetching.
- **`token-flows`** : Tracks balances across 50+ classified addresses (validators, whales, DEX pools, vesting). Fully implemented and CI-validated, but excluded from the unified cycle because its 50+ `balanceOf` reads exceed the CRE 15-read limit per workflow — requires batching or a dedicated multi-call pattern before DON deployment. Proofs are still written when run standalone.

---

## On-Chain Proofs: SentinelRegistry (Sepolia)

Every workflow run and every composite analysis produces a verifiable proof hash written to `OrbitalSentinelRegistry` on Sepolia.

**Contract:** [`0xE5B1b708b237F9F0F138DE7B03EEc1Eb1a871d40`](https://sepolia.etherscan.io/address/0xE5B1b708b237F9F0F138DE7B03EEc1Eb1a871d40)

```
snapshotHash = keccak256(abi.encode(timestamp, workflowType, risk, metric1, metric2, ...))
riskLevel = "treasury:ok" | "feeds:warning" | "composite:critical" | ...
```

**The composite proof** is special: it encodes metrics from **6 different CRE data sources** into a single hash, creating a tamper-proof record of cross-workflow AI reasoning:

```typescript
encodeAbiParameters(
  'uint256 ts, string wf, string risk, uint256 premiumBps, uint256 linkUsd,
   uint256 communityFillPct, uint256 queueLink, uint256 morphoUtil,
   uint256 ccipOk, uint256 curveImbalance, uint256 confidence',
  [timestamp, 'composite', risk, ...metrics],
)
```

Anyone can reconstruct the hash from the raw workflow data and verify it matches the on-chain record.

### Contract Interface

```solidity
function recordHealth(bytes32 snapshotHash, string calldata riskLevel) external onlyOwner
function transferOwnership(address newOwner) external onlyOwner  // Ownable2Step
function acceptOwnership() external  // only callable by pendingOwner
function count() external view returns (uint256)
function recorded(bytes32) external view returns (bool)
```

**Security:** Owner-only writes, Ownable2Step transfer, on-chain duplicate prevention (`AlreadyRecorded`), input validation (`EmptyRiskLevel`, `RiskLevelTooLong`). Audited: 4 findings fixed, 31 tests (17 unit + 7 fuzz + 7 deep audit), 80,000 fuzz iterations. See [AUDIT-REPORT.md](./AUDIT-REPORT.md).

---

## CRE Deployment Status

The LAA workflow is **live on the CRE mainnet DON**. The other 7 workflows run locally via `cre simulate` in the unified cycle and are ready for CRE deployment.

| Workflow | Status | Schedule |
|----------|--------|----------|
| **LINK AI Arbitrage (LAA)** | **ACTIVE on CRE DON** | 7x/day |
| treasury-risk | Local simulate | 7x/day (unified cycle) |
| price-feeds | Local simulate | 7x/day (unified cycle) |
| morpho-vault-health | Local simulate | 7x/day (unified cycle) |
| curve-pool | Local simulate | 7x/day (unified cycle) |
| ccip-lane-health | Local simulate | 7x/day (unified cycle) |
| governance-monitor | Local simulate | 7x/day (unified cycle) |
| token-flows | Local simulate | Not in unified cycle |

The unified cycle runs 7x/day: Phase 1 (CRE simulations in parallel), Phase 1.5 (composite AI analysis), Phase 2 (on-chain proof writes to SentinelRegistry on Sepolia). on-chain proofs deduplicated by contract (only changed assessments create new records).

---

## Builder Fee

Orbital Sentinel charges a **0.1% builder fee** (10 bps) on protocol-integrated actions. Configurable by the protocol multisig.

| Parameter | Value |
|-----------|-------|
| Default fee | 0.1% (10 bps) |
| Configured by | Protocol multisig |
| Adjustable | Yes |
| Recipient | TBD at deployment |

---

## Quickstart

### Prerequisites

- [CRE CLI](https://docs.chain.link/cre) installed at `~/.local/bin/cre`
- [Bun](https://bun.sh) runtime
- Ethereum RPC endpoint
- `OPENAI_API_KEY` for composite + arb analysis
- `ANTHROPIC_API_KEY` for treasury analysis

### Run a workflow locally (for testing)

```bash
cd workflows/link-ai-arbitrage
bun install
cp my-workflow/config.example.json my-workflow/config.staging.json
./run_snapshot.sh staging-settings
```

> The LAA workflow is deployed on the CRE mainnet DON. Other workflows run locally via `cre simulate` and are ready for CRE deployment.

### Run composite intelligence

```bash
# Start the AI endpoint
export OPENAI_API_KEY=your_key
export ANTHROPIC_API_KEY=your_key
python platform/cre_analyze_endpoint.py

# In another terminal: run composite analysis against existing snapshots
cd scripts
AI_ENDPOINT=http://localhost:5000/api/cre/analyze-composite node composite-laa-intelligence.mjs
```

### Write proofs to Sepolia

```bash
cd scripts
node record-all-snapshots.mjs
```

---

## Project Structure

```
orbital-sentinel/
├── workflows/
│   ├── link-ai-arbitrage/        ← LAA: the core product (Curve arb + AI signals)
│   ├── price-feeds/              ← Context: Chainlink Data Feed reads (LINK/USD, ETH/USD)
│   ├── treasury-risk/            ← Context: staking health + reward runway + AI analysis
│   ├── morpho-vault-health/      ← Context: lending utilization + ERC4626 TVL
│   ├── ccip-lane-health/         ← Context: CCIP bridge status + rate limiters
│   ├── curve-pool/               ← Context: pool composition + gauge + TVL
│   ├── governance-monitor/       ← Context: DAO proposal tracking
│   └── token-flows/              ← Context: whale/holder balance tracking (not in cycle)
├── contracts/
│   ├── SentinelRegistry.sol      ← On-chain proof registry (Sepolia, audited)
│   └── test/                     ← 31 tests (unit + fuzz + deep audit)
├── dashboard/                    ← Next.js standalone dashboard (port 3016)
├── platform/
│   └── cre_analyze_endpoint.py   ← Flask AI server (Haiku + GPT-5.3-Codex + composite)
├── scripts/
│   ├── sentinel-unified-cycle.sh ← Master: Phase 1 + 1.5 + 2 (7x/day)
│   ├── composite-laa-intelligence.mjs ← Phase 1.5: cross-workflow LAA analysis
│   ├── record-all-snapshots.mjs  ← Phase 2: CRE snapshots → on-chain proofs
│   └── verify-contract.mjs       ← Sourcify contract verification
├── CHAINLINK.md                  ← Every Chainlink touchpoint documented
├── AUDIT-REPORT.md               ← SentinelRegistry security audit
└── docs/
    ├── CRE-ECOSYSTEM-REFERENCE.md
    ├── submission.md
    └── demo-video-script.md
```

---

## Chainlink CRE Components Used

| Component | Where | Purpose |
|-----------|-------|---------|
| `@chainlink/cre-sdk` Runner | All 8 workflows | Workflow execution runtime |
| `EVMClient.callContract()` | All 8 workflows | Read live Ethereum mainnet contracts |
| Chainlink Data Feeds | price-feeds, curve-pool | LINK/USD, ETH/USD oracle prices |
| CCIP Router + OnRamp + TokenPool | ccip-lane-health | Cross-chain bridge monitoring |
| `HTTPClient` + `consensusIdenticalAggregation` | LAA, treasury-risk, governance, price-feeds | Deterministic off-chain fetches with oracle consensus |
| `CronCapability` | All 8 workflows | Autonomous scheduled execution |
| `getNetwork()` | All 8 workflows | Chain selector resolution (mainnet + Sepolia) |
| `encodeCallMsg` | All 8 workflows | ABI-encoded contract calls |
| `SentinelRegistry.sol` | All workflows + composite | On-chain proof anchoring (Sepolia) |
| Composite Intelligence | `composite-laa-intelligence.mjs` | Cross-workflow AI synthesis (GPT-5.3-Codex) |

See [CHAINLINK.md](./CHAINLINK.md) for detailed per-file documentation of every Chainlink touchpoint.

---

## Chainlink Files Index

### CRE Workflow Definitions

| # | Workflow | File | CRE Features |
|---|----------|------|--------------|
| 1 | **LINK AI Arbitrage (LAA)** | [`workflows/link-ai-arbitrage/my-workflow/main.ts`](./workflows/link-ai-arbitrage/my-workflow/main.ts) | EVMClient (Curve + Priority Pool + Arb Vault), HTTPClient (AI), CronCapability |
| 2 | Price Feeds | [`workflows/price-feeds/my-workflow/main.ts`](./workflows/price-feeds/my-workflow/main.ts) | EVMClient (Chainlink Data Feeds), CronCapability |
| 3 | Treasury Risk | [`workflows/treasury-risk/my-workflow/main.ts`](./workflows/treasury-risk/my-workflow/main.ts) | EVMClient (4 mainnet reads), HTTPClient (AI), CronCapability |
| 4 | Morpho Vault Health | [`workflows/morpho-vault-health/my-workflow/main.ts`](./workflows/morpho-vault-health/my-workflow/main.ts) | EVMClient (Morpho Blue + ERC4626), CronCapability |
| 5 | CCIP Lane Health | [`workflows/ccip-lane-health/my-workflow/main.ts`](./workflows/ccip-lane-health/my-workflow/main.ts) | EVMClient (CCIP Router + OnRamp + TokenPool), CronCapability |
| 6 | Curve Pool | [`workflows/curve-pool/my-workflow/main.ts`](./workflows/curve-pool/my-workflow/main.ts) | EVMClient (Curve + LINK/USD feed), CronCapability |
| 7 | Governance Monitor | [`workflows/governance-monitor/my-workflow/main.ts`](./workflows/governance-monitor/my-workflow/main.ts) | HTTPClient + consensus, CronCapability |
| 8 | Token Flows | [`workflows/token-flows/my-workflow/main.ts`](./workflows/token-flows/my-workflow/main.ts) | EVMClient (50+ ERC20 reads), CronCapability |

### Composite Intelligence

| File | Description |
|------|-------------|
| [`scripts/composite-laa-intelligence.mjs`](./scripts/composite-laa-intelligence.mjs) | Phase 1.5: reads all workflow snapshots, calls AI for cross-workflow analysis |
| [`platform/cre_analyze_endpoint.py`](./platform/cre_analyze_endpoint.py) | Flask AI server: `/api/cre/analyze-composite` (GPT-5.3-Codex), `/api/cre/analyze` (Claude Haiku), `/api/cre/analyze-arb` (GPT-5.3-Codex) |

### On-Chain Contract

| File | Description |
|------|-------------|
| [`contracts/SentinelRegistry.sol`](./contracts/SentinelRegistry.sol) | `OrbitalSentinelRegistry` on Sepolia. [Audit](./AUDIT-REPORT.md). Address: [`0xE5B1...1d40`](https://sepolia.etherscan.io/address/0xE5B1b708b237F9F0F138DE7B03EEc1Eb1a871d40) |

### Bridge Scripts

| File | Description |
|------|-------------|
| [`scripts/sentinel-unified-cycle.sh`](./scripts/sentinel-unified-cycle.sh) | Master: Phase 1 (7 CRE sims) + Phase 1.5 (composite AI) + Phase 2 (on-chain proofs). 7x/day. |
| [`scripts/record-all-snapshots.mjs`](./scripts/record-all-snapshots.mjs) | Bridge: reads 8 workflow snapshots + composite, writes keccak256 proofs to Sepolia |

### ABI Files

| File | Contract |
|------|----------|
| `workflows/link-ai-arbitrage/contracts/abi/CurveStableSwapNG.ts` | Curve StableSwap NG (balances, get_dy) |
| `workflows/link-ai-arbitrage/contracts/abi/PriorityPool.ts` | Priority Pool (poolStatus, totalQueued) |
| `workflows/link-ai-arbitrage/contracts/abi/ArbVault.ts` | Arb Vault (totalStLINKHeld, minProfitBps) |
| `workflows/treasury-risk/contracts/abi/StakingPool.ts` | Chainlink staking pool |
| `workflows/treasury-risk/contracts/abi/RewardVault.ts` | Chainlink reward vault |
| `workflows/price-feeds/contracts/abi/PriceFeedAggregator.ts` | Chainlink AggregatorV3 |
| `workflows/ccip-lane-health/contracts/abi/CCIPRouter.ts` | CCIP Router |
| `workflows/ccip-lane-health/contracts/abi/CCIPOnRamp.ts` | CCIP OnRamp |
| `workflows/ccip-lane-health/contracts/abi/LockReleaseTokenPool.ts` | CCIP TokenPool |
| `workflows/morpho-vault-health/contracts/abi/MorphoBlue.ts` | Morpho Blue market |
| `workflows/morpho-vault-health/contracts/abi/ERC4626Vault.ts` | ERC4626 vault |
| `workflows/curve-pool/contracts/abi/CurvePool.ts` | Curve StableSwap pool |

### Documentation

| File | Description |
|------|-------------|
| [`CHAINLINK.md`](./CHAINLINK.md) | Complete Chainlink touchpoint map |
| [`AUDIT-REPORT.md`](./AUDIT-REPORT.md) | SentinelRegistry security audit |
| [`docs/CRE-ECOSYSTEM-REFERENCE.md`](./docs/CRE-ECOSYSTEM-REFERENCE.md) | CRE SDK patterns and capabilities |
| [`docs/submission.md`](./docs/submission.md) | Hackathon submission |

---

## Demo

**Video:** [Convergence26' | Orbital-Sentinel](https://www.youtube.com/watch?v=CR2ckpE-SC8)

**Live now:** [sentinel.schuna.co.il](https://sentinel.schuna.co.il) shows the full dashboard with real workflow status, CRE signals, and on-chain proof history.

**Whitepaper:** [sentinel.schuna.co.il/whitepaper.html](https://sentinel.schuna.co.il/whitepaper.html) covers full architecture, composite intelligence, and verification model.

---

## Deployment Status

**LAA workflow live on CRE mainnet** since March 2026. 8 workflows implemented (1 on DON, 7 local simulate), on-chain proofs written to SentinelRegistry on Sepolia (deduplicated, only changed assessments recorded).

## Live Dashboard

**[sentinel.schuna.co.il](https://sentinel.schuna.co.il)**: workflow status, on-chain proof history, CRE signals.

## Built For

**Chainlink Convergence Hackathon 2026**
Tracks: CRE & AI + DeFi & Tokenization + Autonomous Agents

**By:** [Orbital](https://github.com/Tokenized2027)

**License:** MIT
