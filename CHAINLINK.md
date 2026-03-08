# Chainlink Usage in Orbital Sentinel

This document maps every Chainlink touchpoint in the codebase, as required for hackathon submission.

See also: [CRE Ecosystem Reference](./docs/CRE-ECOSYSTEM-REFERENCE.md) for capabilities, SDK patterns, runtime requirements, and official template repos.

---

## 1. `@chainlink/cre-sdk` — Workflow Runtime

All 8 workflows import and use the CRE SDK as their execution runtime:

```typescript
import { cre, Runner, consensusIdenticalAggregation, getNetwork, encodeCallMsg } from '@chainlink/cre-sdk';
```

| File | SDK Usage |
|------|-----------|
| `workflows/treasury-risk/my-workflow/main.ts` | `Runner`, `cre.capabilities.EVMClient`, `cre.capabilities.HTTPClient`, `cre.capabilities.CronCapability`, `consensusIdenticalAggregation`, `getNetwork`, `encodeCallMsg` |
| `workflows/governance-monitor/my-workflow/main.ts` | `Runner`, `cre.capabilities.HTTPClient`, `cre.capabilities.EVMClient`, `cre.capabilities.CronCapability`, `consensusIdenticalAggregation`, `getNetwork`, `encodeCallMsg` |
| `workflows/price-feeds/my-workflow/main.ts` | `Runner`, `cre.capabilities.EVMClient`, `cre.capabilities.HTTPClient`, `cre.capabilities.CronCapability`, `consensusIdenticalAggregation`, `getNetwork` |
| `workflows/morpho-vault-health/my-workflow/main.ts` | `Runner`, `cre.capabilities.EVMClient`, `cre.capabilities.CronCapability`, `getNetwork`, `encodeCallMsg` |
| `workflows/token-flows/my-workflow/main.ts` | `Runner`, `cre.capabilities.EVMClient`, `cre.capabilities.CronCapability`, `getNetwork`, `encodeCallMsg` |
| `workflows/ccip-lane-health/my-workflow/main.ts` | `Runner`, `cre.capabilities.EVMClient`, `cre.capabilities.CronCapability`, `getNetwork`, `encodeCallMsg` |
| `workflows/curve-pool/my-workflow/main.ts` | `Runner`, `cre.capabilities.EVMClient`, `cre.capabilities.CronCapability`, `getNetwork`, `encodeCallMsg` |
| `workflows/link-ai-arbitrage/my-workflow/main.ts` | `Runner`, `cre.capabilities.EVMClient`, `cre.capabilities.HTTPClient`, `cre.capabilities.CronCapability`, `consensusIdenticalAggregation`, `getNetwork`, `encodeCallMsg` |

---

## 2. Chainlink EVM Client — On-Chain Reads (Ethereum Mainnet)

### `workflows/treasury-risk/my-workflow/main.ts`

Reads live data from 4 contracts on Ethereum mainnet:

```typescript
// Staking pool utilization
evmClient.callContract(runtime, { call: encodeCallMsg({ to: communityPool, data: getTotalPrincipal }) })
evmClient.callContract(runtime, { call: encodeCallMsg({ to: communityPool, data: getMaxPoolSize }) })

// Reward vault runway
evmClient.callContract(runtime, { call: encodeCallMsg({ to: rewardVault, data: getRewardBuckets }) })
evmClient.callContract(runtime, { call: encodeCallMsg({ to: linkToken, data: balanceOf(rewardVault) }) })
```

ABI files: `workflows/treasury-risk/contracts/abi/StakingPool.ts`, `RewardVault.ts`, `ERC20.ts`

### `workflows/price-feeds/my-workflow/main.ts`

Reads Chainlink Data Feed contracts directly:

```typescript
// latestAnswer() from AggregatorV3Interface
evmClient.callContract(runtime, { call: encodeCallMsg({ to: linkUsdFeed, data: latestAnswer }) })
evmClient.callContract(runtime, { call: encodeCallMsg({ to: ethUsdFeed, data: latestAnswer }) })
```

Feeds read (configurable via `config.feeds` array):
- LINK/USD: `0x2c1d072e956affc0d435cb7ac38ef18d24d9127c` (Ethereum mainnet)
- ETH/USD: `0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419` (Ethereum mainnet)
- POL/USD: optional, configured in staging settings

ABI file: `workflows/price-feeds/contracts/abi/PriceFeedAggregator.ts`

### `workflows/morpho-vault-health/my-workflow/main.ts`

Reads Morpho Blue market data:

```typescript
// Morpho Blue market utilization
evmClient.callContract(runtime, { call: encodeCallMsg({ to: morphoAddress, data: market(marketId) }) })
// ERC4626 vault TVL
evmClient.callContract(runtime, { call: encodeCallMsg({ to: vaultAddress, data: totalAssets }) })
```

### `workflows/token-flows/my-workflow/main.ts`

Reads ERC20 balances and vesting schedules across 50+ classified addresses:

```typescript
evmClient.callContract(runtime, { call: encodeCallMsg({ to: tokenAddress, data: balanceOf(address) }) })
```

### `workflows/ccip-lane-health/my-workflow/main.ts`

Reads CCIP infrastructure contracts on Ethereum mainnet:

```typescript
// CCIP Router — lane configuration check
evmClient.callContract(runtime, { call: encodeCallMsg({ to: routerAddress, data: getOnRamp(destChainSelector) }) })
// OnRamp — paused state
evmClient.callContract(runtime, { call: encodeCallMsg({ to: onRampAddress, data: paused() }) })
// LockReleaseTokenPool — rate limiter bucket state
evmClient.callContract(runtime, { call: encodeCallMsg({ to: poolAddress, data: getCurrentOutboundRateLimiterState(destChainSelector) }) })
```

ABI files: `workflows/ccip-lane-health/contracts/abi/CCIPRouter.ts`, `CCIPOnRamp.ts`, `LockReleaseTokenPool.ts`

---

## 3. Chainlink CRE HTTP Client — Deterministic Off-Chain Fetches

All HTTP calls in CRE workflows use `consensusIdenticalAggregation<T>()` to enforce that oracle nodes reach consensus on the response before accepting it:

```typescript
const result = http
  .sendRequest(runtime, fetchFunction, consensusIdenticalAggregation<ResultType>())
  ({ url, ...args })
  .result();
```

Used in:
- `treasury-risk/main.ts` — fetches from DeFi analytics API (`/api/defi`, `/api/onchain`)
- `treasury-risk/main.ts` — POSTs to AI analysis endpoint (`/api/cre/analyze`)
- `governance-monitor/main.ts` — fetches from Snapshot GraphQL + Discourse forum
- `price-feeds/main.ts` — fetches supplementary data from internal analytics

---

## 4. Chainlink CRE Cron Trigger — Autonomous Scheduling

All workflows use `CronCapability` for autonomous execution:

```typescript
const cron = new cre.capabilities.CronCapability();
return [cre.handler(cron.trigger({ schedule: config.schedule }), onCron)];
```

Schedules (per workflow config):
- `link-ai-arbitrage`: 7x/day (`0 0 0,3,7,10,14,17,21 * * *`) — **ACTIVE on CRE mainnet DON**
- `treasury-risk`: every 15 minutes (`0 */15 * * * *`) — local simulate
- `price-feeds`: every 15 minutes (`0 */15 * * * *`) — local simulate
- `morpho-vault-health`: every 15 minutes (`0 */15 * * * *`) — local simulate
- `curve-pool`: every 15 minutes (`0 */15 * * * *`) — local simulate
- `governance-monitor`: every 30 minutes (`0 */30 * * * *`) — local simulate
- `ccip-lane-health`: every 30 minutes (`0 */30 * * * *`) — local simulate
- `token-flows`: every 30 minutes (`0 */30 * * * *`) — local simulate

---

## 5. SentinelRegistry.sol — On-Chain Write (Sepolia)

**All 8 CRE workflows** write verifiable proof hashes to `OrbitalSentinelRegistry` on Sepolia after each run. A bridge script (`scripts/record-all-snapshots.mjs`) reads live CRE snapshots and writes proofs on-chain 7 times per day via the unified cycle.

**File:** `contracts/SentinelRegistry.sol` — [Security Audit](./AUDIT-REPORT.md) (4 findings fixed, 31 tests, 80k fuzz iterations)

```solidity
function recordHealth(bytes32 snapshotHash, string calldata riskLevel) external onlyOwner
function transferOwnership(address newOwner) external onlyOwner  // Ownable2Step: sets pendingOwner
function acceptOwnership() external  // only callable by pendingOwner
function recorded(bytes32) external view returns (bool)  // duplicate prevention
event HealthRecorded(bytes32 indexed snapshotHash, string riskLevel, uint256 ts)
event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner)
event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)
```

Risk levels use a prefixed format: `treasury:ok`, `feeds:warning`, `morpho:critical`, `governance:ok`, `flows:ok`, `ccip:ok`, `laa:ok`.

The hash is computed in TypeScript using `viem`'s `keccak256` + `encodeAbiParameters` — identical encoding to Solidity's `abi.encode()`:

```typescript
const snapshotHash = keccak256(
  encodeAbiParameters(
    parseAbiParameters('uint256 ts, string wf, string risk, uint256 m1, uint256 m2'),
    [timestampUnix, workflowType, risk, metric1, metric2],
  ),
);
```

Each workflow encodes domain-specific metrics:
- **treasury**: `communityFillPct`, `runwayDays`
- **feeds**: `stlinkLinkRatio × 1e6`, `depegBps × 100`
- **governance**: `activeProposals`, `urgentProposals`
- **morpho**: `utilization × 1e6`, `totalSupply`
- **flows**: `totalSdlTracked`, `addressCount`
- **ccip**: `okLanes`, `totalLanes`
- **laa**: `premiumBps`, `linkBalance`

This creates an immutable, verifiable audit trail: every CRE workflow run → one on-chain record per workflow type.

---

## 6. `getNetwork()` — Chain Selector Resolution

Used to resolve Chainlink chain selectors for both mainnet reads and Sepolia writes:

```typescript
const net = getNetwork({ chainFamily: 'evm', chainSelectorName: 'ethereum-mainnet', isTestnet: false });
const sepoliaNet = getNetwork({ chainFamily: 'evm', chainSelectorName: 'ethereum-testnet-sepolia', isTestnet: true });
```

---

## 7. Composite Intelligence Layer (Cross-Workflow)

After all 8 CRE workflows complete their individual runs in the unified cycle, a composite intelligence phase reads data from 5 workflows (price-feeds, treasury-risk, morpho-vault-health, ccip-lane-health, curve-pool) and feeds it alongside the LAA arb data to an AI analysis endpoint. This creates **cross-workflow intelligence**: the LAA arb decision is enriched with ecosystem-wide context that no single CRE workflow can see in isolation.

**Script:** `scripts/composite-laa-intelligence.mjs`
**AI Endpoint:** `platform/cre_analyze_endpoint.py` (`POST /api/cre/analyze-composite`)

The composite analysis produces a `composite:ok|warning|critical` risk level and writes a proof hash to SentinelRegistry that encodes metrics from all contributing workflows:

```typescript
encodeAbiParameters(
  'uint256 ts, string wf, string risk, uint256 premiumBps, uint256 linkUsd, uint256 communityFillPct, uint256 queueLink, uint256 morphoUtil, uint256 ccipOk, uint256 curveImbalance, uint256 confidence',
  [timestamp, 'composite', risk, ...metrics],
)
```

This means the on-chain proof for the composite workflow contains verifiable data from 6 different CRE data sources (LAA + 5 context workflows), creating a tamper-proof record of cross-workflow AI reasoning.

**Example:** The isolated LAA signal was `execute` (17 bps premium), but the composite analysis downgraded to `wait` because treasury data showed 365K LINK queued (slow capital recycling) and price feeds showed stLINK/LINK basis instability at 95 bps. This decision is provable on-chain.

---

## Summary

| Chainlink Component | Where Used |
|---------------------|-----------|
| `@chainlink/cre-sdk` Runner + handler | All 8 workflow `main.ts` files |
| `EVMClient.callContract()` | All 8 workflows (mainnet reads + Sepolia writes) |
| Chainlink Data Feeds (LINK/USD, ETH/USD, POL/USD) | `workflows/price-feeds/my-workflow/main.ts` |
| CCIP Router + OnRamp + TokenPool | `workflows/ccip-lane-health/my-workflow/main.ts` |
| `HTTPClient` + `consensusIdenticalAggregation` | treasury-risk, governance-monitor, price-feeds, link-ai-arbitrage |
| `CronCapability` | All 8 workflows |
| `getNetwork()` chain selector | All 8 workflows (mainnet + Sepolia) |
| `SentinelRegistry.sol` (on-chain write) | All 8 workflows + composite intelligence + `scripts/record-all-snapshots.mjs` |
| `encodeCallMsg` | All 8 workflows |
| Composite Intelligence (cross-workflow) | `scripts/composite-laa-intelligence.mjs` + `platform/cre_analyze_endpoint.py` |

> **Note:** The LINK AI Arbitrage (LAA) workflow was previously a cross-repo reference to the Orbital repo. It is now included directly in this repository at `workflows/link-ai-arbitrage/`.
