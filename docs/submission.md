# Orbital Sentinel: Hackathon Submission

## Quick Info

| Field | Value |
|-------|-------|
| Project Name | Orbital Sentinel |
| Tagline | Autonomous AI agent platform monitoring DeFi protocol health via 8 CRE workflows with LAA live on mainnet DON and real on-chain risk proofs |
| Team Size | 1 |
| Prize Tracks | CRE & AI, DeFi & Tokenization, Autonomous Agents (Moltbook) |
| GitHub | https://github.com/Tokenized2027/orbital-sentinel |
| Chainlink Usage | https://github.com/Tokenized2027/orbital-sentinel/blob/main/CHAINLINK.md |
| Contract (Sepolia) | https://sepolia.etherscan.io/address/0x35EFB15A46Fa63262dA1c4D8DE02502Dd8b6E3a5 |
| Demo Video | https://www.youtube.com/watch?v=CR2ckpE-SC8 |
| Companion Vault Audits | https://github.com/Tokenized2027/orbital-sentinel/blob/main/docs/arb-vault-security-audit.md and https://github.com/Tokenized2027/orbital-sentinel/blob/main/docs/arb-vault-production-readiness.md |

---

## Project Description (copy-paste ready)

Orbital Sentinel is an autonomous AI agent platform that monitors DeFi protocol health using Chainlink CRE workflows. The flagship LAA workflow is **live on the CRE mainnet DON**, running 7x/day autonomously. All 8 workflows read live Ethereum mainnet data, feed it through AI analysis (Claude Haiku + GPT-5.3-Codex), and write verifiable risk proofs on-chain to a Sepolia registry contract. On-chain proofs are written autonomously, with contract-level deduplication ensuring only changed assessments produce new records.

The execution layer that LAA can monitor, the **stLINK Premium Arbitrage Vault**, is audited separately and those companion audit documents are bundled in this repo so reviewers can evaluate both the monitoring layer and the monitored execution layer together.

We built 8 production CRE workflows for stake.link (the largest Chainlink liquid staking protocol):

1. **Treasury Risk:** reads staking pool contracts (getTotalPrincipal, getMaxPoolSize, getRewardBuckets) via EVMClient, computes risk scores across 4 dimensions, calls Claude Haiku for structured assessment, writes keccak256 snapshot hash to SentinelRegistry on Sepolia.

2. **Governance Monitor:** polls Snapshot GraphQL + Discourse forum via HTTPClient with consensusIdenticalAggregation, flags urgent votes (<24h remaining), ranks proposal urgency.

3. **Price Feeds:** reads Chainlink Data Feed contracts (LINK/USD, ETH/USD, POL/USD) via latestAnswer(), computes stLINK/LINK depeg in basis points on Ethereum mainnet.

4. **Morpho Vault Health:** reads Morpho Blue market utilization rates + ERC4626 vault TVL via EVMClient, flags high utilization (liquidity crunch risk).

5. **Token Flows:** tracks SDL + stLINK balances across 50+ classified addresses (NOPs, whales, DEX pools, vesting) via EVMClient, detects large movements indicating protocol stress.

6. **CCIP Lane Health:** monitors Chainlink CCIP lane availability by reading Router, OnRamp paused state, and LockReleaseTokenPool rate limiter buckets via EVMClient. Detects paused lanes and rate limiter depletion.

7. **Curve Pool Monitor:** reads the Curve LINK/stLINK StableSwap pool (balances, amplification factor, virtual price) via EVMClient, computes pool imbalance percentage and TVL using LINK/USD Chainlink price feed.

8. **LINK AI Arbitrage (LAA):** monitors stLINK/LINK arbitrage opportunities via Curve StableSwap pool. Reads pool balances, premium quotes at multiple swap sizes, Priority Pool queue status, and optional Arb Vault state via EVMClient. Calls GPT-5.3-Codex for AI analysis of optimal swap timing. Computes an execution signal and writes proof to SentinelRegistry. **This workflow is live on the CRE mainnet DON.**

Every workflow run produces an immutable on-chain audit trail: a HealthRecorded event on the SentinelRegistry contract (Sepolia), containing the keccak256 hash of workflow-specific metrics. Risk levels use a prefixed format (`treasury:ok`, `feeds:warning`, `morpho:critical`, `ccip:ok`, etc.) so each proof is tagged with its source workflow. The unified cycle runs 7x/day, producing 56+ on-chain proofs per day. A bridge script (`record-all-snapshots.mjs`) batches proof hashes to SentinelRegistry on Sepolia.

The on-chain records feed back into a standalone Next.js dashboard via a collector that reads HealthRecorded events, stores them in PostgreSQL, and surfaces them with per-workflow statistics, CRE capability tags, and Sepolia Etherscan links.

---

## How We Built It

- **CRE TypeScript SDK** (`@chainlink/cre-sdk@^1.0.9`): all 8 workflows use Runner, handler, CronCapability, EVMClient, HTTPClient
- **EVMClient.callContract()**: reads staking pools, reward vaults, Morpho markets, token balances from Ethereum mainnet contracts
- **Chainlink Data Feeds**: LINK/USD, ETH/USD, POL/USD via AggregatorV3 latestAnswer()
- **HTTPClient + consensusIdenticalAggregation**: deterministic multi-source data fetching for governance and AI analysis
- **getNetwork()**: chain selector resolution (mainnet reads + Sepolia writes)
- **SentinelRegistry.sol**: minimal Solidity contract for on-chain health proofs, verified on Sourcify
- **Claude AI**: Haiku for inline risk assessments within the CRE workflow via HTTP capability
- **viem**: on-chain interaction library for recordHealth calls and event log collection
- **Next.js + Drizzle ORM**: analytics dashboard collecting and surfacing sentinel records

---

## Challenges

- Chaining EVM reads from mainnet contracts to HTTP AI call to Claude to EVM write to Sepolia within a single CRE workflow run
- Ensuring consensusIdenticalAggregation works correctly for AI analysis responses (non-deterministic output requires careful prompt engineering)
- Managing wallet/gas on Sepolia for continuous autonomous writes across 8 workflows (gas estimation, nonce management, staleness dedup)
- Building the feedback loop: on-chain events back into the analytics dashboard required a custom collector using viem getLogs

---

## Chainlink Products Used

| Product | Usage |
|---------|-------|
| CRE SDK | All 8 workflow definitions, Runner, handler |
| EVMClient | 10+ mainnet contract reads per workflow run |
| Data Feeds | LINK/USD, ETH/USD, POL/USD price oracles |
| HTTPClient | AI analysis endpoint + governance data fetching |
| CronCapability | Autonomous scheduling (LAA: 7x/day on DON; others: 15/30 min local simulate) |
| getNetwork() | Chain selector for mainnet + Sepolia |
