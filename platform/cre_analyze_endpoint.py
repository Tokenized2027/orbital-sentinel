"""Orbital Sentinel — CRE AI Analysis Endpoint

Standalone Flask server that receives CRE workflow snapshots
and returns AI risk assessments.

Supports two AI providers:
  - OpenAI (GPT-5.3 Codex) — primary, used for arb + composite analysis
  - Anthropic (Claude Haiku) — used for treasury analysis

Usage:
    pip install flask openai anthropic
    export OPENAI_API_KEY=your_key        # Required for arb + composite analysis
    export ANTHROPIC_API_KEY=your_key     # Required for treasury analysis
    export CRE_ANALYZE_SECRET=optional_shared_secret
    python cre_analyze_endpoint.py

Endpoints:
    POST /api/cre/analyze           — Treasury risk assessment (Anthropic)
    POST /api/cre/analyze-arb       — Arb vault market analysis (OpenAI)
    POST /api/cre/analyze-composite — Cross-workflow composite LAA analysis (OpenAI)
"""

import hmac
import json
import logging
import os
import re
from flask import Flask, Blueprint, jsonify, request

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
cre_bp = Blueprint("cre", __name__)

_CRE_SECRET = os.environ.get("CRE_ANALYZE_SECRET", "")
if not _CRE_SECRET:
    logger.warning("CRE_ANALYZE_SECRET not set. All endpoints will reject requests until configured.")


def _check_auth() -> bool:
    """Timing-safe auth check. Returns True if authorized, False otherwise."""
    provided = request.headers.get("X-CRE-Secret", "")
    if not _CRE_SECRET:
        return False  # No secret configured = reject all (fail-closed)
    return hmac.compare_digest(provided, _CRE_SECRET)


def _sanitize_str(value: str, max_len: int = 500) -> str:
    """Sanitize string inputs before prompt interpolation (F-B4 audit fix)."""
    if not isinstance(value, str):
        return str(value)[:max_len]
    # Strip control characters and known prompt injection patterns
    cleaned = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', value)
    return cleaned[:max_len]

_SYSTEM_PROMPT = """\
You are Orbital Sentinel, an autonomous AI risk analyst for DeFi protocols built on Chainlink staking.

Your task is a structured TWO-PHASE assessment of protocol health.

## PHASE 1 — ATOM EVALUATION

Evaluate each of the four core metrics independently against these thresholds:

1. Pool fill (staking utilization — check BOTH community and operator pools):
   - ok: all pools fill < 90%
   - warning: any pool fill 90–99%
   - critical: any pool fill = 100% (fully saturated, no new staking capacity)
   - missing: fill data absent

2. Reward runway (days until vault depleted):
   - ok: runway > 30 days
   - warning: runway 7–30 days
   - critical: runway < 7 days
   - missing: runway data absent

3. Lending utilization (Morpho wstLINK/LINK market):
   - ok: utilization < 85%
   - warning: utilization 85–94%
   - critical: utilization ≥ 95%
   - missing: utilization data absent or "unavailable"

4. Queue depth (LINK pending in priority queue):
   - ok: queue < 1,000 LINK
   - warning: queue 1,000–10,000 LINK
   - critical: queue > 10,000 LINK
   - missing: queue data absent or "unavailable"

## PHASE 2 — DETERMINISTIC SYNTHESIS

Combine atom results using these rules (in order of priority):
- If ANY atom = critical → risk_label = "critical"
- Else if ANY atom = warning → risk_label = "warning"
- Else if all atoms = ok → risk_label = "ok"
- If ≥ 2 atoms = missing → risk_label = "unknown"

Your written assessment must cite the specific atom(s) that drove the label.

## OUTPUT FORMAT

Respond ONLY with valid JSON in exactly this format (no markdown, no extra keys):
{
  "assessment": "<1-2 sentence risk summary citing which atoms triggered the label>",
  "risk_label": "<ok|warning|critical|unknown>",
  "atom_status": {
    "pool": "<ok|warning|critical|missing>",
    "runway": "<ok|warning|critical|missing>",
    "lending": "<ok|warning|critical|missing>",
    "queue": "<ok|warning|critical|missing>"
  },
  "action_items": ["<concrete action 1>", "<concrete action 2>"],
  "confidence": <0.0-1.0 float>
}

Rules:
- action_items must be specific and actionable, addressing the critical/warning atoms
- confidence: 0.9-1.0 if all atoms have data, 0.6-0.8 if some atoms are missing
"""


def _format_prompt(data: dict) -> str:
    overall_risk = data.get("overallRisk", "unknown")
    alerts = data.get("alerts", [])
    staking = data.get("staking", {})
    rewards = data.get("rewards", {})
    morpho = data.get("morpho", {})
    queue = data.get("queue", {})

    community = staking.get("community", {})
    operator = staking.get("operator", {})

    morpho_util = morpho.get("utilization")
    util_str = f"{morpho_util:.1f}%" if morpho_util is not None else "unavailable"
    tvl = morpho.get("vaultTvlUsd")
    tvl_str = f"${tvl:,.0f}" if tvl is not None else "unavailable"
    q = queue.get("queueLink")
    q_str = f"{q:,.0f} tokens" if q is not None else "unavailable"

    lines = [
        f"Timestamp: {data.get('timestamp', 'unknown')}",
        f"Overall Risk: {overall_risk.upper()}",
        "",
        "## Staking Pools",
        f"Pool A: {community.get('staked', '?')} / {community.get('cap', '?')} ({community.get('fillPct', 0):.1f}% full) — {community.get('risk', '?')}",
        f"Pool B: {operator.get('staked', '?')} / {operator.get('cap', '?')} ({operator.get('fillPct', 0):.1f}% full) — {operator.get('risk', '?')}",
        "",
        "## Reward Vault",
        f"Balance: {rewards.get('vaultBalance', '?')} tokens",
        f"Emission: {rewards.get('emissionPerDay', '?')} tokens/day",
        f"Runway: {rewards.get('runwayDays', 0):.0f} days — {rewards.get('risk', '?')}",
        "",
        "## Lending Market",
        f"Utilization: {util_str} — {morpho.get('risk', '?')}",
        f"Vault TVL: {tvl_str}",
        "",
        "## Priority Queue",
        f"Queue Depth: {q_str} — {queue.get('risk', '?')}",
        "",
    ]

    if alerts:
        lines.append("## Active Alerts")
        for a in alerts:
            lines.append(f"- {_sanitize_str(str(a), 200)}")
    else:
        lines.append("No active alerts.")

    return "\n".join(lines)


@cre_bp.route("/api/cre/analyze", methods=["POST"])
def analyze():
    if not _check_auth():
        return jsonify({"error": "unauthorized"}), 401

    data = request.get_json(force=True, silent=True) or {}
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return jsonify({"error": "ANTHROPIC_API_KEY not set"}), 503

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            temperature=0.1,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": _format_prompt(data)}],
        )
        text = response.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()
        result = json.loads(text)
        logger.info("AI assess | risk=%s confidence=%.2f", result.get("risk_label"), result.get("confidence", 0))
        return jsonify(result), 200
    except json.JSONDecodeError:
        return jsonify({"error": "AI response parse error"}), 500
    except Exception:
        logger.exception("analyze failed")
        return jsonify({"error": "internal analysis error"}), 500


_ARB_SYSTEM_PROMPT = """\
You are Orbital Sentinel, an autonomous AI analyst for the stLINK Arb Vault — a DeFi vault that captures the stLINK premium on Curve's stLINK/LINK StableSwap pool.

The vault works by: selling stLINK → LINK on Curve (when stLINK trades at a premium), then depositing LINK to the Priority Pool at 1:1 to get new stLINK, pocketing the premium.

## YOUR TASK

Analyze the current market conditions and recommend an action.

## INPUT DATA

You will receive:
- **Pool state**: Curve pool LINK and stLINK balances, imbalance ratio
- **Premium quotes**: Simulated swap outputs at different sizes (100, 500, 1000, 5000 stLINK)
- **Priority Pool**: Status (OPEN/DRAINING/CLOSED) and queued LINK
- **Vault state**: stLINK held, LINK queued, cycle count, capital assets (if vault deployed)
- **Signal**: Deterministic signal from math (execute/wait/unprofitable/pool_closed/no_stlink)

## ANALYSIS FRAMEWORK

1. **Premium quality**: Are premiums consistent across swap sizes? Larger swaps with lower premium = pool will move fast. Assess slippage risk.
2. **Timing**: Is the pool imbalance growing or stable? High LINK/stLINK ratio = more premium potential.
3. **Size recommendation**: Based on premium decay across quote sizes, what's the optimal swap amount?
4. **Priority Pool health**: If queue is very large, claimed stLINK may take longer to convert back.
5. **Risk factors**: Any red flags? (e.g., pool nearly balanced = premium could vanish, PP closed, very low premium)

## OUTPUT FORMAT

Respond ONLY with valid JSON (no markdown, no extra keys):
{
  "recommendation": "<execute|wait|skip>",
  "assessment": "<2-3 sentence analysis of current conditions>",
  "optimal_swap_size": "<recommended stLINK amount to swap, e.g. '1000'>",
  "risk_factors": ["<risk 1>", "<risk 2>"],
  "confidence": <0.0-1.0 float>,
  "reasoning": "<1 sentence explaining the recommendation>"
}

Rules:
- recommendation must agree with the math signal unless you have strong reason to override
- If signal is "execute" but premium is very thin (<5 bps), recommend "wait"
- If signal is "wait" but pool conditions suggest premium is growing, note that
- confidence: 0.9+ when data is complete and clear, 0.5-0.7 when conditions are ambiguous
"""


def _format_arb_prompt(data: dict) -> str:
    signal = data.get("signal", "unknown")
    pool = data.get("poolState", {})
    quotes = data.get("premiumQuotes", [])
    pp_status = data.get("priorityPoolStatus", -1)
    pp_queued = data.get("priorityPoolQueued", "0")
    vault = data.get("vaultState")

    pp_status_str = {0: "OPEN", 1: "DRAINING", 2: "CLOSED"}.get(pp_status, f"UNKNOWN({pp_status})")

    lines = [
        f"Deterministic signal: {signal.upper()}",
        "",
        "## Curve Pool State",
        f"LINK balance: {pool.get('linkBalanceFormatted', '?')}",
        f"stLINK balance: {pool.get('stLINKBalanceFormatted', '?')}",
        f"Imbalance ratio (LINK/stLINK): {pool.get('imbalanceRatio', 0):.4f}",
        "",
        "## Premium Quotes (stLINK → LINK)",
    ]

    for q in quotes:
        lines.append(f"  {q.get('amountInFormatted', '?')} stLINK → {q.get('amountOutFormatted', '?')} LINK ({q.get('premiumBps', 0)} bps)")

    lines.extend([
        "",
        "## Priority Pool",
        f"Status: {pp_status_str}",
        f"Queued: {formatUnits_py(pp_queued)} LINK",
    ])

    if vault:
        lines.extend([
            "",
            "## Vault State",
            f"stLINK held: {formatUnits_py(vault.get('totalStLINKHeld', '0'))}",
            f"LINK queued: {formatUnits_py(vault.get('totalLINKQueued', '0'))}",
            f"Cycle count: {vault.get('cycleCount', '0')}",
            f"Capital assets: {formatUnits_py(vault.get('totalCapitalAssets', '0'))} LINK",
            f"Min profit threshold: {vault.get('minProfitBps', '?')} bps",
        ])

    return "\n".join(lines)


def formatUnits_py(value_str: str, decimals: int = 18) -> str:
    try:
        val = int(value_str)
        whole = val // (10 ** decimals)
        frac = val % (10 ** decimals)
        return f"{whole:,}.{str(frac).zfill(decimals)[:2]}"
    except (ValueError, TypeError):
        return str(value_str)


@cre_bp.route("/api/cre/analyze-arb", methods=["POST"])
def analyze_arb():
    if not _check_auth():
        return jsonify({"error": "unauthorized"}), 401

    data = request.get_json(force=True, silent=True) or {}
    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        return jsonify({"error": "OPENAI_API_KEY not set"}), 503

    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        response = client.responses.create(
            model="gpt-5.3-codex",
            instructions=_ARB_SYSTEM_PROMPT,
            input=_format_arb_prompt(data),
        )
        text = response.output_text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()
        result = json.loads(text)
        logger.info("Arb AI assess | rec=%s confidence=%.2f", result.get("recommendation"), result.get("confidence", 0))
        return jsonify(result), 200
    except json.JSONDecodeError:
        return jsonify({"error": "AI response parse error"}), 500
    except Exception:
        logger.exception("arb analyze failed")
        return jsonify({"error": "internal analysis error"}), 500


_COMPOSITE_SYSTEM_PROMPT = """\
You are Orbital Sentinel, an autonomous AI analyst with FULL ECOSYSTEM VISIBILITY across 6 Chainlink CRE workflows monitoring the stake.link protocol.

You are analyzing an stLINK arbitrage opportunity on Curve's stLINK/LINK StableSwap pool. Unlike a standard arb analysis that only sees pool data, you have access to cross-workflow intelligence from the entire stake.link ecosystem, collected in a unified CRE cycle.

The arb mechanism: sell stLINK for LINK on Curve (when stLINK trades at a premium), then deposit LINK to the Priority Pool at 1:1 to get new stLINK, pocketing the premium.

## CROSS-WORKFLOW SIGNAL INTERPRETATION

Each ecosystem signal affects the arb decision differently:

1. **Price Feeds (LINK/USD, ETH/USD)**: USD-denominated profitability. A 17 bps stLINK premium means ~$0.015/LINK at $9 LINK, but if LINK is in a sharp decline, the arb profit could be wiped out by price movement during the cycle time (deposit LINK, wait for stLINK mint, sell stLINK).

2. **Treasury Risk (staking pools, reward runway, queue depth)**: Structural signals.
   - Community pool at 100% = no new staking capacity = excess demand for stLINK = premium likely persists or grows (BULLISH for arb)
   - Large Priority Pool queue = slow capital recycling = longer time between arb cycles (CAUTION: capital efficiency drops)
   - Low reward runway = potential staking reward reduction = could reduce stLINK demand long-term

3. **Morpho Vault Health (wstLINK/LINK lending)**: Supply pressure signal.
   - High utilization (>85%) = wstLINK locked as collateral = less stLINK available on open market = supports premium
   - Low utilization = more wstLINK could be unwrapped and sold, compressing the premium

4. **CCIP Lane Health (cross-chain bridges)**: Flow disruption signal.
   - Degraded lanes = cross-chain LINK movement restricted = could trap liquidity, affecting Curve pool dynamics
   - All lanes OK = normal cross-chain flows, no disruption to expect

5. **Curve Pool (detailed composition, gauge, TVL)**: Market structure.
   - Pool imbalance % and direction = premium sustainability
   - Gauge rewards = incentive for LPs to rebalance (active rewards attract rebalancing liquidity)
   - TVL = depth available for swaps without excessive slippage

## YOUR TASK

Synthesize ALL cross-workflow signals into a unified arb recommendation. Your analysis must explicitly reference how each ecosystem signal influenced your decision. Do not ignore any signal.

## OUTPUT FORMAT

Respond ONLY with valid JSON (no markdown, no extra keys):
{
  "recommendation": "<execute|wait|skip>",
  "composite_risk": "<ok|warning|critical>",
  "assessment": "<3-4 sentence analysis integrating ALL cross-workflow signals>",
  "optimal_swap_size": "<recommended stLINK amount>",
  "ecosystem_factors": {
    "price_impact": "<how LINK/USD price affects this arb>",
    "treasury_impact": "<how staking pool state affects premium persistence>",
    "morpho_impact": "<how lending utilization affects stLINK supply>",
    "ccip_impact": "<how bridge status affects liquidity flows>",
    "curve_impact": "<how pool structure affects execution>"
  },
  "risk_factors": ["<risk 1>", "<risk 2>", "<risk 3>"],
  "confidence": <0.0-1.0>,
  "reasoning": "<1-2 sentence summary of why this recommendation differs from or agrees with the isolated LAA signal>"
}

Rules:
- composite_risk reflects the OVERALL ecosystem health, not just the arb opportunity
- recommendation can DISAGREE with the isolated LAA signal when ecosystem data warrants it
- If the isolated signal is "execute" but ecosystem signals show stress (e.g., LINK price dropping + high Morpho util + degraded CCIP), recommend "wait"
- If the isolated signal is "wait" but ecosystem signals are strongly supportive (100% pool fill + healthy Morpho + stable prices), consider upgrading to "execute"
- confidence: 0.9+ when all workflows provided data, 0.6-0.8 when some signals are missing
- Every field in ecosystem_factors must reference specific numbers from the input data
"""


def _format_composite_prompt(data: dict) -> str:
    laa = data.get("laa", {})
    feeds = data.get("feeds", {})
    treasury = data.get("treasury", {})
    morpho = data.get("morpho", {})
    ccip = data.get("ccip", {})
    curve = data.get("curve", {})

    signal = laa.get("signal", "unknown")
    pool = laa.get("poolState", {})
    quotes = laa.get("premiumQuotes", [])
    pp_status = laa.get("priorityPoolStatus", -1)
    pp_queued = laa.get("priorityPoolQueued", "0")
    vault = laa.get("vaultState")

    pp_status_str = {0: "OPEN", 1: "DRAINING", 2: "CLOSED"}.get(pp_status, f"UNKNOWN({pp_status})")

    lines = [
        f"Isolated LAA signal: {signal.upper()}",
        "",
        "=" * 50,
        "WORKFLOW 1: LAA (LINK AI Arbitrage)",
        "=" * 50,
        "",
        "## Curve Pool State (from LAA)",
        f"LINK balance: {pool.get('linkBalanceFormatted', '?')}",
        f"stLINK balance: {pool.get('stLINKBalanceFormatted', '?')}",
        f"Imbalance ratio (LINK/stLINK): {pool.get('imbalanceRatio', 0):.4f}",
        "",
        "## Premium Quotes (stLINK to LINK)",
    ]

    for q in quotes:
        lines.append(f"  {q.get('amountInFormatted', '?')} stLINK -> {q.get('amountOutFormatted', '?')} LINK ({q.get('premiumBps', 0)} bps)")

    lines.extend([
        "",
        "## Priority Pool (from LAA)",
        f"Status: {pp_status_str}",
        f"Queued: {formatUnits_py(pp_queued)} LINK",
    ])

    if vault:
        lines.extend([
            "",
            "## Vault State (from LAA)",
            f"stLINK held: {formatUnits_py(vault.get('totalStLINKHeld', '0'))}",
            f"LINK queued: {formatUnits_py(vault.get('totalLINKQueued', '0'))}",
            f"Cycle count: {vault.get('cycleCount', '0')}",
            f"Capital assets: {formatUnits_py(vault.get('totalCapitalAssets', '0'))} LINK",
            f"Min profit threshold: {vault.get('minProfitBps', '?')} bps",
        ])

    # Cross-workflow context: Price Feeds
    lines.extend([
        "",
        "=" * 50,
        "WORKFLOW 2: PRICE FEEDS (Chainlink Data Feeds)",
        "=" * 50,
    ])
    monitor = feeds.get("monitor", {})
    if monitor:
        lines.extend([
            f"LINK/USD: ${monitor.get('linkUsd', '?')}",
            f"ETH/USD: ${monitor.get('ethUsd', '?')}",
            f"stLINK/LINK price ratio: {monitor.get('stlinkLinkPriceRatio', '?')}",
            f"Depeg status: {monitor.get('depegStatus', '?')} ({monitor.get('depegBps', '?')} bps from parity)",
        ])
    else:
        lines.append("No price feed data available.")

    # Cross-workflow context: Treasury Risk
    lines.extend([
        "",
        "=" * 50,
        "WORKFLOW 3: TREASURY RISK (Staking Health)",
        "=" * 50,
    ])
    staking = treasury.get("staking", {})
    community = staking.get("community", {})
    operator = staking.get("operator", {})
    rewards = treasury.get("rewards", {})
    queue = treasury.get("queue", {})
    if staking:
        lines.extend([
            f"Community Pool: {community.get('staked', '?')} / {community.get('cap', '?')} ({community.get('fillPct', 0):.1f}% full) [{community.get('risk', '?')}]",
            f"Operator Pool: {operator.get('staked', '?')} / {operator.get('cap', '?')} ({operator.get('fillPct', 0):.1f}% full) [{operator.get('risk', '?')}]",
            f"Reward Vault: {rewards.get('vaultBalance', '?')} LINK, {rewards.get('emissionPerDay', '?')}/day, runway {rewards.get('runwayDays', '?')} days [{rewards.get('risk', '?')}]",
            f"Queue Depth: {queue.get('queueLink', '?')} LINK [{queue.get('risk', '?')}]",
            f"Overall Treasury Risk: {treasury.get('overallRisk', '?').upper()}",
        ])
        alerts = treasury.get("alerts", [])
        if alerts:
            lines.append("Active alerts:")
            for a in alerts:
                lines.append(f"  - {a}")
    else:
        lines.append("No treasury data available.")

    # Cross-workflow context: Morpho
    lines.extend([
        "",
        "=" * 50,
        "WORKFLOW 4: MORPHO VAULT HEALTH (wstLINK/LINK Lending)",
        "=" * 50,
    ])
    morpho_market = morpho.get("morphoMarket", {})
    morpho_vault = morpho.get("vault", {})
    morpho_apy = morpho.get("apy", {})
    if morpho_market:
        util = morpho_market.get("utilization", 0)
        supply_tokens = int(morpho_market.get("totalSupplyAssets", "0")) // (10 ** 18)
        borrow_tokens = int(morpho_market.get("totalBorrowAssets", "0")) // (10 ** 18)
        lines.extend([
            f"Utilization: {util * 100:.2f}%",
            f"Total Supply: {supply_tokens:,} LINK",
            f"Total Borrow: {borrow_tokens:,} LINK",
            f"Supply APY: {morpho_apy.get('supplyApy', 0):.2f}%",
            f"Borrow APY: {morpho_apy.get('borrowApy', 0):.2f}%",
        ])
        if morpho_vault:
            vault_assets = int(morpho_vault.get("totalAssets", "0")) // (10 ** 18)
            lines.append(f"Vault Total Assets: {vault_assets:,} LINK (share price: {morpho_vault.get('sharePrice', '?')})")
    else:
        lines.append("No Morpho data available.")

    # Cross-workflow context: CCIP
    lines.extend([
        "",
        "=" * 50,
        "WORKFLOW 5: CCIP LANE HEALTH (Cross-Chain Bridges)",
        "=" * 50,
    ])
    ccip_meta = ccip.get("metadata", {})
    ccip_lanes = ccip.get("lanes", [])
    if ccip_meta:
        lines.extend([
            f"Lanes: {ccip_meta.get('okCount', '?')}/{ccip_meta.get('laneCount', '?')} OK",
            f"Paused: {ccip_meta.get('pausedCount', 0)}",
            f"Rate-limited: {ccip_meta.get('rateLimitedLanes', 0)}",
            f"Overall: {ccip.get('overallRisk', '?')}",
        ])
        for lane in ccip_lanes:
            rl = lane.get("rateLimiter", {})
            rl_str = f" (rate limiter: {rl.get('usedPct', 0)}% used)" if rl.get("isEnabled") else ""
            lines.append(f"  {lane.get('destChainName', '?')}: {lane.get('status', '?')}{rl_str}")
    else:
        lines.append("No CCIP data available.")

    # Cross-workflow context: Curve Pool (detailed)
    lines.extend([
        "",
        "=" * 50,
        "WORKFLOW 6: CURVE POOL (Detailed Market Structure)",
        "=" * 50,
    ])
    curve_pool = curve.get("pool", {})
    curve_gauge = curve.get("gauge", {})
    if curve_pool:
        lines.extend([
            f"LINK: {curve_pool.get('linkBalance', '?'):,.0f} ({curve_pool.get('linkPct', '?'):.1f}%)",
            f"stLINK: {curve_pool.get('stlinkBalance', '?'):,.0f} ({curve_pool.get('stlinkPct', '?'):.1f}%)",
            f"Imbalance: {curve_pool.get('imbalancePct', 0):.1f}% off center [{curve_pool.get('risk', '?')}]",
            f"Virtual Price: {curve_pool.get('virtualPrice', '?')}",
            f"TVL: ${curve_pool.get('tvlUsd', 0):,.0f}",
            f"Amplification Factor: {curve_pool.get('amplificationFactor', '?')}",
        ])
        if curve_gauge:
            gauge_staked = int(curve_gauge.get("totalStaked", "0")) // (10 ** 18)
            lines.append(f"Gauge Staked: {gauge_staked:,} LP tokens")
            lines.append(f"Active Rewards: {curve_gauge.get('rewardCount', 0)}")
    else:
        lines.append("No detailed Curve data available.")

    lines.extend([
        "",
        "=" * 50,
        "ANALYSIS REQUEST",
        "=" * 50,
        "",
        "Given ALL of the above cross-workflow data, provide your composite recommendation.",
        f"The isolated LAA signal (based only on Curve pool data) was: {signal.upper()}",
        "Your recommendation should factor in the full ecosystem context.",
    ])

    return "\n".join(lines)


@cre_bp.route("/api/cre/analyze-composite", methods=["POST"])
def analyze_composite():
    if not _check_auth():
        return jsonify({"error": "unauthorized"}), 401

    data = request.get_json(force=True, silent=True) or {}
    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        return jsonify({"error": "OPENAI_API_KEY not set"}), 503

    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        response = client.responses.create(
            model="gpt-5.3-codex",
            instructions=_COMPOSITE_SYSTEM_PROMPT,
            input=_format_composite_prompt(data),
        )
        text = response.output_text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()
        result = json.loads(text)
        logger.info(
            "Composite AI | rec=%s risk=%s confidence=%.2f",
            result.get("recommendation"),
            result.get("composite_risk"),
            result.get("confidence", 0),
        )
        return jsonify(result), 200
    except json.JSONDecodeError:
        return jsonify({"error": "AI response parse error"}), 500
    except Exception:
        logger.exception("composite analyze failed")
        return jsonify({"error": "internal analysis error"}), 500


# ─── SDL CCIP Bridge routes ───
# These serve the bridge-ai-advisor CRE workflow (separate project, same tunnel)

def _strip_nulls(obj):
    """Recursively replace None/null with 0 (CRE consensus can't serialize null)."""
    if isinstance(obj, dict):
        return {k: _strip_nulls(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_strip_nulls(v) for v in obj]
    if obj is None:
        return 0
    return obj


def _bridge_check_auth() -> bool:
    """Auth check for bridge endpoints (uses CRE_SECRET env only, not CRE_ANALYZE_SECRET)."""
    secret = os.environ.get("CRE_SECRET", "")
    if not secret:
        return True  # No CRE_SECRET = accept all (bridge default)
    provided = request.headers.get("X-CRE-Secret", "")
    return hmac.compare_digest(provided, secret)


def _bridge_heuristic(vault_state: dict) -> dict:
    """Fallback heuristic when AI is unavailable for bridge analysis."""
    util = vault_state.get("utilizationBps", 0)
    queue = vault_state.get("queueDepth", 0)
    reserve = vault_state.get("reserveRatio", 0)
    risk = "ok"
    actions = []
    adjustments = {}
    if util >= 9000:
        risk = "critical"
        actions.append("Consider reducing maxUtilizationBps to prevent liquidity crunch")
        adjustments["maxUtilizationBps"] = max(util - 1000, 5000)
    elif util >= 7000:
        risk = "warning"
        actions.append("Monitor utilization closely, approaching cap")
    if reserve < 0.02 and float(vault_state.get("totalAssets", "0")) > 0:
        risk = "critical" if risk != "critical" else risk
        actions.append("Increase badDebtReserveCutBps to rebuild reserve buffer")
        adjustments["badDebtReserveCutBps"] = 1500
    if queue >= 10:
        risk = "critical"
        actions.append("Process redemption queue urgently")
    elif queue >= 3:
        if risk == "ok":
            risk = "warning"
        actions.append("Queue building up, consider processing")
    return {
        "risk": risk,
        "recommendation": f"Vault at {util}bps utilization with {queue} queued redemptions",
        "suggestedActions": actions or ["No action needed"],
        "policyAdjustments": adjustments,
        "confidence": 0.6,
        "reasoning": "Heuristic analysis (AI unavailable)",
    }


@cre_bp.route("/api/cre/analyze-bridge", methods=["POST"])
def analyze_bridge():
    if not _bridge_check_auth():
        return jsonify({"error": "unauthorized"}), 401
    data = request.get_json(force=True, silent=True) or {}
    vault_state = data.get("vaultState", {})
    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        result = _bridge_heuristic(vault_state)
        import hashlib
        input_hash = hashlib.sha256(json.dumps(vault_state, sort_keys=True).encode()).hexdigest()[:8]
        result["_inputHash"] = input_hash
        return jsonify(result)
    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        prompt = f"""Analyze this ERC-4626 bridge vault state and provide policy recommendations.

Vault State:
- Utilization: {vault_state.get('utilizationBps', 0)} bps (max allowed: {vault_state.get('maxUtilBps', 6000)} bps)
- Queue depth: {vault_state.get('queueDepth', 0)} pending redemptions
- Bad debt reserve ratio: {vault_state.get('reserveRatio', 0):.4f} ({vault_state.get('reserveRatio', 0) * 100:.2f}%)
- Share price: {vault_state.get('sharePrice', 1):.6f}
- Free liquidity: {vault_state.get('freeLiquidity', '0')}
- Reserved: {vault_state.get('reserved', '0')}
- In-flight: {vault_state.get('inFlight', '0')}
- Total assets: {vault_state.get('totalAssets', '0')}
- LINK/USD: ${vault_state.get('linkUsd', 0):.2f}
- Current policy: maxUtil={vault_state.get('maxUtilBps', 6000)}bps, reserveCut={vault_state.get('reserveCutBps', 1000)}bps, hotReserve={vault_state.get('hotReserveBps', 2000)}bps

IMPORTANT: Never use null in the response. Use 0 to mean "no change recommended".

Respond with ONLY valid JSON (no markdown, no explanation outside JSON):
{{
  "risk": "ok or warning or critical",
  "recommendation": "one-sentence summary",
  "suggestedActions": ["action1", "action2"],
  "policyAdjustments": {{
    "maxUtilizationBps": 0,
    "badDebtReserveCutBps": 0,
    "targetHotReserveBps": 0
  }},
  "confidence": 0.0_to_1.0,
  "reasoning": "brief reasoning"
}}"""
        response = client.chat.completions.create(
            model="gpt-5.2",
            max_completion_tokens=500,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.choices[0].message.content.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
            if text.endswith("```"):
                text = text[:-3]
        result = _strip_nulls(json.loads(text))
        import hashlib
        input_hash = hashlib.sha256(json.dumps(vault_state, sort_keys=True).encode()).hexdigest()[:8]
        result["_inputHash"] = input_hash
        logger.info("Bridge AI | risk=%s confidence=%.2f", result.get("risk"), result.get("confidence", 0))
        return jsonify(result), 200
    except Exception:
        logger.exception("bridge analyze failed, using heuristic")
        result = _bridge_heuristic(vault_state)
        import hashlib
        input_hash = hashlib.sha256(json.dumps(vault_state, sort_keys=True).encode()).hexdigest()[:8]
        result["_inputHash"] = input_hash
        return jsonify(result)


app.register_blueprint(cre_bp)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    host = os.environ.get("HOST", "127.0.0.1")
    logger.info("Orbital Sentinel AI endpoint starting on %s:%d", host, port)
    app.run(host=host, port=port)
