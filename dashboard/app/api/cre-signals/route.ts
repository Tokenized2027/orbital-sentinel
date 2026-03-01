import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export const revalidate = 60;
export const dynamic = 'force-dynamic';

type WorkflowKey = "feed" | "treasury" | "ccip" | "governance" | "morpho" | "curvePool";

type WorkflowSignal = {
  status: string;
  risk: string;
  generatedAt: string | null;
  ageMinutes: number | null;
  stale: boolean;
  data: Record<string, unknown>;
  alerts: string[];
};

const WORKFLOW_FILES: Record<WorkflowKey, { file: string; label: string }> = {
  feed:       { file: "cre_feed_snapshot.json",       label: "Price Feeds" },
  treasury:   { file: "cre_treasury_snapshot.json",   label: "Staking Pools" },
  ccip:       { file: "cre_ccip_snapshot.json",       label: "CCIP Lanes" },
  governance: { file: "cre_governance_snapshot.json",  label: "Governance" },
  morpho:     { file: "cre_morpho_snapshot.json",      label: "Morpho Vault" },
  curvePool:  { file: "cre_curve_pool_snapshot.json",  label: "Curve Pool" },
};

const DEFAULT_DATA_DIR = process.env.CRE_DATA_DIR
  || "/home/avi/projects/orbital/clients/stake-link/sdl/orchestration/intelligence/data";

function resolvePath(wf: { file: string }): string {
  return path.resolve(DEFAULT_DATA_DIR, wf.file);
}

function computeAge(generatedAt: string | null): { ageMinutes: number | null; stale: boolean } {
  if (!generatedAt) return { ageMinutes: null, stale: true };
  const ts = new Date(generatedAt).getTime();
  if (isNaN(ts)) return { ageMinutes: null, stale: true };
  const ageMinutes = Math.max(0, Math.round((Date.now() - ts) / 60000));
  return { ageMinutes, stale: ageMinutes > 45 };
}

function extractRisk(data: Record<string, unknown>, key: WorkflowKey): string {
  if (key === "feed") {
    const monitor = data.monitor as Record<string, unknown> | undefined;
    const ratio = Number(monitor?.stlinkLinkPriceRatio);
    const depegBps = Number(monitor?.depegBps);
    if (!Number.isFinite(depegBps)) return "unknown";
    // stLINK >= 1 LINK = premium (normal healthy state)
    if (Number.isFinite(ratio) && ratio >= 1.0) return "ok";
    // Discount thresholds: only flag critical for genuine depeg risk
    if (depegBps <= 100) return "ok";
    if (depegBps <= 300) return "warning";
    return "critical";
  }
  if (key === "treasury") {
    // Full community pool = healthy (capacity fully utilized)
    const staking = data.staking as Record<string, Record<string, unknown>> | undefined;
    const communityFill = Number(staking?.community?.fillPct);
    if (Number.isFinite(communityFill) && communityFill >= 95) return "ok";
    return (data.overallRisk as string) ?? "unknown";
  }
  if (key === "ccip") {
    return (data.overallRisk as string) ?? "unknown";
  }
  if (key === "governance") {
    const summary = data.summary as Record<string, number> | undefined;
    if (summary?.urgentProposals && summary.urgentProposals > 0) return "warning";
    return "ok";
  }
  if (key === "morpho") {
    const market = data.morphoMarket as Record<string, unknown> | undefined;
    const util = Number(market?.utilization);
    if (!Number.isFinite(util)) return "unknown";
    if (util > 0.95) return "critical";
    if (util > 0.85) return "warning";
    return "ok";
  }
  if (key === "curvePool") {
    const pool = data.pool as Record<string, unknown> | undefined;
    const imbalancePct = Number(pool?.imbalancePct);
    if (!Number.isFinite(imbalancePct)) return (data.overallRisk as string) ?? "unknown";
    // Imbalance: how far the pool deviates from 50/50
    if (imbalancePct > 30) return "critical";
    if (imbalancePct > 15) return "warning";
    return "ok";
  }
  return "unknown";
}

function extractAlerts(data: Record<string, unknown>, key: WorkflowKey): string[] {
  if (key === "treasury") return (data.alerts as string[]) ?? [];
  if (key === "ccip") {
    const alerts: string[] = [];
    const meta = data.metadata as Record<string, number> | undefined;
    if (meta?.pausedCount) alerts.push(`${meta.pausedCount} CCIP lane(s) paused`);
    if (meta?.unconfiguredCount) alerts.push(`${meta.unconfiguredCount} lane(s) unconfigured`);
    return alerts;
  }
  if (key === "governance") {
    const proposals = data.proposals as Array<Record<string, unknown>> | undefined;
    return (proposals ?? [])
      .filter((p) => p.isUrgent === true)
      .map((p) => `Urgent: ${p.title}`);
  }
  if (key === "feed") {
    const monitor = data.monitor as Record<string, unknown> | undefined;
    const ratio = Number(monitor?.stlinkLinkPriceRatio);
    const depegBps = Number(monitor?.depegBps);
    if (Number.isFinite(ratio) && ratio >= 1.0 && Number.isFinite(depegBps)) {
      return [`Premium: +${depegBps.toFixed(1)} bps above parity`];
    }
    if (Number.isFinite(depegBps) && depegBps > 100) {
      return [`Discount: ${depegBps.toFixed(1)} bps below parity`];
    }
  }
  if (key === "morpho") {
    const market = data.morphoMarket as Record<string, unknown> | undefined;
    const util = Number(market?.utilization);
    if (Number.isFinite(util) && util > 0.85) {
      return [`Morpho utilization at ${(util * 100).toFixed(1)}%`];
    }
  }
  if (key === "curvePool") {
    const pool = data.pool as Record<string, unknown> | undefined;
    const imbalancePct = Number(pool?.imbalancePct);
    if (Number.isFinite(imbalancePct) && imbalancePct > 15) {
      return [`Pool imbalance: ${imbalancePct.toFixed(1)}% off balanced`];
    }
  }
  return [];
}

function extractKeyMetric(data: Record<string, unknown>, key: WorkflowKey): { label: string; value: string | number } {
  if (key === "feed") {
    const monitor = data.monitor as Record<string, unknown> | undefined;
    const ratio = Number(monitor?.stlinkLinkPriceRatio);
    const bps = Number(monitor?.depegBps);
    if (Number.isFinite(ratio) && ratio >= 1.0) {
      return { label: "Premium", value: Number.isFinite(bps) ? `+${bps.toFixed(1)} bps` : "\u2014" };
    }
    return { label: "Discount", value: Number.isFinite(bps) ? `-${bps.toFixed(1)} bps` : "\u2014" };
  }
  if (key === "treasury") {
    const staking = data.staking as Record<string, Record<string, unknown>> | undefined;
    const fillPct = Number(staking?.community?.fillPct);
    return { label: "Community Fill", value: Number.isFinite(fillPct) ? `${fillPct.toFixed(0)}%` : "\u2014" };
  }
  if (key === "ccip") {
    const meta = data.metadata as Record<string, number> | undefined;
    return { label: "Lanes", value: meta ? `${meta.okCount ?? 0}/${meta.laneCount ?? 0} OK` : "\u2014" };
  }
  if (key === "governance") {
    const proposals = data.proposals as Array<Record<string, unknown>> | undefined;
    const active = (proposals ?? []).filter(p => p.state === 'active').length;
    return { label: "Active", value: active };
  }
  if (key === "morpho") {
    const market = data.morphoMarket as Record<string, unknown> | undefined;
    const supplied = Number(market?.totalSupplyAssets) / 1e18;
    if (Number.isFinite(supplied) && supplied > 0) {
      return { label: "wstLINK Supplied", value: `${(supplied / 1e3).toFixed(1)}K` };
    }
    const util = Number(market?.utilization);
    return { label: "Utilization", value: Number.isFinite(util) ? `${(util * 100).toFixed(1)}%` : "\u2014" };
  }
  if (key === "curvePool") {
    const pool = data.pool as Record<string, unknown> | undefined;
    const tvl = Number(pool?.tvlUsd);
    if (Number.isFinite(tvl) && tvl > 0) {
      if (tvl >= 1e6) return { label: "Pool TVL", value: `$${(tvl / 1e6).toFixed(1)}M` };
      if (tvl >= 1e3) return { label: "Pool TVL", value: `$${(tvl / 1e3).toFixed(0)}K` };
      return { label: "Pool TVL", value: `$${tvl.toFixed(0)}` };
    }
    const composition = pool?.compositionPct as string | undefined;
    return { label: "Balance", value: composition ?? "\u2014" };
  }
  return { label: "Status", value: "\u2014" };
}

export async function GET() {
  const workflows: Record<string, WorkflowSignal> = {};
  const riskLevels: string[] = [];

  for (const [key, wf] of Object.entries(WORKFLOW_FILES)) {
    try {
      const filePath = resolvePath(wf);
      const raw = await fs.readFile(filePath, "utf8");
      const data = JSON.parse(raw) as Record<string, unknown>;
      const generatedAt = (data.generated_at_utc as string) ?? null;
      const { ageMinutes, stale } = computeAge(generatedAt);
      const risk = stale ? "stale" : extractRisk(data, key as WorkflowKey);
      const alerts = extractAlerts(data, key as WorkflowKey);
      const keyMetric = extractKeyMetric(data, key as WorkflowKey);

      workflows[key] = {
        status: stale ? "stale" : risk === "ok" ? "healthy" : risk,
        risk,
        generatedAt,
        ageMinutes,
        stale,
        data: { ...data, keyMetric },
        alerts,
      };
      riskLevels.push(risk);
    } catch {
      workflows[key] = {
        status: "unavailable",
        risk: "unavailable",
        generatedAt: null,
        ageMinutes: null,
        stale: true,
        data: {},
        alerts: [],
      };
      riskLevels.push("unavailable");
    }
  }

  const RISK_PRIORITY: Record<string, number> = { critical: 4, unavailable: 3, warning: 2, stale: 1, ok: 0, unknown: 0 };
  const worstRisk = riskLevels.reduce((worst, r) => (RISK_PRIORITY[r] ?? 0) > (RISK_PRIORITY[worst] ?? 0) ? r : worst, "ok");
  const overallStatus = worstRisk === "ok" ? "healthy" : worstRisk;

  const totalAlerts = Object.values(workflows).reduce((n, w) => n + w.alerts.length, 0);
  const healthyCount = Object.values(workflows).filter((w) => w.status === "healthy").length;
  const totalCount = Object.keys(workflows).length;

  return NextResponse.json({
    ok: true,
    overallStatus,
    healthyCount,
    totalCount,
    totalAlerts,
    workflows,
    labels: Object.fromEntries(Object.entries(WORKFLOW_FILES).map(([k, v]) => [k, v.label])),
  });
}
