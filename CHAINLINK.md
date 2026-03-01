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

Feeds read:
- LINK/USD: `0x2c1d072e956affc0d435cb7ac38ef18d24d9127c` (Ethereum mainnet)
- ETH/USD: `0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419` (Ethereum mainnet)

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

Schedules:
- `treasury-risk`: every 15 minutes (`0 */15 * * * *`)
- `governance-monitor`: every 30 minutes (`0 */30 * * * *`)
- `price-feeds`: every 15 minutes
- `morpho-vault-health`: every 15 minutes
- `token-flows`: every 30 minutes
- `ccip-lane-health`: every 30 minutes
- `curve-pool`: every 15 minutes

---

## 5. SentinelRegistry.sol — On-Chain Write (Sepolia)

**All 7 CRE workflows** write verifiable proof hashes to `OrbitalSentinelRegistry` on Sepolia after each run. A bridge script (`scripts/record-all-snapshots.mjs`) reads live CRE snapshots and writes proofs on-chain every 15 minutes via cron.

**File:** `contracts/SentinelRegistry.sol`

```solidity
function recordHealth(bytes32 snapshotHash, string calldata riskLevel) external
event HealthRecorded(bytes32 indexed snapshotHash, string riskLevel, uint256 ts)
```

Risk levels use a prefixed format: `treasury:ok`, `feeds:warning`, `morpho:critical`, `governance:ok`, `flows:ok`, `ccip:ok`.

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

This creates an immutable, verifiable audit trail: every CRE workflow run → one on-chain record per workflow type.

---

## 6. `getNetwork()` — Chain Selector Resolution

Used to resolve Chainlink chain selectors for both mainnet reads and Sepolia writes:

```typescript
const net = getNetwork({ chainFamily: 'evm', chainSelectorName: 'ethereum-mainnet', isTestnet: false });
const sepoliaNet = getNetwork({ chainFamily: 'evm', chainSelectorName: 'ethereum-sepolia', isTestnet: true });
```

---

## Summary

| Chainlink Component | Where Used |
|---------------------|-----------|
| `@chainlink/cre-sdk` Runner + handler | All 8 workflow `main.ts` files |
| `EVMClient.callContract()` | All 8 workflows (mainnet reads + Sepolia writes) |
| Chainlink Data Feeds (LINK/USD, ETH/USD) | `workflows/price-feeds/my-workflow/main.ts` |
| CCIP Router + OnRamp + TokenPool | `workflows/ccip-lane-health/my-workflow/main.ts` |
| `HTTPClient` + `consensusIdenticalAggregation` | treasury-risk, governance-monitor, price-feeds |
| `CronCapability` | All 8 workflows |
| `getNetwork()` chain selector | All 8 workflows (mainnet + Sepolia) |
| `SentinelRegistry.sol` (on-chain write) | All 8 workflow `main.ts` files + `scripts/record-all-snapshots.mjs` |
| `encodeCallMsg` | All 8 workflows |
