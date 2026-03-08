# Phase 2: Feynman Interrogation (Pass 1)

## Contract: SentinelRegistry.sol

### constructor() [Line 43-46]
- **Cat 1 (Purpose)**: Sets deployer as owner, emits event. SOUND.
- **Cat 4 (Assumptions)**: Assumes msg.sender is a capable EOA. SOUND for Sepolia deployment.
- **Verdict**: SOUND

### transferOwnership(address newOwner) [Line 51-54]
- **Cat 1**: Sets pendingOwner for 2-step transfer. SOUND.
- **Cat 5 (Boundaries)**: Can transfer to address(0) -- but since address(0) cannot call acceptOwnership() in real EVM, this is a safe no-op. SOUND.
- **Cat 3 (Consistency)**: No event emitted if newOwner == current pendingOwner (re-setting same value). Minor inconsistency but not exploitable. SOUND.
- **Cat 5**: Can transfer to self (owner). Self-transfer + acceptOwnership is valid but wasteful. SOUND.
- **Verdict**: SOUND

### acceptOwnership() [Line 57-62]
- **Cat 2 (Ordering)**: Line 59 emits event BEFORE state change (line 60-61). This is fine -- no reentrancy risk in a view/state-change-only function with no external calls. SOUND.
- **Cat 1**: Clears pendingOwner after setting owner. SOUND.
- **Cat 5**: If pendingOwner is address(0) (from transferOwnership(address(0))), msg.sender must be address(0) which is impossible in real EVM. SOUND.
- **Verdict**: SOUND

### recordHealth(bytes32, string calldata) [Line 67-80]
- **Cat 1**: Owner-gated append-only health record storage. SOUND.
- **Cat 4 (Assumptions)**: Trusts the owner to provide valid snapshotHash and riskLevel. No verification that snapshotHash actually matches keccak256 of the risk data. **SUSPECT** -- the hash is unverified, meaning the owner can write arbitrary hashes that don't correspond to real data.
- **Cat 5 (Boundaries)**: riskLevel max 256 bytes. This is generous -- typical values are "treasury:ok" (~12 bytes). 256 bytes of string storage = ~8 storage slots. Gas cost tested in DeepAudit.t.sol. SOUND.
- **Cat 6 (Return/Error)**: Reverts on duplicate hash, empty riskLevel, >256 bytes. No return value. SOUND.
- **Cat 7 (External calls)**: No external calls. No reentrancy risk. SOUND.
- **Verdict**: SOUND (with note on unverified hash integrity -- by design for this use case)

### count() [Line 83-85]
- **Verdict**: SOUND -- trivial view function.

### latest() [Line 88-91]
- **Cat 6**: Uses `require` instead of custom error for empty records check. Inconsistent with the rest of the contract which uses custom errors. **SUSPECT** -- minor gas inefficiency and style inconsistency.
- **Cat 5**: Returns `records[records.length - 1]` -- safe because the require check ensures length > 0. SOUND.
- **Verdict**: SOUND (minor style inconsistency)

---

## Python: cre_analyze_endpoint.py

### _check_auth() [Line 42-47]
- **Cat 1**: Timing-safe auth via hmac.compare_digest. SOUND.
- **Cat 4 (Assumptions)**: If _CRE_SECRET is empty, returns False (fail-closed). SOUND.
- **Verdict**: SOUND

### _bridge_check_auth() [Line 650-656]
- **Cat 3 (Consistency)**: Uses CRE_SECRET env var (not CRE_ANALYZE_SECRET). If CRE_SECRET is not set, returns True (fail-OPEN). **VULNERABLE** -- inconsistent with _check_auth() which is fail-closed. Any unauthenticated request can hit /api/cre/analyze-bridge.
- **Cat 1**: Different env var name from main auth. Confusing and error-prone.
- **Verdict**: VULNERABLE (V-PY-01: Bridge endpoint fail-open auth)

### _sanitize_str() [Line 50-56]
- **Cat 1**: Strips control characters. SOUND for basic sanitization.
- **Cat 4**: Only used in `_format_prompt()` for alerts. Not used in arb/composite prompts. **SUSPECT** -- partial coverage.
- **Verdict**: SUSPECT (S-PY-01: Sanitization not applied uniformly)

### analyze() [Line 173-206]
- **Cat 6 (Error paths)**: On JSONDecodeError from AI, returns 500. On any other exception, returns 500 with logging. SOUND.
- **Cat 4**: Trusts AI response structure implicitly -- parses JSON from LLM output and returns directly to caller. The CALLER (CRE workflow) validates the response schema. SOUND by defense-in-depth.
- **Cat 7**: Uses anthropic library for API call. No multi-tx state concerns. SOUND.
- **Verdict**: SOUND

### analyze_arb() [Line 310-341]
- **Cat 3 (Consistency)**: Same pattern as analyze() but uses OpenAI. SOUND.
- **Cat 4**: _format_arb_prompt() does NOT use _sanitize_str() on input data. Data comes from CRE workflow JSON. **SUSPECT** -- if an attacker controls the workflow output (e.g., by manipulating Curve pool state return values), they could inject content into the prompt.
- **Verdict**: SUSPECT (S-PY-02: No sanitization on arb prompt inputs)

### analyze_bridge() [Line 695-762]
- **Cat 3**: Uses `_bridge_check_auth()` (fail-open). VULNERABLE per V-PY-01.
- **Cat 4**: Formats vault state directly into prompt string using f-strings. No sanitization. **SUSPECT** -- prompt injection possible if attacker controls vault state values.
- **Cat 6**: Falls back to `_bridge_heuristic()` on any exception. SOUND fallback pattern.
- **Verdict**: VULNERABLE (inherits V-PY-01) + SUSPECT (S-PY-03: No input sanitization on bridge prompt)

### _format_composite_prompt() [Line 409-594]
- **Cat 4**: Directly interpolates data from 6 workflow snapshots into prompt. Zero sanitization. **SUSPECT** -- if any workflow snapshot is tampered, the composite prompt carries the tampered data to the AI.
- **Verdict**: SUSPECT (S-PY-04: No input validation on composite prompt data)

---

## Script: record-all-snapshots.mjs

### PRIVATE_KEY handling [Line 34-38]
- **Cat 4**: Reads PRIVATE_KEY from .env. If not set, exits with code 1. SOUND.
- **Cat 4**: Key is passed directly to `privateKeyToAccount()`. No validation of key format. SOUND (viem validates internally).
- **Verdict**: SOUND

### readSnapshot(file) [Line 313-317]
- **Cat 4**: Reads file from SNAPSHOT_DIR with zero integrity checks. **SUSPECT** -- no validation that the file hasn't been tampered with. Path is hardcoded, so no path traversal risk.
- **Verdict**: SUSPECT (S-BR-01: No snapshot integrity validation)

### writeOnChain(hash, riskLevel) [Line 319-343]
- **Cat 6 (Error paths)**: Tries multiple RPC URLs. If all fail, throws. SOUND resilience pattern.
- **Cat 4**: Uses `waitForTransactionReceipt()` -- blocks until confirmed. SOUND.
- **Verdict**: SOUND

### main() hash computation [Line 396-398]
- **Cat 1**: Computes keccak256 of ABI-encoded workflow data. SOUND.
- **Cat 3 (Consistency)**: Uses `generated_at_utc` as timestamp source. Workflows use `Date.now()`. These produce DIFFERENT hashes for the same data. **SUSPECT** -- dual hash generation means duplicate records are possible if both paths are active.
- **Verdict**: SUSPECT (S-BR-02: Dual hash computation paths)

### AlreadyRecorded handling [Line 426-428]
- **Cat 6**: Catches "AlreadyRecorded" in error message and treats as skip. SOUND.
- **Cat 4**: Uses string matching (`msg.includes('AlreadyRecorded')`) -- fragile if viem changes error format. **SUSPECT** but low risk.
- **Verdict**: SOUND (minor fragility)

### insertRecord() [Line 356-365]
- **Cat 4**: Uses parameterized query ($1, $2...) -- safe against SQL injection. SOUND.
- **Cat 6**: ON CONFLICT DO NOTHING -- silent on duplicates. SOUND for idempotency.
- **Verdict**: SOUND

---

## CRE Workflows: Common Patterns

### fetchAIAnalysis() (treasury-risk, link-ai-arbitrage)
- **Cat 4 (Assumptions)**: Validates AI response against allowlists (VALID_RISK_LABELS, VALID_RECS). Truncates strings. Sets defaults for invalid values. SOUND -- this is the F-W2 audit fix.
- **Verdict**: SOUND

### computeSignal() in link-ai-arbitrage [Line 255-280]
- **Cat 5 (Boundaries)**: MAX_REASONABLE_PREMIUM_BPS = 500. Premium > 500 bps returns 'wait'. This is the F-W3 flash loan sanity cap. SOUND.
- **Cat 4**: Uses `premiumQuotes[0]` (smallest amount) for signal -- conservative. SOUND.
- **Verdict**: SOUND

### readRewardMetrics() in treasury-risk [Line 232-315]
- **Cat 5**: Zero emission rate handled specially -- sets runway to 9999 days and risk to 'ok'. This is the F-W10 audit fix. SOUND.
- **Cat 4**: `totalEmissionPerDay = totalEmissionPerSec * 86400n` -- assumes 86400 seconds per day. No leap second handling, but irrelevant for this precision. SOUND.
- **Verdict**: SOUND

### Price staleness check in price-feeds [Line 239-247]
- **Cat 1**: Checks if price feed is older than 3600 seconds. Logs warning but STILL USES the value. **SUSPECT** -- stale prices propagate to risk assessments. The staleness is logged but not reflected in the risk level.
- **Cat 3**: Curve-pool workflow has same staleness check pattern. Consistent. But both have same issue.
- **Verdict**: SUSPECT (S-WF-01: Stale prices used without risk level adjustment)

### token-flows risk level [Line 303]
- **Cat 3 (Consistency)**: Always writes `flows:ok` regardless of data. All other workflows compute risk dynamically. **SUSPECT** -- anomalous. If a whale moves 50% of tracked SDL, the on-chain record still says "ok".
- **Verdict**: SUSPECT (S-WF-02: Token flows always reports ok)

### Registry write from zeroAddress [e.g., treasury-risk line 606-612]
- **Cat 4**: All workflow registry writes use `from: zeroAddress`. This is a CRE SDK simulation pattern -- the CRE DON signs the actual transaction. In simulation mode, this is a dry-run. **IMPORTANT**: The on-chain write in simulation mode does NOT actually execute -- it's a simulated call. Only the bridge script (`record-all-snapshots.mjs`) actually writes on-chain using the real private key.
- **Verdict**: SOUND (by design -- workflows simulate, bridge script executes)

---

## Dashboard

### cre-signals/route.ts
- **Cat 4**: Reads JSON files directly from filesystem (DEFAULT_DATA_DIR). No authentication on the GET endpoint. **SUSPECT** -- any client can query CRE signal data.
- **Cat 5**: Staleness threshold is 45 minutes. If a workflow fails silently, data goes stale after 45 min. SOUND threshold.
- **Cat 4**: Returns full snapshot data to the client including internal metrics. No data filtering. **SUSPECT** but acceptable for a monitoring dashboard.
- **Verdict**: SOUND (public monitoring data is appropriate for this use case)

### sentinel/route.ts
- **Cat 4**: Queries PostgreSQL via Drizzle ORM. No authentication. SOUND for a public monitoring dashboard.
- **Cat 6**: Returns 503 if DATABASE_URL not configured. SOUND.
- **Verdict**: SOUND

## Summary Table

| ID | Location | Category | Verdict | Severity |
|----|----------|----------|---------|----------|
| V-PY-01 | cre_analyze_endpoint.py:650-656 | Auth | VULNERABLE | HIGH |
| S-PY-01 | cre_analyze_endpoint.py:50-56 | Sanitization | SUSPECT | LOW |
| S-PY-02 | cre_analyze_endpoint.py:310 | Sanitization | SUSPECT | LOW |
| S-PY-03 | cre_analyze_endpoint.py:695-762 | Sanitization | SUSPECT | MEDIUM |
| S-PY-04 | cre_analyze_endpoint.py:409-594 | Sanitization | SUSPECT | LOW |
| S-BR-01 | record-all-snapshots.mjs:313-317 | Integrity | SUSPECT | MEDIUM |
| S-BR-02 | record-all-snapshots.mjs:396 | Consistency | SUSPECT | LOW |
| S-WF-01 | price-feeds/main.ts:239-247, curve-pool/main.ts:268-274 | Data quality | SUSPECT | MEDIUM |
| S-WF-02 | token-flows/main.ts:303 | Risk classification | SUSPECT | LOW |
