# Orbital Sentinel — Hackathon Submission

## Quick Info

| Field | Value |
|-------|-------|
| Project Name | Orbital Sentinel |
| Tagline | Autonomous AI agent platform monitoring DeFi protocol health via 7 CRE workflows with real on-chain risk proofs |
| Team Size | 1 |
| Prize Tracks | CRE & AI, DeFi & Tokenization, Autonomous Agents (Moltbook) |
| GitHub | https://github.com/Tokenized2027/orbital-sentinel |
| Chainlink Usage | https://github.com/Tokenized2027/orbital-sentinel/blob/main/CHAINLINK.md |
| Contract (Sepolia) | https://sepolia.etherscan.io/address/0xE5B1b708b237F9F0F138DE7B03EEc1Eb1a871d40 |
| Demo Video | (YouTube link — TBD) |

---

## Project Description (copy-paste ready)

Orbital Sentinel is an autonomous AI agent platform that monitors DeFi protocol health using Chainlink CRE workflows. No human in the loop — every monitoring run reads live Ethereum mainnet data, feeds it through Claude AI analysis, and writes a verifiable risk proof on-chain to a Sepolia registry contract.

We built 7 production CRE workflows for stake.link (the largest Chainlink liquid staking protocol):

1. **Treasury Risk** — reads staking pool contracts (getTotalPrincipal, getMaxPoolSize, getRewardBuckets) via EVMClient, computes risk scores across 4 dimensions, calls Claude for structured assessment, writes keccak256 snapshot hash to SentinelRegistry on Sepolia.

2. **Governance Monitor** — polls Snapshot GraphQL + Discourse forum via HTTPClient with consensusIdenticalAggregation, flags urgent votes (<24h remaining), ranks proposal urgency.

3. **Price Feeds** — reads Chainlink Data Feed contracts (LINK/USD, ETH/USD) via latestAnswer(), computes stLINK/LINK depeg in basis points on Ethereum mainnet.

4. **Morpho Vault Health** — reads Morpho Blue market utilization rates + ERC4626 vault TVL via EVMClient, flags high utilization (liquidity crunch risk).

5. **Token Flows** — tracks SDL + stLINK balances across 50+ classified addresses (NOPs, whales, DEX pools, vesting) via EVMClient, detects large movements indicating protocol stress.

6. **CCIP Lane Health** — monitors Chainlink CCIP lane availability by reading Router, OnRamp paused state, and LockReleaseTokenPool rate limiter buckets via EVMClient. Detects paused lanes and rate limiter depletion.

7. **Curve Pool Monitor** — reads the Curve LINK/stLINK StableSwap pool (balances, amplification factor, virtual price) via EVMClient, computes pool imbalance percentage and TVL using LINK/USD Chainlink price feed.

Every workflow run produces an immutable on-chain audit trail: a HealthRecorded event on the SentinelRegistry contract (Sepolia), containing the keccak256 hash of workflow-specific metrics. Risk levels use a prefixed format (`treasury:ok`, `feeds:warning`, `morpho:critical`, `ccip:ok`, etc.) so each proof is tagged with its source workflow. A bridge script (`record-all-snapshots.mjs`) reads live CRE snapshots 7 times per day (~3h 25min apart) and writes proofs on-chain for all 7 workflows — fully autonomous, no manual triggering.

The on-chain records feed back into a standalone Next.js dashboard via a collector that reads HealthRecorded events, stores them in PostgreSQL, and surfaces them with per-workflow statistics, CRE capability tags, and Sepolia Etherscan links.

---

## How We Built It

- **CRE TypeScript SDK** (`@chainlink/cre-sdk@^1.0.9`) — all 7 workflows use Runner, handler, CronCapability, EVMClient, HTTPClient
- **EVMClient.callContract()** — reads staking pools, reward vaults, Morpho markets, token balances from Ethereum mainnet contracts
- **Chainlink Data Feeds** — LINK/USD, ETH/USD via AggregatorV3 latestAnswer()
- **HTTPClient + consensusIdenticalAggregation** — deterministic multi-source data fetching for governance and AI analysis
- **getNetwork()** — chain selector resolution (mainnet reads + Sepolia writes)
- **SentinelRegistry.sol** — minimal Solidity contract for on-chain health proofs, verified on Sourcify
- **Claude AI** — Haiku for inline risk assessments within the CRE workflow via HTTP capability
- **viem** — on-chain interaction library for recordHealth calls and event log collection
- **Next.js + Drizzle ORM** — analytics dashboard collecting and surfacing sentinel records

---

## Challenges

- Chaining EVM reads from mainnet contracts → HTTP AI call to Claude → EVM write to Sepolia within a single CRE workflow simulate run
- Ensuring consensusIdenticalAggregation works correctly for AI analysis responses (non-deterministic output needs careful prompt engineering)
- Managing wallet/gas on Sepolia for continuous autonomous writes across 7 workflows (gas estimation, nonce management, staleness dedup)
- Building the feedback loop: on-chain events back into the analytics dashboard required a custom collector using viem getLogs

---

## Chainlink Products Used

| Product | Usage |
|---------|-------|
| CRE SDK | All 7 workflow definitions, Runner, handler |
| EVMClient | 10+ mainnet contract reads per workflow run |
| Data Feeds | LINK/USD, ETH/USD, POL/USD price oracles |
| HTTPClient | AI analysis endpoint + governance data fetching |
| CronCapability | Autonomous scheduling (15/30 min intervals) |
| getNetwork() | Chain selector for mainnet + Sepolia |
</content>
</invoke>