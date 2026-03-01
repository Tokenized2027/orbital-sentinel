# Orbital Sentinel — Verification Guide

## What the On-Chain Proofs Prove

Every CRE workflow run produces a **keccak256 hash** that is written to the [SentinelRegistry contract on Sepolia](https://sepolia.etherscan.io/address/0xE5B1b708b237F9F0F138DE7B03EEc1Eb1a871d40).

Each record proves:

1. **Data integrity** — The hash is a deterministic fingerprint of the exact metrics observed. If anyone later modifies a snapshot, the hash won't match.
2. **Temporal ordering** — Sepolia block timestamps provide an unforgeable record of *when* each health assessment was made.
3. **Risk classification** — The risk level string (e.g., `treasury:critical`, `feeds:ok`) is stored in plaintext, creating a queryable history of protocol health.

## How Hashing Works

Each workflow encodes its key metrics using Solidity ABI encoding, then computes `keccak256` of the result.

### Example: Treasury Workflow

```
ABI-encode(
  uint256 timestamp,      // Unix seconds from generated_at_utc
  string  workflow,       // "treasury"
  string  risk,           // "critical" | "warning" | "ok"
  uint256 fillPct,        // Community pool fill × 10,000
  uint256 runway          // Reward runway days × 100
)
→ keccak256(encoded_bytes)
→ bytes32 snapshotHash
```

### Per-Workflow Fields

| Workflow | Encoded Fields |
|----------|---------------|
| **Treasury** | timestamp, workflow, risk, fillPct (×10⁴), runwayDays (×100) |
| **Feeds** | timestamp, workflow, risk, stLINK/LINK ratio (×10⁶), depeg bps (×100) |
| **Governance** | timestamp, workflow, risk, activeProposals, urgentProposals |
| **Morpho** | timestamp, workflow, risk, utilization (×10⁶), totalSupply |
| **Curve** | timestamp, workflow, risk, imbalancePct (×100), tvlUsd |
| **CCIP** | timestamp, workflow, risk, okLanes, totalLanes |

All multipliers are used to preserve decimal precision in `uint256` (Solidity has no floats).

## How to Verify a Record

### Step 1: Get the snapshot data

Each workflow produces a JSON file (e.g., `cre_treasury_snapshot.json`) with `generated_at_utc` and the relevant metrics.

### Step 2: Reproduce the hash

Using viem (or ethers.js):

```javascript
import { keccak256, encodeAbiParameters, parseAbiParameters } from 'viem';

// Example: treasury snapshot
const ts = BigInt(Math.floor(new Date('2026-03-01T01:44:17Z').getTime() / 1000));
const fillPct = BigInt(Math.round(100 * 10000));  // 100% × 10,000
const runway = BigInt(Math.round(572.84 * 100));    // days × 100

const encoded = encodeAbiParameters(
  parseAbiParameters('uint256 ts, string wf, string risk, uint256 fillPct, uint256 runway'),
  [ts, 'treasury', 'critical', fillPct, runway],
);

const hash = keccak256(encoded);
// Compare this hash with the snapshotHash in the HealthRecorded event
```

### Step 3: Check on-chain

Query the `HealthRecorded` events on the SentinelRegistry contract:

```javascript
const logs = await publicClient.getLogs({
  address: '0xE5B1b708b237F9F0F138DE7B03EEc1Eb1a871d40',
  event: {
    type: 'event',
    name: 'HealthRecorded',
    inputs: [
      { name: 'snapshotHash', type: 'bytes32', indexed: true },
      { name: 'riskLevel', type: 'string' },
      { name: 'timestamp', type: 'uint256' },
    ],
  },
});
```

If your computed hash matches a `snapshotHash` from the logs, the data is verified.

## Trust Model

### Current (Hackathon Demo)

```
CRE Workflow (local simulate)
       ↓
  Snapshot JSON (real mainnet data)
       ↓
  keccak256 hash
       ↓
  Single deployer key → SentinelRegistry (Sepolia)
```

**Trust assumption:** The operator running `cre simulate` is honest. The on-chain data reads are real (Ethereum mainnet via public RPCs), but a single key signs all proof transactions. The data is *verifiable* (anyone can recompute the hash) but not yet *trustless* (you trust the operator didn't modify the data before hashing).

### Production (DON Attestation)

```
CRE Workflow (Decentralized Oracle Network)
       ↓
  N independent nodes execute the same workflow
       ↓
  Consensus on results (f+1 agreement)
       ↓
  Attested proof → On-chain (trustless)
```

**Trust assumption:** Chainlink's DON provides Byzantine fault tolerance — no single party can fabricate results. The observation, computation, and proof are all decentralized.

### What CRE Adds

The value of CRE isn't just the hashing (you could hash data without CRE). CRE provides:

1. **Standardized workflow format** — Portable, auditable workflow definitions (YAML + TypeScript)
2. **Built-in capabilities** — EVMClient for contract reads, HTTPClient for API calls, CronCapability for scheduling
3. **Path to decentralization** — Same workflow code runs locally in `simulate` mode and on the DON in production
4. **Consensus aggregation** — `consensusIdenticalAggregation` ensures all nodes agree on the same data before proceeding

## Contract Details

| Field | Value |
|-------|-------|
| Contract | `SentinelRegistry` |
| Address | `0xE5B1b708b237F9F0F138DE7B03EEc1Eb1a871d40` |
| Network | Sepolia Testnet |
| Verified | [Sourcify](https://repo.sourcify.dev/contracts/full_match/11155111/0xE5B1b708b237F9F0F138DE7B03EEc1Eb1a871d40/) |
| Key Function | `recordHealth(bytes32 snapshotHash, string riskLevel)` |
| Event | `HealthRecorded(bytes32 indexed snapshotHash, string riskLevel, uint256 timestamp)` |
| View | `count() → uint256` (total records) |
| Owner | Deployer-only `recordHealth` access |

## Staleness Protection

The bridge script (`record-all-snapshots.mjs`) enforces:

- **45-minute staleness threshold** — Snapshots older than 45 minutes are skipped
- **Deduplication** — The `generated_at_utc` of each snapshot is tracked; unchanged snapshots are not re-committed
- **Multi-RPC fallback** — Cycles through 4 Sepolia RPCs if any single one fails
- **Non-zero exit only on total failure** — Partial success (some workflows written, some skipped) exits cleanly
