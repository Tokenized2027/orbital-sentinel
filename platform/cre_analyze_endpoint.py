"""Orbital Sentinel — CRE AI Analysis Endpoint

Standalone Flask server that receives treasury-risk CRE workflow snapshots
and returns Claude Haiku risk assessments.

Usage:
    pip install flask anthropic
    export ANTHROPIC_API_KEY=your_key
    export CRE_ANALYZE_SECRET=optional_shared_secret
    python cre_analyze_endpoint.py

Endpoint:
    POST /api/cre/analyze
    Headers: X-CRE-Secret: <secret>  (if CRE_ANALYZE_SECRET is set)
    Body: TreasuryOutputPayload JSON
    Returns: { assessment, risk_label, action_items, confidence }
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

Your job is to assess protocol health from structured on-chain metrics and produce concise, \
actionable risk assessments. You monitor:

- Staking pool fill percentages (utilization vs capacity)
- Reward vault runway (days before rewards depleted — critical: <7d, warning: <30d)
- Lending market utilization (critical: >95%, warning: >85%)
- Priority queue depth (pending deposits waiting for capacity)

Respond ONLY with valid JSON in exactly this format (no markdown, no extra keys):
{
  "assessment": "<1-2 sentence risk summary, specific and data-driven>",
  "risk_label": "<ok|warning|critical>",
  "action_items": ["<concrete action 1>", "<concrete action 2>"],
  "confidence": <0.0-1.0 float>
}

Rules:
- risk_label MUST match the overallRisk in the input
- action_items must be specific and actionable
- confidence: 0.9-1.0 if all data present, 0.6-0.8 if some APIs were unreachable
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


app.register_blueprint(cre_bp)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    logger.info("Orbital Sentinel AI endpoint starting on :%d", port)
    app.run(host="0.0.0.0", port=port)
