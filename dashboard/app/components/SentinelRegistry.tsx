'use client';

import { useState, useEffect } from 'react';
import { Badge, SectionHeader, ExternalLink } from './ui';
import { timeAgoShort, riskColor } from '@/lib/helpers';

type SentinelRecord = {
  snapshotHash: string;
  riskLevel: string;
  blockTimestamp: string;
  txHash: string;
  explorerUrl: string;
};

type SentinelData = {
  ok: boolean;
  registry?: {
    address: string;
    network: string;
    explorer: string;
  };
  stats?: {
    total: number;
    ok: number;
    warning: number;
    critical: number;
  };
  workflowStats?: Record<string, number>;
  records?: SentinelRecord[];
};

function parseRiskLevel(raw: string): { workflow: string; risk: string } {
  const parts = raw.split(':');
  if (parts.length === 2) return { workflow: parts[0], risk: parts[1] };
  return { workflow: 'legacy', risk: raw };
}

const WORKFLOW_COLORS: Record<string, string> = {
  treasury: 'var(--cl-blue)',
  feeds: 'var(--green)',
  governance: 'var(--amber)',
  morpho: 'var(--purple, #a78bfa)',
  curve: 'var(--cyan, #22d3ee)',
  ccip: 'var(--orange, #fb923c)',
  legacy: 'var(--t3)',
};

const REGISTRY_ADDRESS = '0xE5B1b708b237F9F0F138DE7B03EEc1Eb1a871d40';
const EXPLORER_BASE = 'https://sepolia.etherscan.io';

export default function SentinelRegistry() {
  const [data, setData] = useState<SentinelData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const load = () => {
      fetch('/api/sentinel')
        .then(r => r.json())
        .then(setData)
        .catch(() => setError(true));
    };
    load();
    const iv = setInterval(load, 60_000);
    return () => clearInterval(iv);
  }, []);

  const fallbackView = (
    <div className="card">
      <SectionHeader title="On-Chain Proof Registry" right={<Badge risk="info">Sepolia</Badge>} />
      <div className="empty-state">
        Registry data unavailable — on-chain records visible at{' '}
        <ExternalLink href={`${EXPLORER_BASE}/address/${REGISTRY_ADDRESS}`}>
          Etherscan
        </ExternalLink>
      </div>
    </div>
  );

  if (error || (data && !data.ok)) return fallbackView;
  if (!data) return (
    <div className="card">
      <SectionHeader title="On-Chain Proof Registry" right={<Badge risk="info">Sepolia</Badge>} />
      <div className="empty-state">Loading sentinel records...</div>
    </div>
  );

  const { registry, stats, records } = data;

  return (
    <div className="card card-neon">
      <SectionHeader
        title="On-Chain Proof Registry"
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Badge risk="info">Sepolia</Badge>
            {registry && (
              <ExternalLink href={registry.explorer}>
                {registry.address.slice(0, 6)}...{registry.address.slice(-4)}
              </ExternalLink>
            )}
          </div>
        }
      />

      {/* Stats row */}
      {stats && (
        <div style={{ display: 'flex', gap: 24, marginBottom: 16, flexWrap: 'wrap' }}>
          <div>
            <div className="metric-label">Total Records</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 600, color: 'var(--t1)' }}>{stats.total}</div>
          </div>
          <div>
            <div className="metric-label">OK</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 600, color: 'var(--green)' }}>{stats.ok}</div>
          </div>
          <div>
            <div className="metric-label">Warning</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 600, color: 'var(--amber)' }}>{stats.warning}</div>
          </div>
          <div>
            <div className="metric-label">Critical</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 600, color: 'var(--red)' }}>{stats.critical}</div>
          </div>
        </div>
      )}

      {/* Per-workflow stats */}
      {data.workflowStats && Object.keys(data.workflowStats).length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {Object.entries(data.workflowStats).map(([wf, count]) => (
            <span
              key={wf}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: 14,
                fontFamily: 'var(--mono)',
                background: 'var(--bg-card)',
                border: `1px solid ${WORKFLOW_COLORS[wf] ?? 'var(--t3)'}`,
                color: WORKFLOW_COLORS[wf] ?? 'var(--t3)',
              }}
            >
              {wf}: {count}
            </span>
          ))}
        </div>
      )}

      {/* Records table */}
      {records && records.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table className="compact-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Workflow</th>
                <th>Risk</th>
                <th>Snapshot Hash</th>
                <th>TX</th>
              </tr>
            </thead>
            <tbody>
              {records.slice(0, 10).map((r) => {
                const { workflow, risk } = parseRiskLevel(r.riskLevel);
                return (
                  <tr key={r.txHash}>
                    <td style={{ whiteSpace: 'nowrap' }}>{timeAgoShort(r.blockTimestamp)}</td>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '1px 6px',
                          borderRadius: 3,
                          fontSize: 14,
                          fontFamily: 'var(--mono)',
                          color: WORKFLOW_COLORS[workflow] ?? 'var(--t3)',
                          border: `1px solid ${WORKFLOW_COLORS[workflow] ?? 'var(--t3)'}`,
                        }}
                      >
                        {workflow}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${riskColor(risk)}`} style={{ fontSize: 14 }}>
                        {risk}
                      </span>
                    </td>
                    <td className="mono">{r.snapshotHash.slice(0, 10)}...{r.snapshotHash.slice(-6)}</td>
                    <td>
                      <ExternalLink href={r.explorerUrl}>
                        {r.txHash.slice(0, 8)}...
                      </ExternalLink>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">No sentinel records found</div>
      )}
    </div>
  );
}
