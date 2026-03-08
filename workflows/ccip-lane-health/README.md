# CCIP Lane Health Workflow

Monitors Chainlink CCIP lane availability and rate limiter state for configured destination chains.

## What It Does

- Reads `getOnRamp(destChainSelector)` from the CCIP Router to verify lane configuration
- Checks `paused()` on each OnRamp contract
- Reads `getCurrentOutboundRateLimiterState()` from the LINK token pool per lane
- Computes per-lane and overall risk levels based on configurable thresholds

## Chainlink Usage

| Capability | Usage |
|-----------|-------|
| `EVMClient.callContract()` | Reads CCIP Router, OnRamp, and LockReleaseTokenPool on Ethereum mainnet |
| `CronCapability` | Scheduled execution (default: every 30 minutes) |
| `getNetwork()` | Chain selector resolution for ethereum-mainnet |

## Config

Copy `config.example.json` to `config.staging.json` and fill in:

- `routerAddress` — CCIP Router contract on source chain
- `linkTokenPoolAddress` — LockReleaseTokenPool for LINK
- `lanes[]` — destination chains with their chain selectors
- `thresholds` — warning/critical thresholds for rate limiter capacity

## Run

```bash
bun install
./run_snapshot.sh staging-settings
```
