# Demo Video Script — Orbital Sentinel

**Target:** Under 5 minutes. Screen recording with voiceover.
**Tool:** OBS, Loom, or any screen recorder. Upload to YouTube (public or unlisted).

---

## Setup Before Recording

1. Open these tabs in browser:
   - SDL Analytics CRE Ops Console: `http://localhost:3014/ops/cre`
   - Sepolia Etherscan contract: `https://sepolia.etherscan.io/address/0xAFc081cde50fA2Da7408f4E811Ca9dE128f7B334`
   - GitHub repo: `https://github.com/Tokenized2027/orbital-sentinel`

2. Open terminal at: `cd ~/orbital-sentinel/scripts`

3. Open second terminal at: `cd ~/projects/orbital/clients/stake-link/sdl/orchestration/cre-poc/treasury-risk-ts`

---

## Scene 1 — What It Is (0:00 - 0:30)

**Show:** CRE Ops Console (`/ops/cre`)

**Say:** "This is Orbital Sentinel — an autonomous AI agent platform that monitors DeFi protocol health using Chainlink CRE workflows. What you're seeing is the operations console for stake.link, the largest Chainlink liquid staking protocol. It tracks depeg health, service dependencies, and on-chain sentinel records — all automated, no human in the loop."

**Action:** Scroll down to show the On-Chain Sentinel section with the stats and transaction list.

---

## Scene 2 — On-Chain Proof (0:30 - 1:30)

**Show:** Sepolia Etherscan contract page

**Say:** "Every monitoring run writes a verifiable proof to this SentinelRegistry contract on Sepolia. Each HealthRecorded event contains a keccak256 hash of the full risk snapshot — timestamp, risk level, and AI assessment. You can see [X] records here, fired autonomously 7 times a day."

**Action:** Click on one transaction, show the HealthRecorded event in the logs tab. Point out the snapshotHash and riskLevel fields.

---

## Scene 3 — Live Run (1:30 - 3:00)

**Show:** Terminal

**Say:** "Let me fire a live health record right now."

**Run:**
```bash
node record-health-cron.mjs
```

**Say:** (while it runs) "This calls recordHealth on the Sepolia registry with a keccak256 hash of today's risk assessment. The script rotates through 14 realistic scenarios — treasury health, governance status, whale activity, Morpho utilization."

**Action:** When it confirms, copy the TX hash. Switch to Etherscan. Show the new transaction appearing.

**Say:** "There it is — confirmed on-chain in about 12 seconds. Immutable audit trail."

---

## Scene 4 — The 5 Workflows (3:00 - 4:00)

**Show:** GitHub repo

**Say:** "Orbital Sentinel runs 5 CRE workflows, all using @chainlink/cre-sdk."

**Action:** Click through the workflows/ directory. For each, briefly show main.ts.

**Say:**
- "Treasury Risk reads staking pool contracts via EVMClient — pool capacity, reward runway, Morpho utilization."
- "Price Feeds reads Chainlink Data Feed contracts directly — LINK/USD, ETH/USD."
- "Governance Monitor polls Snapshot and Discourse via HTTPClient."
- "Morpho Vault Health reads Morpho Blue market structs."
- "Token Flows tracks 50 classified addresses for whale movements."

**Action:** Open CHAINLINK.md briefly. "Every Chainlink touchpoint is documented here."

---

## Scene 5 — Wrap (4:00 - 4:30)

**Show:** CRE Ops Console again

**Say:** "Orbital Sentinel is the intelligence backbone of our stake.link deployment. CRE orchestrates the data reads, AI analyzes the risk, and Sepolia stores the proof. Fully autonomous — running 24/7 with no human intervention. Built for the Chainlink Convergence Hackathon by Orbital."

---

## After Recording

1. Upload to YouTube (public or unlisted)
2. Copy the YouTube link
3. Paste into Airtable submission form + Moltbook post
</content>
</invoke>