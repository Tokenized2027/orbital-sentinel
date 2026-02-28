# Orbital Sentinel — Hackathon Submission

## Quick Info

| Field | Value |
|-------|-------|
| Project Name | Orbital Sentinel |
| Tagline | Autonomous AI agent platform monitoring DeFi protocol health via 5 CRE workflows with on-chain risk proofs |
| Team Size | 1 |
| Prize Tracks | CRE & AI, DeFi & Tokenization, Autonomous Agents (Moltbook) |
| GitHub | https://github.com/Tokenized2027/orbital-sentinel |
| Chainlink Usage | https://github.com/Tokenized2027/orbital-sentinel/blob/main/CHAINLINK.md |
| Contract (Sepolia) | https://sepolia.etherscan.io/address/0xAFc081cde50fA2Da7408f4E811Ca9dE128f7B334 |
| Demo Video | (YouTube link — TBD) |

---

## Project Description (copy-paste ready)

Orbital Sentinel is an autonomous AI agent platform that monitors DeFi protocol health using Chainlink CRE workflows. No human in the loop — every monitoring run reads live Ethereum mainnet data, feeds it through Claude AI analysis, and writes a verifiable risk proof on-chain to a Sepolia registry contract.

We built 5 production CRE workflows for stake.link (the largest Chainlink liquid staking protocol):

1. **Treasury Risk** — reads staking pool contracts (getTotalPrincipal, getMaxPoolSize, getRewardBuckets) via EVMClient, computes risk scores across 4 dimensions, calls Claude for structured assessment, writes keccak256 snapshot hash to SentinelRegistry on Sepolia.

2. **Governance Monitor** — polls Snapshot GraphQL + Discourse forum via HTTPClient with consensusIdenticalAggregation, flags urgent votes (<24h remaining), ranks proposal urgency.

3. **Price Feeds** — reads Chainlink Data Feed contracts (LINK/USD, ETH/USD, POL/USD) via latestAnswer(), computes stLINK/LINK depeg in basis points across Ethereum and Polygon.

4. **Morpho Vault Health** — reads Morpho Blue market utilization rates + ERC4626 vault TVL via EVMClient, flags high utilization (liquidity crunch risk).

5. **Token Flows** — tracks SDL + stLINK balances across 50+ classified addresses (NOPs, whales, DEX pools, vesting contracts). Detects large movements that may indicate protocol stress.

Every treasury-risk run produces an immutable on-chain audit trail: a HealthRecorded event on the SentinelRegistry contract (Sepolia), containing the keccak256 hash of the full risk snapshot. The contract has 50+ records from 7 daily autonomous runs — no manual triggering.

The on-chain records also feed back into our analytics dashboard via a collector that reads HealthRecorded events, stores them in PostgreSQL, and surfaces them in a CRE Operations Console alongside live depeg monitoring, service health, and operator controls.

---

## How We Built It

- **CRE TypeScript SDK** (`@chainlink/cre-sdk@1.1.2`) — all 5 workflows use Runner, handler, CronCapability, EVMClient, HTTPClient
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
- Managing wallet/gas on Sepolia for continuous autonomous writes (7x daily, gas estimation, nonce management)
- Building the feedback loop: on-chain events back into the analytics dashboard required a custom collector using viem getLogs

---

## Chainlink Products Used

| Product | Usage |
|---------|-------|
| CRE SDK | All 5 workflow definitions, Runner, handler |
| EVMClient | 10+ mainnet contract reads per workflow run |
| Data Feeds | LINK/USD, ETH/USD, POL/USD price oracles |
| HTTPClient | AI analysis endpoint + governance data fetching |
| CronCapability | Autonomous scheduling (15/30 min intervals) |
| getNetwork() | Chain selector for mainnet + Sepolia |
</content>
</invoke>