'use client';

import { riskColor } from '@/lib/helpers';

export function StatusDot({ risk, pulse = false, 'aria-label': ariaLabel }: { risk: string; pulse?: boolean; 'aria-label'?: string }) {
  const cls = riskColor(risk);
  return <span className={`status-dot ${cls}${pulse ? ' pulse' : ''}`} role={ariaLabel ? 'img' : undefined} aria-label={ariaLabel} />;
}

export function MetricCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
  );
}

export function ProgressBar({ pct, risk }: { pct: number; risk: string }) {
  const cls = riskColor(risk);
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className="progress-track">
      <div className={`progress-fill ${cls}`} style={{ width: `${w}%` }} />
    </div>
  );
}

export function Badge({ risk, children }: { risk: string; children: React.ReactNode }) {
  const cls = riskColor(risk);
  return <span className={`badge ${cls}`}>{children}</span>;
}

export function SectionHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="card-header">
      <h2 className="section-title" style={{ margin: 0 }}>{title}</h2>
      {right}
    </div>
  );
}

export function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="ext-link">
      {children}
    </a>
  );
}

export function Skeleton() {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      borderRadius: 'var(--r-sm)',
      height: 16,
      width: '60%',
      animation: 'pulse 1.5s ease-in-out infinite',
    }} />
  );
}
