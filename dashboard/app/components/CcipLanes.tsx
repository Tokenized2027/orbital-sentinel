'use client';

import { StatusDot, Badge, SectionHeader, ProgressBar } from './ui';
import { Hexagon } from 'lucide-react';

type Lane = {
  destChainName: string;
  configured: boolean;
  status: string;
  risk: string;
  rateLimiter?: {
    usedPct: number;
    isEnabled: boolean;
    risk: string;
  };
};

type Workflow = {
  status: string;
  risk: string;
  data: Record<string, unknown>;
};

const CHAIN_COLORS: Record<string, string> = {
  'arbitrum-one': '#12AAFF',
  'base-mainnet': '#0052FF',
  'polygon-mainnet': '#8247E5',
};

export default function CcipLanes({ workflow }: { workflow: Workflow | null }) {
  if (!workflow) return <div className="card empty-state">CCIP data unavailable</div>;

  const lanes = (workflow.data.lanes as Lane[]) ?? [];
  const meta = workflow.data.metadata as Record<string, number> | undefined;
  const okCount = meta?.okCount ?? 0;
  const total = meta?.laneCount ?? 0;

  return (
    <div className="card card-neon">
      <SectionHeader
        title="CCIP Lanes"
        right={
          <span style={{ fontSize: 14, color: 'var(--t2)' }}>
            {okCount}/{total} lanes operational
          </span>
        }
      />

      {lanes.map((lane) => (
        <div key={lane.destChainName} className="lane-card">
          <Hexagon size={20} color={CHAIN_COLORS[lane.destChainName] ?? 'var(--cl-blue)'} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <StatusDot risk={lane.risk} pulse={lane.status === 'ok'} />
              <span style={{ fontSize: 14, color: 'var(--t1)', fontWeight: 500 }}>
                {lane.destChainName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </span>
              {lane.configured && <Badge risk="info">Configured</Badge>}
            </div>
            {lane.rateLimiter?.isEnabled && (
              <div style={{ maxWidth: 200 }}>
                <div style={{ fontSize: 14, color: 'var(--t3)', marginBottom: 3 }}>
                  Rate limiter: {lane.rateLimiter.usedPct}% used
                </div>
                <ProgressBar pct={lane.rateLimiter.usedPct} risk={lane.rateLimiter.risk} />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
