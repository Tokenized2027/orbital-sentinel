# How Orbital Sentinel Works

> A plain-language guide to what Orbital Sentinel does, what goes on-chain, and how Chainlink CRE powers it all.

## The One-Liner

Orbital Sentinel reads live DeFi protocol data directly from smart contracts, compresses the key numbers into a fingerprint (hash), and writes that fingerprint on-chain 7 times per day. Anyone can verify the data is real by re-running the same workflow and checking that their hash matches.

---

## What Problem Does This Solve?

DeFi dashboards typically pull data from APIs, databases, or third-party aggregators. There's no way to prove the numbers shown are accurate or that they haven't been tampered with.

Orbital Sentinel flips this: every metric displayed on the dashboard has a corresponding **proof hash** stored on the Ethereum Sepolia blockchain. The hash is a cryptographic fingerprint of the raw data. If even one number changes, the hash is completely different. This creates an auditable, tamper-proof record of protocol health over time.

---

## The Eight Workflows

Sentinel monitors eight aspects of the stake.link protocol. Each one is an independent program (called a "workflow") that reads on-chain data and produces a health snapshot.

### 1. Staking Pools (Treasury)

**What it reads:** How much LINK is staked in the community pool, the operator pool, and the priority pool queue. Also checks the rewards vault balance and how many days of rewards remain.

**What the hash encodes:**
| Field | Example Value | What It Means |
|-------|--------------|---------------|
| Community Staked | 40,875,000 LINK | Total LINK in the community staking pool |
| Community Cap | 40,875,000 LINK | Maximum the pool can hold |
| Community Fill | 100% | Pool is completely full |
| Operator Staked | 1,732,296 LINK | LINK staked by node operators |
| Operator Cap | 4,125,000 LINK | Operator pool maximum |
| Operator Fill | 42% | Operator pool is less than half full |
| Queue | 361,030 LINK | LINK waiting in the priority pool queue |
| Rewards Vault | 3,178,091 LINK | LINK available for reward distribution |
| Runway | 572 days | How long rewards last at current emission rate |

**Risk level:** Critical (community pool at 100% capacity with 361K LINK queued).

---

### 2. stLINK Peg Monitor (Price Feeds)

**What it reads:** The stLINK/LINK price ratio from Chainlink oracles, plus ETH and LINK USD prices.

**What the hash encodes:**
| Field | Example Value | What It Means |
|-------|--------------|---------------|
| stLINK/LINK Ratio | 1.0091 | stLINK is trading at a 0.91% premium to LINK |
| Depeg (bps) | 91.3 | Distance from 1:1 parity, in basis points |
| LINK/USD | $9.12 | Current LINK price from Chainlink oracle |
| ETH/USD | $2,037.05 | Current ETH price from Chainlink oracle |

**Why it matters:** If stLINK depegs significantly from LINK (say, trades at 0.90 instead of ~1.0), it signals liquidity stress. The hash permanently records the ratio at each checkpoint.

---

### 3. Morpho Vault Health

**What it reads:** The Morpho Blue lending market where wstLINK is used as collateral to borrow LINK. Reads utilization, supply/borrow totals, vault share price, and — crucially — the **interest rate directly from the on-chain IRM (Interest Rate Model) contract**.

**What the hash encodes:**
| Field | Example Value | What It Means |
|-------|--------------|---------------|
| Utilization | 89.38% | How much of supplied LINK is currently borrowed |
| Total Supplied | 142,824 LINK | Total LINK deposited as supply |
| Total Borrowed | 127,665 LINK | Total LINK currently borrowed |
| Share Price | 1.0029 | Vault share value (grows with earned interest) |
| Vault Assets | 142,826 LINK | Total assets held by the vault |
| Borrow APY | 3.43% | Annual cost of borrowing (from IRM contract) |
| Supply APY | 3.06% | Annual yield for suppliers (from IRM contract) |

**How APY is calculated on-chain:** The workflow calls `idToMarketParams()` on MorphoBlue to find the IRM contract address, then calls `borrowRateView()` on the IRM to get the per-second borrow rate. Supply APY = borrow rate * utilization * (1 - protocol fee). No APIs, no oracles for this — pure smart contract math.

---

### 4. Curve Pool Composition

**What it reads:** The stLINK/LINK Curve pool balances, virtual price, TVL, and **gauge incentive data** (reward tokens, emission rates, staked LP).

**What the hash encodes:**
| Field | Example Value | What It Means |
|-------|--------------|---------------|
| LINK Balance | 179,134 LINK | LINK sitting in the pool |
| stLINK Balance | 376,230 stLINK | stLINK sitting in the pool |
| Imbalance | 17.7% | How far off from a 50/50 split |
| Virtual Price | 1.0133 | LP token value (grows with trading fees) |
| TVL | $5.06M | Total value locked in the pool |
| LINK/USD | $9.12 | Price used for TVL calculation |
| Gauge Staked | 545,258 LP | LP tokens staked in the gauge for rewards |
| Reward Tokens | 2 | Number of active incentive streams |
| Total Reward Rate | 16.7e15 wei/sec | Combined emission rate of all reward tokens |

**Why gauge data matters:** The gauge tells you whether incentives are actively flowing to liquidity providers. If rewards dry up (rate drops to zero or `periodFinish` passes), LPs may withdraw, reducing pool depth and making large stLINK exits more expensive.

---

### 5. Governance (SLURPs)

**What it reads:** Active and recent governance proposals from Snapshot (stake.link's voting platform).

**What the hash encodes:**
| Field | Example Value | What It Means |
|-------|--------------|---------------|
| Active Proposals | 1 | Currently open for voting |
| Urgent Proposals | 0 | None closing within 24 hours |
| 7 Recent SLURPs | Bit-packed | SLURP number, YES%, vote count, pass/fail for each |

The 7 most recent SLURPs are compressed into 4 numbers using bit-packing:
- **SLURP-61** (active): 3 votes, 100% yes, passing
- **SLURP-60** through **SLURP-45**: all passed unanimously

**What's bit-packing?** Instead of storing 7 separate records, each SLURP's number (e.g., 61) is stored in a 16-bit slot within a single 256-bit number. Seven SLURPs fit into one number. The same technique is used for vote percentages and vote counts. Pass/fail outcomes use just 1 bit each (1 = passed, 0 = rejected), so all 7 fit in 7 bits.

---

### 6. CCIP Lane Health

**What it reads:** The status of Chainlink CCIP (Cross-Chain Interoperability Protocol) bridges that carry wstLINK between chains.

**What the hash encodes:**
| Field | Example Value | What It Means |
|-------|--------------|---------------|
| OK Lanes | 4 | Lanes operating normally |
| Total Lanes | 4 | Arbitrum, Base, Polygon (+ pool check) |

**Why it matters:** If a CCIP lane is paused or misconfigured, wstLINK can't move between chains. This workflow detects that before users try to bridge and fail.

---

### 7. Token Flows

**What it reads:** ERC20 balances of 50+ classified addresses (whales, operators, vesting contracts, team wallets) to track large LINK and stLINK movements.

**What the hash encodes:**
| Field | Example Value | What It Means |
|-------|--------------|---------------|
| Total Tracked | 12,450,000 LINK | Sum across all monitored addresses |
| Address Count | 54 | Number of addresses monitored |

**Why it matters:** Large holder movements can signal upcoming sell pressure or protocol changes. Tracking balances over time creates an early warning system for whale activity.

---

### 8. LINK AI Arbitrage (LAA)

**What it reads:** Whether an arbitrage opportunity exists between the Curve pool price and the protocol's redemption rate. Uses GPT-5.3-Codex AI analysis for signal evaluation.

**What the hash encodes:**
| Field | Example Value | What It Means |
|-------|--------------|---------------|
| Signal | "ok" | Current arb signal (execute/wait/unprofitable) |
| Premium | 17 bps | Size of the premium/discount (0.17%) |
| LINK Balance | (raw wei) | LINK available in the pool for the trade |

---

## How Chainlink CRE Powers Everything

### What is CRE?

CRE stands for **Compute Runtime Environment**. It's Chainlink's framework for running custom programs (workflows) on decentralized infrastructure. Think of it as "smart contracts that can read data and do math, but run off-chain with on-chain verification."

### The Pipeline

```
   Your Browser                    Chainlink CRE                     Ethereum
   ───────────                    ──────────────                     ────────
                                        │
                                   ┌────┴────┐
                                   │  Workflow │  (TypeScript)
                                   │  main.ts  │
                                   └────┬────┘
                                        │
                          ┌─────────────┼─────────────┐
                          ▼             ▼             ▼
                    Read Morpho    Read Curve    Read Chainlink
                    contracts      pool          price feeds
                          │             │             │
                          └─────────────┼─────────────┘
                                        │
                                  Compute metrics
                                  (APY, risk, etc.)
                                        │
                                  ABI-encode key
                                  fields → keccak256
                                        │
                                  Write proof hash ──────────► SentinelRegistry
                                  to Sepolia                   (on-chain forever)
                                        │
                                  Output JSON ──────────► Dashboard
                                  snapshot                (for display)
```

### What CRE Provides

1. **EVMClient** — CRE's built-in capability to read any smart contract on any EVM chain. The workflow calls `EVMClient.callContract()` with ABI-encoded function data, and CRE routes it through configured RPCs. This is how all 8 workflows read on-chain state.

2. **CronCapability** — Schedules workflows to run on a timer (7 times per day in our unified cycle).

3. **Chain-agnostic networking** — The same workflow can read from Ethereum mainnet (for protocol data) and write to Sepolia (for proof hashes) in a single execution. CRE manages the RPC connections for both.

4. **Deterministic execution** — Given the same blockchain state, the workflow always produces the same output. This is what makes the proof hashes verifiable: anyone can run the same CRE workflow against the same block and get the same hash.

### How a Single Workflow Executes

Using the Morpho workflow as an example:

```
1. CRE triggers onCron()
         │
2. Create EVMClient for ethereum-mainnet
         │
3. Call MorphoBlue.market(marketId)
   → Returns: 142,824 LINK supplied, 127,665 LINK borrowed, 89.4% utilization
         │
4. Call MorphoBlue.idToMarketParams(marketId)
   → Returns: IRM contract address = 0x870a...
         │
5. Call AdaptiveCurveIrm.borrowRateView(params, market)
   → Returns: 1,086,015,859 per second (in WAD)
         │
6. Calculate: borrowAPY = rate × 31,557,600 seconds/year = 3.43%
              supplyAPY = borrowAPY × utilization × (1 - fee) = 3.06%
         │
7. ABI-encode all fields → keccak256 → proof hash
         │
8. Create EVMClient for ethereum-testnet-sepolia
         │
9. Call SentinelRegistry.recordHealth(hash, "morpho:warning")
   → TX confirmed on Sepolia
         │
10. Output full JSON snapshot for dashboard display
```

### Running It Yourself

To simulate any workflow locally:

```bash
# Install CRE CLI
# (already at ~/.local/bin/cre)

# Run the Morpho workflow
cd workflows/morpho-vault-health
cre workflow simulate my-workflow --target "staging-settings"

# The output includes:
# - All contract reads logged
# - The computed proof hash
# - The full JSON snapshot
```

The simulation uses the same CRE runtime that would run on Chainlink DON nodes in production. The only difference is that simulation runs on your machine against public RPCs, while production would run across multiple decentralized oracle nodes with consensus.

---

## The Proof Model

### Why Hashes Instead of Raw Data?

Storing the full snapshot on-chain would cost hundreds of dollars in gas per write. A keccak256 hash is always 32 bytes regardless of input size, costing only ~21,000 gas (~$0.01 on Sepolia, ~$2-5 on mainnet).

### How Verification Works

1. **Record:** Sentinel writes `keccak256(abi.encode(timestamp, "morpho", "warning", 893800, 142824, ...))` to the SentinelRegistry contract.

2. **Verify:** Anyone can:
   - Run the same CRE workflow against the same block
   - ABI-encode the same fields in the same order
   - Hash the result
   - Compare with what's stored on-chain
   - If they match, the data is proven authentic

3. **Audit trail:** The SentinelRegistry stores every hash with a timestamp and risk level string. This creates a permanent, tamper-proof history of protocol health assessments.

### Current Stats

- **49 proof records** on Sepolia (as of March 1, 2026)
- **8 workflows** running simultaneously
- **Registry contract:** `0xE5B1b708b237F9F0F138DE7B03EEc1Eb1a871d40`
- All records verifiable on [Sepolia Etherscan](https://sepolia.etherscan.io/address/0xE5B1b708b237F9F0F138DE7B03EEc1Eb1a871d40)

---

## Summary

| Layer | What | How |
|-------|------|-----|
| **Data Source** | Smart contracts on Ethereum mainnet | CRE EVMClient reads directly — no APIs, no aggregators |
| **Compute** | Risk assessment, APY calculation, metric extraction | CRE TypeScript workflows with deterministic execution |
| **Proof** | keccak256 hash of ABI-encoded metrics | Written to SentinelRegistry on Sepolia via CRE EVMClient |
| **Display** | Dashboard with real-time protocol health | Next.js app reading JSON snapshots from CRE output |
| **Verification** | Anyone can re-run and compare hashes | Same CRE workflow + same block = same hash |

The key innovation: **every number on the dashboard has a cryptographic receipt on-chain.** Not "trust us, the API said so" — but "here's the hash, run it yourself."
