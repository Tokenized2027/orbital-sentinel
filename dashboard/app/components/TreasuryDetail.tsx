'use client';

import { ProgressBar, Badge, SectionHeader, ExternalLink } from './ui';
import { fmt, N } from '@/lib/helpers';

type Workflow = {
  status: string;
  risk: string;
  data: Record<string, unknown>;
};

export default function TreasuryDetail({ workflow }: { workflow: Workflow | null }) {
  if (!workflow) return <div className="card empty-state">Staking data unavailable</div>;

  const data = workflow.data;
  const staking = data.staking as Record<string, Record<string, unknown>> | undefined;
  const rewards = data.rewards as Record<string, unknown> | undefined;
  const queue = data.queue as Record<string, unknown> | undefined;
  const aiAnalysis = data.aiAnalysis as string | null | undefined;
  const registryTx = data.registryTx as string | undefined;

  const communityFill = N(staking?.community?.fillPct);
  const operatorFill = N(staking?.operator?.fillPct);

  // Protocol context: full community pool = healthy (all capacity staked)
  // High fill = green, low fill = amber (capacity underutilized)
  const communityRisk = communityFill >= 95 ? 'ok' : communityFill >= 70 ? 'ok' : 'warning';
  const operatorRisk = operatorFill >= 70 ? 'ok' : operatorFill >= 30 ? 'warning' : 'critical';

  const runwayDays = N(rewards?.runwayDays);
  const runwayRisk = runwayDays > 60 ? 'ok' : runwayDays > 30 ? 'warning' : 'critical';
  const runwayPct = Math.min(100, (runwayDays / 365) * 100);

  // Priority Pool Queue: more LINK queued = more demand = bullish for SDL
  const queueLink = N(queue?.queueLink);
  const queueRisk = queueLink > 100_000 ? 'ok' : queueLink > 10_000 ? 'ok' : 'warning';

  // Overall: green if pool is full and runway is healthy
  const overallRisk = communityFill >= 95 && runwayDays > 60 ? 'ok' : 'warning';

  // Parse registryTx for etherscan link
  let txHash: string | null = null;
  if (registryTx) {
    const match = registryTx.match(/hash=(0x[a-fA-F0-9]+)/);
    if (match) txHash = match[1];
  }

  return (
    <div className="card card-neon">
      <SectionHeader title="Chainlink Staking Pools" right={<Badge risk={overallRisk}>{communityFill >= 95 ? 'fully staked' : 'active'}</Badge>} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Community Pool */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 14, color: 'var(--t2)' }}>Community Pool</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--t1)' }}>{communityFill.toFixed(0)}%</span>
          </div>
          <ProgressBar pct={communityFill} risk={communityRisk} />
          <div style={{ fontSize: 14, color: 'var(--t3)', marginTop: 4 }}>
            {fmt(staking?.community?.staked)} / {fmt(staking?.community?.cap)} LINK
          </div>
        </div>

        {/* Operator Pool */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 14, color: 'var(--t2)' }}>Operator Pool</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--t1)' }}>{operatorFill.toFixed(0)}%</span>
          </div>
          <ProgressBar pct={operatorFill} risk={operatorRisk} />
          <div style={{ fontSize: 14, color: 'var(--t3)', marginTop: 4 }}>
            {fmt(staking?.operator?.staked)} / {fmt(staking?.operator?.cap)} LINK
          </div>
        </div>

        {/* Reward Runway */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 14, color: 'var(--t2)' }}>Reward Runway</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--t1)' }}>{runwayDays.toFixed(0)}d</span>
          </div>
          <div className="gauge-track">
            <div className={`gauge-fill progress-fill ${runwayRisk}`} style={{ width: `${runwayPct}%` }} />
          </div>
          <div style={{ fontSize: 14, color: 'var(--t3)', marginTop: 4 }}>
            {fmt(rewards?.vaultBalance)} LINK vault · {fmt(rewards?.emissionPerDay)} LINK/day
          </div>
        </div>

        {/* Priority Pool Queue */}
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 14, color: 'var(--t2)' }}>Priority Pool Queue</span>
            <Badge risk={queueRisk}>{queueLink > 100_000 ? 'high demand' : 'active'}</Badge>
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 600, color: 'var(--t1)', marginTop: 6 }}>
            {fmt(queueLink)} LINK
          </div>
          <div style={{ fontSize: 14, color: 'var(--t3)', marginTop: 2 }}>
            Queued for staking — high demand signals protocol health
          </div>
        </div>

        {/* AI Analysis */}
        {aiAnalysis && (
          <div className="quote-box">{aiAnalysis}</div>
        )}

        {/* Registry TX */}
        {txHash && (
          <div style={{ fontSize: 14, color: 'var(--t3)' }}>
            On-chain proof:{' '}
            <ExternalLink href={`https://sepolia.etherscan.io/tx/${txHash}`}>
              {txHash.slice(0, 10)}...{txHash.slice(-6)}
            </ExternalLink>
          </div>
        )}
      </div>
    </div>
  );
}
