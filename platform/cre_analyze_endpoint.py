"""Orbital Sentinel — CRE AI Analysis Endpoint

Standalone Flask server that receives CRE workflow snapshots
and returns AI risk assessments.

Supports two AI providers:
  - OpenAI (GPT-5.3 Codex) — primary, used for arb analysis
  - Anthropic (Claude Haiku) — used for treasury analysis

Usage:
    pip install flask openai anthropic
    export OPENAI_API_KEY=your_key        # Required for arb analysis
    export ANTHROPIC_API_KEY=your_key     # Required for treasury analysis
    export CRE_ANALYZE_SECRET=optional_shared_secret
    python cre_analyze_endpoint.py

Endpoints:
    POST /api/cre/analyze      — Treasury risk assessment (Anthropic)
    POST /api/cre/analyze-arb  — Arb vault market analysis (OpenAI)
"""

import json
import logging
import os
from flask import Flask, Blueprint, jsonify, request

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
cre_bp = Blueprint("cre", __name__)

_CRE_SECRET = os.environ.get("CRE_ANALYZE_SECRET", "")

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
            lines.append(f"- {a}")
    else:
        lines.append("No active alerts.")

    return "\n".join(lines)


@cre_bp.route("/api/cre/analyze", methods=["POST"])
def analyze():
    if _CRE_SECRET:
        if request.headers.get("X-CRE-Secret", "") != _CRE_SECRET:
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
    except json.JSONDecodeError as e:
        return jsonify({"error": "parse error", "detail": str(e)}), 500
    except Exception as e:
        logger.exception("analyze failed")
        return jsonify({"error": str(e)}), 500


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
    if _CRE_SECRET:
        if request.headers.get("X-CRE-Secret", "") != _CRE_SECRET:
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
    except json.JSONDecodeError as e:
        return jsonify({"error": "parse error", "detail": str(e)}), 500
    except Exception as e:
        logger.exception("arb analyze failed")
        return jsonify({"error": str(e)}), 500


app.register_blueprint(cre_bp)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    logger.info("Orbital Sentinel AI endpoint starting on :%d", port)
    app.run(host="0.0.0.0", port=port)
