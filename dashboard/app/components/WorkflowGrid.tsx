'use client';

import { StatusDot } from './ui';
import { timeAgoShort } from '@/lib/helpers';
import { BarChart3, Shield, Link, Vote, Landmark, Droplets, ChevronDown } from 'lucide-react';

type Workflow = {
  status: string;
  risk: string;
  generatedAt: string | null;
  ageMinutes: number | null;
  stale: boolean;
  data: Record<string, unknown>;
  alerts: string[];
};

type Props = {
  workflows: Record<string, Workflow>;
  labels: Record<string, string>;
  selected: string | null;
  onSelect: (key: string | null) => void;
};

const ICONS: Record<string, React.ReactNode> = {
  feed:       <BarChart3 size={16} />,
  treasury:   <Shield size={16} />,
  ccip:       <Link size={16} />,
  governance: <Vote size={16} />,
  morpho:     <Landmark size={16} />,
  sdlFlows:   <Droplets size={16} />,
};

const CRE_CAPS: Record<string, string[]> = {
  feed:       ['EVMClient', 'Data Feeds'],
  treasury:   ['EVMClient', 'HTTPClient'],
  ccip:       ['EVMClient'],
  governance: ['HTTPClient', 'Consensus'],
  morpho:     ['EVMClient'],
  sdlFlows:   ['EVMClient'],
};

export default function WorkflowGrid({ workflows, labels, selected, onSelect }: Props) {
  return (
    <div className="workflow-grid">
      {Object.entries(workflows).map(([key, wf]) => {
        const km = wf.data.keyMetric as { label: string; value: string | number } | undefined;
        const isSelected = selected === key;
        return (
          <div
            key={key}
            className="card"
            onClick={() => onSelect(isSelected ? null : key)}
            style={{
              padding: 16,
              cursor: 'pointer',
              borderColor: isSelected ? 'var(--border-glow)' : undefined,
              boxShadow: isSelected ? '0 0 20px rgba(46, 123, 255, 0.15)' : undefined,
              background: isSelected ? 'var(--bg-card-hover)' : undefined,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ color: 'var(--cl-blue)', display: 'flex' }}>{ICONS[key]}</span>
              <span style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t3)', fontWeight: 500 }}>
                {labels[key] ?? key}
              </span>
              <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                <StatusDot risk={wf.risk} pulse={!wf.stale && wf.status === 'healthy'} />
                <ChevronDown
                  size={14}
                  style={{
                    color: 'var(--t3)',
                    transition: 'transform 0.2s',
                    transform: isSelected ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}
                />
              </span>
            </div>
            {km && (
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 600, color: 'var(--t1)' }}>
                  {km.value}
                </div>
                {km.label && (
                  <div style={{ fontSize: 14, color: 'var(--t2)', marginTop: 2 }}>{km.label}</div>
                )}
              </div>
            )}
            <div style={{ fontSize: 14, color: wf.stale ? 'var(--amber)' : 'var(--t3)', marginBottom: CRE_CAPS[key] ? 6 : 0 }}>
              {wf.stale ? 'stale' : wf.generatedAt ? timeAgoShort(wf.generatedAt) : '—'}
            </div>
            {CRE_CAPS[key] && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {CRE_CAPS[key].map((cap) => (
                  <span
                    key={cap}
                    style={{
                      fontSize: 11,
                      padding: '1px 5px',
                      borderRadius: 3,
                      color: 'var(--t3)',
                      border: '1px solid var(--border)',
                      fontFamily: 'var(--mono)',
                      lineHeight: '16px',
                    }}
                  >
                    {cap}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
