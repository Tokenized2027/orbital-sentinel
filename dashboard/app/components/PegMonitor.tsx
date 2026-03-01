'use client';

import { Badge, SectionHeader } from './ui';

type Workflow = {
  status: string;
  risk: string;
  data: Record<string, unknown>;
};

export default function PegMonitor({ workflow }: { workflow: Workflow | null }) {
  if (!workflow) return <div className="card empty-state">Feed data unavailable</div>;

  const data = workflow.data;
  const monitor = data.monitor as Record<string, unknown> | undefined;

  const ratio = Number(monitor?.stlinkLinkPriceRatio);
  const rawBps = Number(monitor?.depegBps);
  const linkUsd = Number(monitor?.linkUsd);
  const ethUsd = Number(monitor?.ethUsd);

  // stLINK >= 1 LINK = premium (normal healthy state for a yield-bearing LST)
  // stLINK < 1 LINK = discount (arb opportunity; only a depeg concern at extreme levels)
  const isPremium = Number.isFinite(ratio) && ratio >= 1.0;
  const deviationBps = Number.isFinite(rawBps) ? rawBps : 0;

  let statusLabel: string;
  let statusRisk: string;
  if (!Number.isFinite(ratio)) {
    statusLabel = 'No Data';
    statusRisk = 'stale';
  } else if (isPremium) {
    statusLabel = `Premium (+${deviationBps.toFixed(1)} bps)`;
    statusRisk = 'ok';
  } else if (deviationBps <= 100) {
    statusLabel = 'Near Parity';
    statusRisk = 'ok';
  } else if (deviationBps <= 300) {
    statusLabel = `Discount (${deviationBps.toFixed(0)} bps)`;
    statusRisk = 'warning';
  } else {
    statusLabel = `Deep Discount (${deviationBps.toFixed(0)} bps)`;
    statusRisk = 'critical';
  }

  // Visual bar: show premium on right side (green), discount on left (amber/red)
  // Bar represents -200 to +200 bps range, centered at 0
  const barPosition = isPremium
    ? 50 + Math.min(50, (deviationBps / 200) * 50)
    : 50 - Math.min(50, (deviationBps / 200) * 50);

  return (
    <div className="card card-neon">
      <SectionHeader title="stLINK Peg Monitor" right={<Badge risk={statusRisk}>{isPremium ? 'premium' : statusRisk === 'ok' ? 'near parity' : statusRisk === 'warning' ? 'discount' : 'deep discount'}</Badge>} />

      <div style={{ textAlign: 'center', padding: '12px 0 20px' }}>
        {/* Main ratio */}
        <div style={{ fontFamily: 'var(--mono)', fontSize: 36, fontWeight: 700, color: 'var(--t1)', lineHeight: 1 }}>
          {Number.isFinite(ratio) ? ratio.toFixed(4) : '—'}
        </div>
        <div style={{ fontSize: 14, color: 'var(--t3)', marginTop: 4 }}>stLINK / LINK ratio</div>

        {/* Status label */}
        <div style={{ marginTop: 12 }}>
          <Badge risk={statusRisk}>{statusLabel}</Badge>
        </div>

        {/* Deviation bar — centered at parity (1.0) */}
        <div style={{ marginTop: 16, maxWidth: 320, margin: '16px auto 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 14, color: 'var(--t3)' }}>-200 bps</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--t1)' }}>
              {isPremium ? '+' : '-'}{deviationBps.toFixed(1)} bps
            </span>
            <span style={{ fontSize: 14, color: 'var(--t3)' }}>+200 bps</span>
          </div>
          <div style={{ position: 'relative', width: '100%', height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
            {/* Center line at parity */}
            <div style={{ position: 'absolute', left: '50%', top: -2, bottom: -2, width: 1, background: 'var(--t3)', opacity: 0.4 }} />
            {/* Indicator dot */}
            <div style={{
              position: 'absolute',
              left: `${barPosition}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: isPremium ? 'var(--green)' : deviationBps > 300 ? 'var(--red)' : deviationBps > 100 ? 'var(--amber)' : 'var(--green)',
              boxShadow: `0 0 8px ${isPremium ? 'rgba(34,197,94,0.5)' : deviationBps > 100 ? 'rgba(245,158,11,0.5)' : 'rgba(34,197,94,0.5)'}`,
            }} />
          </div>
        </div>
      </div>

      {/* Context note */}
      {isPremium && (
        <div style={{ fontSize: 14, color: 'var(--t2)', textAlign: 'center', marginTop: 12, lineHeight: 1.5 }}>
          stLINK is a yield-bearing token — trading above 1:1 with LINK is the normal, healthy state
          as it reflects accrued staking rewards.
        </div>
      )}
      {!isPremium && deviationBps > 100 && (
        <div style={{ fontSize: 14, color: 'var(--t2)', textAlign: 'center', marginTop: 12, lineHeight: 1.5 }}>
          stLINK is trading below parity. This typically reflects temporary selling pressure
          or low Curve pool liquidity — and represents an arbitrage opportunity for buyers.
          {deviationBps > 300 && ' A discount this deep may signal broader market stress.'}
        </div>
      )}

      {/* Secondary metrics */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 32, borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 8 }}>
        <div style={{ textAlign: 'center' }}>
          <div className="metric-label">LINK/USD</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--t1)' }}>
            ${Number.isFinite(linkUsd) ? linkUsd.toFixed(2) : '—'}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div className="metric-label">ETH/USD</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--t1)' }}>
            ${Number.isFinite(ethUsd) ? ethUsd.toFixed(2) : '—'}
          </div>
        </div>
      </div>
    </div>
  );
}
