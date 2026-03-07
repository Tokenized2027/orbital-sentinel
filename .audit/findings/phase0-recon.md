# Phase 0: Attacker Recon

## Q0.1: ATTACK GOALS -- What's the WORST an attacker can achieve?

The system has limited on-chain value exposure (Sepolia testnet only for writes). The critical assets are:

1. **Owner private key compromise** (`.env` PRIVATE_KEY) -- full control of SentinelRegistry: can write arbitrary records, transfer ownership, permanently lock the contract
2. **AI endpoint manipulation** -- poison risk assessments by compromising the Flask endpoint or injecting crafted data, causing false "ok" signals during actual critical conditions
3. **Snapshot data manipulation** -- tamper with intelligence/data JSON files on disk to cause incorrect on-chain proofs (garbage in, garbage out)
4. **API key theft** -- ANTHROPIC_API_KEY, OPENAI_API_KEY, CHAINLINK_CRE_API_KEY in .env enables unauthorized API usage and cost escalation
5. **Dashboard data poisoning** -- manipulate PostgreSQL sentinel_records to display false health status to users

**Worst case**: Attacker compromises the owner key and writes false "ok" proofs to the on-chain registry while real conditions are critical. Downstream consumers trust the on-chain proofs and fail to act on actual risk events.

## Q0.2: NOVEL CODE -- What's NOT a fork of battle-tested code?

Everything in this repo is custom/novel code:

- `SentinelRegistry.sol` -- Custom contract, NOT a fork of OpenZeppelin Ownable2Step (implements 2-step pattern manually)
- All 8 CRE workflow `main.ts` files -- Custom Chainlink CRE SDK integrations
- `cre_analyze_endpoint.py` -- Custom Flask AI proxy
- `record-all-snapshots.mjs` -- Custom on-chain proof bridge
- Dashboard API routes -- Custom Next.js route handlers

The contract is simple but the 2-step ownership is hand-rolled rather than inheriting from OZ.

## Q0.3: VALUE STORES -- Where does value actually sit?

| Store | Type | Value |
|-------|------|-------|
| SentinelRegistry on Sepolia | Smart contract | No ETH/tokens, but reputation/integrity value in the proof record |
| `.env` PRIVATE_KEY | Secret | Controls Sepolia deployer wallet (testnet ETH) |
| `.env` API keys | Secrets | ANTHROPIC_API_KEY, OPENAI_API_KEY -- real money if abused |
| `.env` CHAINLINK_CRE_API_KEY | Secret | CRE platform access |
| `.env` DATABASE_URL | Secret | PostgreSQL access to sdl_analytics DB |
| `.env` CRE_ANALYZE_SECRET | Secret | Auth token for AI endpoint |
| Intelligence snapshots | Data integrity | JSON files that drive on-chain proofs |

## Q0.4: COMPLEX PATHS -- What's the most complex interaction path?

The **composite intelligence path**:
1. 6 CRE workflows run independently, each reading mainnet contracts
2. Each writes a snapshot JSON to disk
3. `composite-laa-intelligence.mjs` reads all 6 snapshots
4. POSTs to AI endpoint (`/api/cre/analyze-composite`)
5. AI produces ecosystem-aware recommendation
6. Writes composite snapshot JSON
7. `record-all-snapshots.mjs` reads all 8 snapshots (7 workflows + composite)
8. Computes keccak256 hashes
9. Writes to SentinelRegistry on Sepolia via private key
10. Inserts record into PostgreSQL sentinel_records table
11. Dashboard reads from DB and on-chain

This path has 11 steps with multiple trust boundaries.

## Q0.5: COUPLED VALUE -- Which value stores have DEPENDENT accounting?

1. **Snapshot timestamp <-> on-chain proof hash**: The `generated_at_utc` timestamp is encoded into the keccak256 hash. If the timestamp is manipulated, the hash changes, bypassing the `AlreadyRecorded` duplicate check.
2. **Risk level in workflow <-> risk level on-chain**: The `extractRisk()` function in `record-all-snapshots.mjs` derives the risk string independently from the workflow's own risk assessment. These MUST be consistent or the on-chain record misrepresents the actual risk.
3. **Dashboard DB <-> on-chain state**: `sentinel_records` table mirrors on-chain data but uses `ON CONFLICT DO NOTHING` -- if the DB insert fails silently, the dashboard shows stale data while on-chain has newer records.
