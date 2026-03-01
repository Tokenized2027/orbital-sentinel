# Demo Video Script — Orbital Sentinel

**Target:** Under 5 minutes. Screen recording with voiceover.
**Tool:** OBS, Loom, or any screen recorder. Upload to YouTube (public or unlisted).

---

## Setup Before Recording

1. Open these tabs in browser:
   - Sentinel Dashboard: (Cloudflare tunnel URL or `http://localhost:3016`)
   - Sepolia Etherscan contract: `https://sepolia.etherscan.io/address/0xE5B1b708b237F9F0F138DE7B03EEc1Eb1a871d40`
   - GitHub repo: `https://github.com/Tokenized2027/orbital-sentinel`

2. Open terminal at: `cd ~/orbital-sentinel/scripts`

---

## Scene 1 — What It Is (0:00 - 0:30)

**Show:** Sentinel Dashboard

**Say:** "This is Orbital Sentinel — an autonomous AI agent platform that monitors DeFi protocol health using Chainlink CRE workflows. What you're seeing is the dashboard for stake.link, the largest Chainlink liquid staking protocol. It shows 7 workflow cards with CRE capability tags, live risk status, and on-chain sentinel records — all automated, no human in the loop."

**Action:** Scroll down to show the On-Chain Sentinel section with per-workflow stats and transaction list.

---

## Scene 2 — On-Chain Proof (0:30 - 1:30)

**Show:** Sepolia Etherscan contract page

**Say:** "Every monitoring run writes a verifiable proof to this SentinelRegistry contract on Sepolia. Each HealthRecorded event contains a keccak256 hash of workflow-specific metrics — with prefixed risk levels like 'treasury:ok' or 'feeds:warning' so you can see which workflow produced each proof."

**Action:** Click on one transaction, show the HealthRecorded event in the logs tab. Point out the snapshotHash and prefixed riskLevel fields.

---

## Scene 3 — Live Run (1:30 - 3:00)

**Show:** Terminal

**Say:** "Let me fire live health records right now — one for each workflow with fresh data."

**Run:**
```bash
node record-all-snapshots.mjs
```

**Say:** (while it runs) "This reads real CRE snapshot data for all 7 workflows — treasury risk, price feeds, governance, Morpho vault, CCIP lanes, Curve pool, and the cross-repo arb monitor. For each fresh snapshot, it computes a keccak256 hash of key metrics and writes it to the Sepolia registry with a prefixed risk level."

**Action:** When it confirms, copy a TX hash. Switch to Etherscan. Show the new transaction(s) appearing.

**Say:** "There they are — real data, real proofs, confirmed on-chain. No fake scenarios, no hardcoded data."

---

## Scene 4 — The 7 Workflows (3:00 - 4:00)

**Show:** GitHub repo

**Say:** "Orbital Sentinel runs 7 CRE workflows, all using @chainlink/cre-sdk."

**Action:** Click through the workflows/ directory. For each, briefly show main.ts.

**Say:**
- "Treasury Risk reads staking pool contracts via EVMClient — pool capacity, reward runway, Morpho utilization."
- "Price Feeds reads Chainlink Data Feed contracts directly — LINK/USD, ETH/USD."
- "Governance Monitor polls Snapshot and Discourse via HTTPClient."
- "Morpho Vault Health reads Morpho Blue market structs."
- "Token Flows tracks 50 classified addresses for whale movements."
- "CCIP Lane Health monitors Chainlink CCIP Router, OnRamp paused state, and rate limiter buckets."
- "Curve Pool reads the stLINK/LINK StableSwap pool balances and computes imbalance using the LINK/USD Chainlink feed."

**Action:** Open CHAINLINK.md briefly. "Every Chainlink touchpoint is documented here."

---

## Scene 5 — Wrap (4:00 - 4:30)

**Show:** Sentinel Dashboard again

**Say:** "Orbital Sentinel is the intelligence backbone of our stake.link deployment. CRE orchestrates the data reads, AI analyzes the risk, and Sepolia stores the proof — for all 7 workflows. Fully autonomous — running 24/7 with no human intervention. Built for the Chainlink Convergence Hackathon by Orbital."

---

## After Recording

1. Upload to YouTube (public or unlisted)
2. Copy the YouTube link
3. Paste into Airtable submission form + Moltbook post
</content>
</invoke>