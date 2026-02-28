# Orbital Sentinel

**Autonomous AI agent platform for DeFi protocol health monitoring, built on Chainlink CRE.**

Orbital Sentinel runs 5 production CRE workflows that continuously read live Ethereum mainnet data, feed it through a Claude AI analysis layer, and write verifiable risk proofs on-chain. No human in the loop. Every monitoring run produces an immutable audit trail on Sepolia.

---

## What It Does

```
Chainlink CRE Workflow
  ├── Read on-chain data (EVMClient → mainnet contracts)
  ├── Fetch off-chain signals (HTTPClient → price feeds, governance, lending)
  ├── POST to AI analysis endpoint (Claude Haiku → risk assessment)
  └── Write proof on-chain (SentinelRegistry.sol → Sepolia)
```

Each workflow runs autonomously on a cron schedule. Alerts fire when thresholds are breached. Every run is anchored on-chain.

---

## The 5 Workflows

### 1. `treasury-risk` — Protocol Treasury Health
Monitors staking pool utilization, reward vault runway, lending market exposure, and priority queue depth. Computes an overall risk score (`ok / warning / critical`) and calls Claude Haiku for a structured assessment. Writes a `keccak256` snapshot hash to `SentinelRegistry` on Sepolia.

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
    │  Risk Output │  │ Claude Haiku │  │ SentinelReg  │
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

Every treasury-risk workflow run writes a verifiable hash to `OrbitalSentinelRegistry` on Sepolia:

```solidity
function recordHealth(bytes32 snapshotHash, string calldata riskLevel) external
event HealthRecorded(bytes32 indexed snapshotHash, string riskLevel, uint256 ts)
```

`snapshotHash = keccak256(abi.encode(timestamp, riskLevel, aiAssessmentSnippet))`

Deployed address: `[TODO — deploy to Sepolia and update here]`

View on Sepolia Etherscan: `[TODO]`

---

## Project Structure

```
orbital-sentinel/
├── workflows/
│   ├── treasury-risk/          ← Main workflow: EVM reads + AI + on-chain write
│   ├── governance-monitor/     ← DAO proposal monitoring
│   ├── price-feeds/            ← Chainlink Data Feed reads
│   ├── morpho-vault-health/    ← Lending market utilization
│   └── token-flows/            ← Whale & holder tracking
├── contracts/
│   └── SentinelRegistry.sol    ← On-chain risk proof registry (Sepolia)
├── platform/
│   └── cre_analyze_endpoint.py ← Flask AI analysis server (Claude Haiku)
├── README.md
└── CHAINLINK.md                ← All Chainlink touchpoints documented
```

---

## Built For

**Chainlink Convergence Hackathon 2026**
Tracks: AI Agents + DeFi & Tokenization

**By:** [Orbital](https://github.com/Tokenized2027) — managed AI ops platform for DeFi protocols.
