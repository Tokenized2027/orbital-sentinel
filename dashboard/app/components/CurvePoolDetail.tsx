'use client';

import { Badge, SectionHeader, ProgressBar } from './ui';
import { riskColor } from '@/lib/helpers';

type Workflow = {
  status: string;
  risk: string;
  data: Record<string, unknown>;
};

type GaugeReward = {
  token: string;
  ratePerSecond: string;
  periodFinish: number;
  isActive: boolean;
};

export default function CurvePoolDetail({ workflow }: { workflow: Workflow | null }) {
  if (!workflow) return <div className="card empty-state">Curve Pool data unavailable</div>;

  const data = workflow.data;
  const pool = data.pool as Record<string, unknown> | undefined;

  const tvlUsd = Number(pool?.tvlUsd);
  const linkBalance = Number(pool?.linkBalance);
  const stlinkBalance = Number(pool?.stlinkBalance);
  const linkPct = Number(pool?.linkPct);
  const stlinkPct = Number(pool?.stlinkPct);
  const imbalancePct = Number(pool?.imbalancePct);
  const amplification = Number(pool?.amplificationFactor);

  const totalTokens = (Number.isFinite(linkBalance) ? linkBalance : 0) + (Number.isFinite(stlinkBalance) ? stlinkBalance : 0);

  // Gauge data
  const gauge = data.gauge as { totalStaked: string; rewardCount: number; rewards: GaugeReward[]; inflationRate: string } | undefined;
  const gaugeStaked = gauge ? Number(gauge.totalStaked) / 1e18 : 0;

  let healthLabel: string;
  let healthRisk: string;
  if (!Number.isFinite(imbalancePct)) {
    healthLabel = 'No Data';
    healthRisk = 'stale';
  } else if (imbalancePct <= 5) {
    healthLabel = 'Well Balanced';
    healthRisk = 'ok';
  } else if (imbalancePct <= 15) {
    healthLabel = 'Slight Imbalance';
    healthRisk = 'ok';
  } else if (imbalancePct <= 30) {
    healthLabel = 'Imbalanced';
    healthRisk = 'warning';
  } else {
    healthLabel = 'Heavily Imbalanced';
    healthRisk = 'critical';
  }

  return (
    <div className="card card-neon">
      <SectionHeader title="Curve Pool Health" right={<Badge risk={healthRisk}>{healthLabel}</Badge>} />

      {/* TVL */}
      <div style={{ textAlign: 'center', padding: '12px 0 20px' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 36, fontWeight: 700, color: 'var(--t1)', lineHeight: 1 }}>
          {Number.isFinite(tvlUsd)
            ? tvlUsd >= 1e6
              ? `$${(tvlUsd / 1e6).toFixed(2)}M`
              : `$${(tvlUsd / 1e3).toFixed(0)}K`
            : '\u2014'}
        </div>
        <div style={{ fontSize: 14, color: 'var(--t3)', marginTop: 4 }}>Total Value Locked</div>
      </div>

      {/* Pool composition bar */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 14, color: 'var(--t2)' }}>
            LINK {Number.isFinite(linkPct) ? `${linkPct.toFixed(1)}%` : '\u2014'}
          </span>
          <span style={{ fontSize: 14, color: 'var(--t2)' }}>
            stLINK {Number.isFinite(stlinkPct) ? `${stlinkPct.toFixed(1)}%` : '\u2014'}
          </span>
        </div>
        <div style={{
          display: 'flex',
          width: '100%',
          height: 10,
          borderRadius: 5,
          overflow: 'hidden',
          background: 'rgba(255,255,255,0.06)',
        }}>
          <div style={{
            width: `${Number.isFinite(linkPct) ? linkPct : 50}%`,
            height: '100%',
            background: 'var(--cl-blue)',
            transition: 'width 0.6s ease',
          }} />
          <div style={{
            width: `${Number.isFinite(stlinkPct) ? stlinkPct : 50}%`,
            height: '100%',
            background: 'var(--cl-purple)',
            transition: 'width 0.6s ease',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 14, fontFamily: 'var(--mono)', color: 'var(--t3)' }}>
            {Number.isFinite(linkBalance) ? `${(linkBalance / 1e3).toFixed(1)}K` : '\u2014'}
          </span>
          <span style={{ fontSize: 14, fontFamily: 'var(--mono)', color: 'var(--t3)' }}>
            {Number.isFinite(stlinkBalance) ? `${(stlinkBalance / 1e3).toFixed(1)}K` : '\u2014'}
          </span>
        </div>
      </div>

      {/* Imbalance gauge */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span className="metric-label">Pool Imbalance</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--t1)' }}>
            {Number.isFinite(imbalancePct) ? `${imbalancePct.toFixed(1)}%` : '\u2014'}
          </span>
        </div>
        <ProgressBar pct={Number.isFinite(imbalancePct) ? Math.min(imbalancePct * 2, 100) : 0} risk={healthRisk} />
      </div>

      {/* Context note */}
      <div style={{ fontSize: 14, color: 'var(--t2)', textAlign: 'center', marginTop: 12, lineHeight: 1.5 }}>
        {imbalancePct <= 15
          ? 'Pool is well-balanced. Swaps between LINK and stLINK have low slippage.'
          : imbalancePct <= 30
            ? 'Pool is tilted toward stLINK, indicating some selling pressure. Larger swaps may experience higher slippage.'
            : 'Pool is heavily imbalanced. This typically precedes a discount widening and creates a stronger arb opportunity.'}
      </div>

      {/* Gauge incentives */}
      {gauge && (
        <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(79,212,229,0.06)', borderRadius: 8, border: '1px solid rgba(79,212,229,0.15)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)', marginBottom: 8 }}>Gauge Incentives</div>
          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
            <div>
              <div className="metric-label">LP Staked in Gauge</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 16, color: 'var(--t1)' }}>
                {gaugeStaked > 0 ? `${(gaugeStaked / 1e3).toFixed(1)}K` : '\u2014'}
              </div>
            </div>
            <div>
              <div className="metric-label">Reward Tokens</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 16, color: 'var(--t1)' }}>
                {gauge.rewardCount}
              </div>
            </div>
            {(gauge.rewards as GaugeReward[])?.map((r: GaugeReward, i: number) => {
              const rate = Number(r.ratePerSecond) / 1e18;
              const daily = rate * 86400;
              return (
                <div key={i}>
                  <div className="metric-label">
                    {r.isActive ? 'Active' : 'Ended'} #{i + 1}
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 14, color: r.isActive ? '#4FD4E5' : 'var(--t3)' }}>
                    {daily < 1 ? daily.toFixed(4) : daily.toFixed(1)}/day
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t3)' }}>
                    {r.token.slice(0, 8)}...
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Secondary metrics */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 32, borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 16 }}>
        <div style={{ textAlign: 'center' }}>
          <div className="metric-label">Total Tokens</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--t1)' }}>
            {totalTokens > 0 ? `${(totalTokens / 1e3).toFixed(1)}K` : '\u2014'}
          </div>
        </div>
        {Number.isFinite(amplification) && amplification > 0 && (
          <div style={{ textAlign: 'center' }}>
            <div className="metric-label">Amp Factor</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--t1)' }}>
              {amplification}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
