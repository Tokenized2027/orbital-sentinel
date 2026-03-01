# Chainlink Runtime Environment (CRE) — Ecosystem Reference

Last updated: 2026-03-01

This document provides CRE ecosystem context for Orbital Sentinel. For the workflow-level Chainlink usage mapping, see [CHAINLINK.md](../CHAINLINK.md).

---

## What CRE Is

CRE is Chainlink's all-in-one orchestration layer for building verifiable, decentralized workflows. At its core are **Capabilities** — modular services each powered by an independent DON (Decentralized Oracle Network).

Developers invoke capabilities through SDK interfaces (`EVMClient`, `HTTPClient`, `CronCapability`), never interacting with DON infrastructure directly. The SDK handles consensus verification, message encoding, and result processing.

### Available Capabilities

| Capability | Type | What It Does | Used in Sentinel? |
|-----------|------|-------------|-------------------|
| **Cron** | Trigger | Time-based scheduling | Yes — all 8 workflows |
| **HTTP** | Trigger | Incoming webhooks | No |
| **EVM Log** | Trigger | Smart contract event listeners | No (potential upgrade) |
| **HTTP Client** | Execution | Fetch/post external APIs with DON consensus | Yes — treasury-risk, governance, price-feeds |
| **Confidential HTTP** | Execution | Privacy-preserving API calls with enclave execution | No (potential upgrade) |
| **EVM Read** | Execution | Read smart contracts with DON consensus | Yes — all 8 workflows |
| **EVM Write** | Execution | Write to smart contracts with DON consensus | Yes — SentinelRegistry writes |

All execution capabilities use built-in consensus to validate results across multiple nodes.

---

## How Sentinel Uses CRE

### Capability Map per Workflow

| Workflow | EVMClient (read) | EVMClient (write) | HTTPClient | CronCapability | Consensus |
|----------|-----------------|-------------------|-----------|----------------|-----------|
| treasury-risk | Staking pools, LINK balance | SentinelRegistry | Analytics API, AI analysis | 15 min | consensusIdenticalAggregation |
| governance-monitor | — | SentinelRegistry | Snapshot GraphQL, Discourse | 30 min | consensusIdenticalAggregation |
| price-feeds | Chainlink Data Feeds | SentinelRegistry | Internal analytics | 15 min | consensusIdenticalAggregation |
| morpho-vault-health | Morpho Blue markets, ERC4626 | SentinelRegistry | — | 15 min | — |
| token-flows | ERC20 balanceOf (50+ addresses) | SentinelRegistry | — | 30 min | — |
| ccip-lane-health | CCIP Router, OnRamp, TokenPool | SentinelRegistry | — | 30 min | — |
| curve-pool | Curve StableSwap, LINK/USD feed | SentinelRegistry | — | 15 min | — |
| link-ai-arbitrage | Curve pool, Priority Pool, Arb Vault | SentinelRegistry | AI analysis endpoint | 15 min | consensusIdenticalAggregation |

### CRE Capabilities NOT Yet Used (Upgrade Opportunities)

| Capability | Potential Use Case |
|-----------|-------------------|
| **EVM Log Trigger** | Replace cron polling with real-time event triggers (e.g., alert on `RewardAdded`, `Staked`, `Withdrawn` events) |
| **Confidential HTTP** | Enclave-based calls to proprietary data APIs, secret-protected AI analysis |
| **HTTP Trigger** | External system webhooks (e.g., Discord bot triggers sentinel check) |
| **ConsensusMedianAggregation** | Aggregate prices from multiple sources instead of single Chainlink feed |

---

## TypeScript SDK Reference

### Package & Key Imports

```typescript
import {
  cre,
  Runner,
  type Runtime,
  type CronPayload,
  consensusIdenticalAggregation,
  getNetwork,
  encodeCallMsg,
  bytesToHex,
} from "@chainlink/cre-sdk";
```

Both direct imports and namespace imports (`cre.capabilities.EVMClient`) are supported.

### Runtime Requirements

| Dependency | Required Version | Sentinel Version |
|-----------|-----------------|-----------------|
| Bun | >= 1.2.21 | Current |
| TypeScript | >= 5.9 | Current |
| viem | ^2.34.0 | 2.34.0 |
| zod | ^3.25.76 | 3.25.76 |
| @chainlink/cre-sdk | ^1.0.9 | ^1.0.9 |

### Type System

The SDK uses Protocol Buffers internally with two type representations:
- **Type** (e.g., `CallMsg`) — Runtime types with `Uint8Array` and protobuf objects
- **TypeJson** (e.g., `CallMsgJson`) — JSON-serializable types with `string` and `number`

**Developers always use JSON types.** The SDK converts at WASM boundaries automatically.

### Canonical Workflow Pattern

All 8 Sentinel workflows follow this structure:

```typescript
// 1. Config schema (Zod validation)
const configSchema = z.object({
  schedule: z.string(),
  chainName: z.string(),
  contracts: z.object({ /* addresses */ }),
  registry: z.object({
    address: z.string(),
    chainName: z.string(),
  }),
  thresholds: z.object({ /* risk boundaries */ }),
  // Optional: analyticsApi, aiAnalysis, webhook
});

// 2. Handler
function onCron(runtime: Runtime<Config>, payload: CronPayload): string {
  const config = runtime.config();
  // Read data (EVM + HTTP) → classify risk → write registry → return JSON
  return JSON.stringify(output);
}

// 3. Init
function initWorkflow(config: Config) {
  const cron = new cre.capabilities.CronCapability();
  return [cre.handler(cron.trigger({ schedule: config.schedule }), onCron)];
}

// 4. Entry
export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}
```

### ABI Integration

ABIs are defined in TypeScript files under `contracts/abi/`:
```typescript
import { encodeFunctionData, decodeFunctionResult, formatUnits } from 'viem';
import { StakingPoolABI } from '../contracts/abi/StakingPool';

const data = encodeFunctionData({
  abi: StakingPoolABI,
  functionName: 'getTotalPrincipal',
});
```

### Chain Selector Resolution

```typescript
const mainnet = getNetwork({
  chainFamily: 'evm',
  chainSelectorName: 'ethereum-mainnet',
  isTestnet: false,
});

const sepolia = getNetwork({
  chainFamily: 'evm',
  chainSelectorName: 'ethereum-testnet-sepolia',
  isTestnet: true,
});
```

### Consensus Patterns

```typescript
// Identical aggregation — all nodes must agree on exact response
const result = http
  .sendRequest(runtime, fetchFunction, consensusIdenticalAggregation<T>())
  (args)
  .result();
```

---

## Chainlink Automation → CRE Migration

CRE supersedes Chainlink Automation for new development. Mapping:

| Automation Concept | CRE Equivalent | Sentinel Usage |
|-------------------|---------------|---------------|
| `checkUpkeep()` + `performUpkeep()` | `handler` + trigger | `onCron` handler |
| Custom logic trigger | EVM Log / HTTP trigger | CronCapability (currently) |
| Log trigger | EVM Log trigger capability | Not yet used |
| Time-based trigger | `CronCapability` | All 8 workflows |
| `StreamsLookup` revert | `HTTPClient` + consensus | treasury-risk, governance |
| Forwarder address | DON-managed execution | DON handles |

Sentinel's `StLINKArbVault` (in Orbital repo) uses traditional Automation `checkUpkeep`/`performUpkeep` — this could be migrated to CRE for unified tooling.

---

## Official CRE Resources

### Template Repositories

| Repo | Purpose | Relevance |
|------|---------|-----------|
| [smartcontractkit/cre-templates](https://github.com/smartcontractkit/cre-templates) | Starter templates and building blocks | Reference for patterns |
| [smartcontractkit/cre-cli](https://github.com/smartcontractkit/cre-cli) | CLI for building, simulating, deploying | `cre workflow simulate` |

### Relevant Templates

- **read-data-feeds** — Matches our `price-feeds` workflow pattern
- **multi-chain-token-manager** — Cross-chain CCIP rebalancing (relevant for future arb vault CRE migration)
- **bring-your-own-data** — Custom HTTP data sources (matches our `treasury-risk` analytics API pattern)

### Developer Tools

- `cre workflow simulate` — Local simulation without DON deployment
- `cre workflow deploy` — Deploy to DON
- `cre workflow monitor` — Runtime monitoring
- CRE Web UI — Browser-based debugging
- Chainlink Developer Assistant MCP Server — AI IDE integration

---

## Sentinel's On-Chain Proof Pattern

### SentinelRegistry.sol (Sepolia)

```solidity
function recordHealth(bytes32 snapshotHash, string calldata riskLevel) external
event HealthRecorded(bytes32 indexed snapshotHash, string riskLevel, uint256 ts)
```

**Risk level format:** `<workflow>:<level>` — e.g., `treasury:ok`, `feeds:warning`, `morpho:critical`

**Hash encoding** (identical TypeScript ↔ Solidity):
```typescript
const snapshotHash = keccak256(
  encodeAbiParameters(
    parseAbiParameters('uint256 ts, string wf, string risk, uint256 m1, uint256 m2'),
    [timestampUnix, workflowType, risk, metric1, metric2],
  ),
);
```

Per-workflow metric encoding:
| Workflow | metric1 | metric2 |
|----------|---------|---------|
| treasury | communityFillPct | runwayDays |
| feeds | stlinkLinkRatio * 1e6 | depegBps * 100 |
| governance | activeProposals | urgentProposals |
| morpho | utilization * 1e6 | totalSupply |
| flows | totalSdlTracked | addressCount |
| ccip | okLanes | totalLanes |
| curve | imbalancePct | tvlUsd |
| laa | premiumBps | linkBalance |

This creates an **immutable, verifiable audit trail**: every CRE workflow run produces one on-chain record.

---

## Institutional Context

CRE is adopted by major institutions for tokenized asset operations. Orbital Sentinel demonstrates the same verifiable workflow pattern used by:

- **J.P. Morgan / Ondo** — Cross-chain DvP transactions
- **Swift / UBS** — Tokenized fund workflows
- **Deutsche Borse / Crypto Finance** — Proof of Reserve feeds
- **21X** — Regulated onchain exchange with verifiable post-trade data

**stake.link** is explicitly listed as a CRE adopter alongside these institutions:

> "Many top Web3 protocols are also integrating CRE, including BridgeTower, Aerodrome, **Stake.Link**, Concero, Instruxi, and Quantamm."

Sentinel's pattern — autonomous monitoring workflows producing verifiable on-chain proofs — is directly aligned with the institutional use case for verifiable execution and audit trails.

---

## Cross-Repo Standards (Shared with Orbital)

Both `orbital-sentinel` and `orbital` repos follow these conventions:

1. **SDK version**: `@chainlink/cre-sdk@^1.0.9`
2. **Runtime**: Bun >= 1.2.21, TypeScript >= 5.9
3. **Dependencies**: viem ^2.34.0, zod ^3.25.76
4. **Config validation**: Zod schemas for all workflow configs
5. **Risk level format**: `<workflow>:<level>`
6. **On-chain proofs**: keccak256 → SentinelRegistry (Sepolia `0xE5B1b708b237F9F0F138DE7B03EEc1Eb1a871d40`)
7. **Error handling**: Graceful degradation — workflow continues if optional capabilities fail
8. **Consensus**: `consensusIdenticalAggregation` for HTTP fetches
9. **Chain selectors**: `getNetwork()` with `chainSelectorName` strings
10. **Env var schema** (from Orbital): `CHAINLINK_CRE_<FLOW>_MODE=off|observe|enforce`

---

## Cost Notes

- Workflow development and simulation: **free** (local compute)
- On-chain writes (SentinelRegistry): **Sepolia gas** (testnet, free)
- Mainnet EVM reads: **free** (no gas for view calls)
- HTTP Client calls: **free** (no per-call CRE charges)
- AI analysis endpoint: **~$0.001-0.003/call** (Claude Haiku)
- DON deployment: requires CRE org access (org code in pending.md)
