# Demo Video Script: Sentinel by Orbital

**Format:** Screen recording with voiceover, 2-3 minutes.
**Tone:** Conversational, authoritative, no jargon without explanation. Short sentences. One idea per line.
**Visuals:** [SHOW] tags indicate what's on screen. Voiceover text is everything else.

---

## Scene 1: The Problem (0:00 - 0:30)

[SHOW: Sentinel Dashboard, zoomed out, all 8 workflow cards visible]

DeFi protocols manage hundreds of millions in value.
But most of them are flying blind.

A staking pool fills up. Reward vaults run dry. A token depegs.
Bridge lanes freeze. Liquidity crunches hit without warning.
By the time anyone notices, it's already too late.

The problem isn't data. Ethereum is an open book.
The problem is that nobody's watching. Not continuously. Not autonomously.

That's what Sentinel does.

---

## Scene 2: What It Does (0:30 - 1:20)

[SHOW: Scroll down to reveal on-chain proof list, then back up to workflow cards]

Sentinel is an autonomous AI agent platform
that monitors DeFi protocol health using Chainlink CRE workflows.

CRE is Chainlink's Runtime Environment.
Think of it like a decentralized server
that runs your code across Chainlink's oracle network,
not on a single machine you control.

We built 8 monitoring workflows for stake.link,
the largest Chainlink liquid staking protocol.

[SHOW: Click through workflow cards on dashboard]

Treasury health. Price feed tracking. Governance alerts.
Morpho vault utilization. Whale token flows. CCIP bridge status.
Curve pool balance. And the flagship: LINK AI Arbitrage,
which monitors stLINK/LINK arb opportunities with GPT analysis.

Every workflow reads live contract data from Ethereum mainnet,
feeds it to an AI model for risk assessment,
and writes a verifiable proof hash on-chain.

That's the key part.
Every single assessment gets a cryptographic proof,
written to a smart contract on Sepolia.
Permanent. Immutable. Auditable.

---

## Scene 3: How It All Connects (1:20 - 2:10)

[SHOW: Etherscan contract page, scroll through HealthRecorded events]

Each on-chain proof is a HealthRecorded event.
It contains the keccak256 hash of the actual metrics
and a prefixed risk level: "treasury:ok", "feeds:warning", "laa:ok".
So every proof is tagged with its source workflow.

[SHOW: Dashboard, on-chain sentinel section with per-workflow stats]

New proofs every cycle, deduplicated on-chain. All automated.

Here's the clever part.
After all 8 workflows complete,
a composite intelligence layer reads data from across them,
combines it with the arb signal,
and feeds everything to the AI as cross-workflow context.

So the AI doesn't just see one workflow's data.
It sees the whole ecosystem at once.
And that composite assessment also gets its own on-chain proof.

[SHOW: Dashboard composite record or Etherscan composite TX]

The LINK AI Arbitrage workflow is live on the CRE mainnet DON right now.
That means Chainlink's oracle nodes run it autonomously, 7 times a day.
No server on my end. No cron job. It just runs.

---

## Scene 4: Wrap (2:10 - 2:40)

[SHOW: Dashboard, full view]

Sentinel uses six Chainlink products:
CRE SDK, EVMClient, HTTPClient, CronCapability, Data Feeds, and getNetwork.
All coordinated through one SentinelRegistry contract.

Built with TypeScript, Solidity, Next.js, Python, and viem.
AI powered by Claude and GPT.
Audited: 31 tests, 80,000 fuzz iterations.

This isn't a prototype.
It's live on the CRE mainnet DON right now,
writing real proofs from real Ethereum data.

DeFi protocols shouldn't fly blind.
Sentinel gives them eyes.

---

## Recording Notes

**Tabs to have open before recording:**
1. Sentinel Dashboard (Cloudflare tunnel or localhost:3016)
2. Sepolia Etherscan: `https://sepolia.etherscan.io/address/0x5D15952f672fCAaf2492591668A869E26B815aE3`

**Pre-run checklist:**
- Dashboard running (PM2 or `npm run dev` in dashboard/)
- Recent on-chain proofs visible on Etherscan (run `record-all-snapshots.mjs` beforehand if needed)

**Timing guide:**
- Scene 1 (Problem): ~30 seconds
- Scene 2 (What it does): ~50 seconds
- Scene 3 (How it connects): ~50 seconds
- Scene 4 (Wrap): ~30 seconds
- Total: ~2 min 40 sec
