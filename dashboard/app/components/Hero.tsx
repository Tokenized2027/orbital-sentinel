'use client';

import Image from 'next/image';
import { StatusDot } from './ui';

type HeroProps = {
  overallStatus: string;
  healthyCount: number;
  totalCount: number;
  totalAlerts: number;
  loading: boolean;
};

export default function Hero({ overallStatus, healthyCount, totalCount, totalAlerts, loading }: HeroProps) {
  const statusText = overallStatus === 'healthy'
    ? 'All Systems Healthy'
    : `${totalAlerts} Alert${totalAlerts !== 1 ? 's' : ''} Active`;

  return (
    <div style={{ textAlign: 'center', paddingBottom: 8 }}>
      {/* Orbital logo */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
        <Image
          src="/orbital-logo.png"
          alt="Orbital Sentinel"
          width={72}
          height={72}
          style={{ objectFit: 'contain', filter: 'drop-shadow(0 0 12px rgba(255, 255, 255, 0.1))' }}
          priority
        />
      </div>

      <h1 className="hero-title">Sentinel by Orbital</h1>
      <p className="hero-subtitle">
        Autonomous DeFi health monitoring. 8 CRE workflows. On-chain proofs. LAA live on mainnet DON.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
        {loading ? (
          <div className="status-ring">
            <div style={{
              width: 120,
              height: 16,
              background: 'rgba(255, 255, 255, 0.05)',
              borderRadius: 'var(--r-sm)',
              animation: 'pulse 1.5s ease-in-out infinite',
            }} />
          </div>
        ) : (
          <div className="status-ring">
            <StatusDot risk={overallStatus} pulse />
            <span style={{ fontSize: 15, color: 'var(--t1)', marginLeft: 8 }}>{statusText}</span>
          </div>
        )}

        {!loading && (
          <span style={{ fontSize: 15, color: 'var(--t3)' }}>
            {healthyCount}/{totalCount} workflows healthy
          </span>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <span className="cl-badge">
          <svg width="14" height="16" viewBox="0 0 37.8 43.6" fill="none">
            <path d="M18.9 0l-4.2 2.4L4.2 8.4 0 10.8v22l4.2 2.4 10.5 6 4.2 2.4 4.2-2.4 10.5-6 4.2-2.4v-22l-4.2-2.4-10.5-6L18.9 0zm0 5.5l10.5 6v12l-10.5 6-10.5-6v-12l10.5-6z" fill="#2E7BFF"/>
          </svg>
          Built on Chainlink CRE
        </span>
      </div>

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <p style={{ fontSize: 15, color: 'var(--t3)', fontStyle: 'italic', margin: 0 }}>
          Select a workflow below to explore real-time metrics and on-chain proofs
        </p>
        <a
          href="/whitepaper.html"
          style={{
            fontSize: 14,
            padding: '4px 12px',
            borderRadius: 'var(--r-sm)',
            background: 'rgba(55, 91, 210, 0.15)',
            color: 'var(--chainlink)',
            textDecoration: 'none',
            fontWeight: 600,
            border: '1px solid rgba(55, 91, 210, 0.3)',
          }}
        >
          Read the Whitepaper
        </a>
      </div>
    </div>
  );
}
