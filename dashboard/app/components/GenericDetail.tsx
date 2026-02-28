'use client';

import { Badge, SectionHeader, ProgressBar } from './ui';
import { fmt, N } from '@/lib/helpers';

type Workflow = {
  status: string;
  risk: string;
  data: Record<string, unknown>;
};

type Balance = {
  address: string;
  label: string;
  group: string;
  sdlBalance: string | null;
  stLinkBalance: string | null;
};

function wei(val: string | null | undefined): number {
  if (!val) return 0;
  const n = Number(val);
  return Number.isFinite(n) ? n / 1e18 : 0;
}

function fmtK(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

export default function GenericDetail({ workflow, label }: { workflow: Workflow; label: string }) {
  const data = workflow.data;

  // Morpho vault — on-chain lending market details
  if (data.morphoMarket) {
    const market = data.morphoMarket as Record<string, unknown>;
    const vault = data.vault as Record<string, unknown> | undefined;
    const meta = data.metadata as Record<string, unknown> | undefined;
    const util = N(market.utilization);
    const supplied = wei(market.totalSupplyAssets as string);
    const borrowed = wei(market.totalBorrowAssets as string);
    const available = supplied - borrowed;
    const sharePrice = Number(vault?.sharePrice);
    const utilRisk = util > 0.95 ? 'critical' : util > 0.85 ? 'warning' : 'ok';

    return (
      <div className="card card-neon">
        <SectionHeader title="Morpho wstLINK/LINK Market" right={<Badge risk={utilRisk}>{(util * 100).toFixed(1)}% utilized</Badge>} />
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <div className="metric-label">wstLINK Supplied</div>
            <div className="metric-value">{fmtK(supplied)}</div>
          </div>
          <div>
            <div className="metric-label">LINK Borrowed</div>
            <div className="metric-value">{fmtK(borrowed)}</div>
          </div>
          <div>
            <div className="metric-label">Available</div>
            <div className="metric-value">{fmtK(available)}</div>
          </div>
          {Number.isFinite(sharePrice) && sharePrice > 0 && (
            <div>
              <div className="metric-label">Vault Share Price</div>
              <div className="metric-value">{sharePrice.toFixed(4)}</div>
            </div>
          )}
        </div>

        {/* Utilization bar */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 14, color: 'var(--t2)' }}>Utilization</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--t1)' }}>{(util * 100).toFixed(1)}%</span>
          </div>
          <ProgressBar pct={util * 100} risk={utilRisk} />
        </div>

        {/* Contract addresses */}
        {meta && (
          <div style={{ marginTop: 16, fontSize: 14, color: 'var(--t3)' }}>
            Morpho: <span style={{ fontFamily: 'var(--mono)', fontSize: 14 }}>{String(meta.morphoAddress ?? '').slice(0, 10)}...</span>
            {' · '}
            Vault: <span style={{ fontFamily: 'var(--mono)', fontSize: 14 }}>{String(meta.vaultAddress ?? '').slice(0, 10)}...</span>
          </div>
        )}
      </div>
    );
  }

  // SDL Flows — NOP & whale token holdings
  if (data.balances) {
    const balances = data.balances as Balance[];
    const totalSdl = balances.reduce((s, b) => s + wei(b.sdlBalance), 0);
    const totalStLink = balances.reduce((s, b) => s + wei(b.stLinkBalance), 0);
    const groups = balances.reduce((acc, b) => {
      const g = b.group || 'unknown';
      if (!acc[g]) acc[g] = { count: 0, sdl: 0, stlink: 0 };
      acc[g].count++;
      acc[g].sdl += wei(b.sdlBalance);
      acc[g].stlink += wei(b.stLinkBalance);
      return acc;
    }, {} as Record<string, { count: number; sdl: number; stlink: number }>);

    const GROUP_LABELS: Record<string, string> = {
      nop: 'Node Operators',
      nop_sub: 'NOP Sub-accounts',
      whale: 'Whales',
      protocol: 'Protocol',
      dex: 'DEX Pools',
      sniper: 'Snipers',
    };

    return (
      <div className="card card-neon">
        <SectionHeader title="SDL Token Flows" right={<Badge risk="ok">{balances.length} addresses</Badge>} />

        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', marginBottom: 20 }}>
          <div>
            <div className="metric-label">Total SDL Tracked</div>
            <div className="metric-value">{fmtK(totalSdl)}</div>
          </div>
          <div>
            <div className="metric-label">Total stLINK Held</div>
            <div className="metric-value">{fmtK(totalStLink)}</div>
          </div>
        </div>

        {/* Breakdown by group */}
        <div style={{ fontSize: 14, color: 'var(--t2)' }}>
          {Object.entries(groups)
            .sort((a, b) => b[1].sdl - a[1].sdl)
            .map(([group, info]) => (
              <div key={group} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span>{GROUP_LABELS[group] ?? group} ({info.count})</span>
                <span style={{ fontFamily: 'var(--mono)' }}>
                  {fmtK(info.sdl)} SDL
                  {info.stlink > 0 ? ` · ${fmtK(info.stlink)} stLINK` : ''}
                </span>
              </div>
            ))}
        </div>
      </div>
    );
  }

  // SDL Flows fallback (metadata only, no balances)
  if (data.metadata && (data.metadata as Record<string, unknown>).addressCount !== undefined) {
    const meta = data.metadata as Record<string, number>;
    return (
      <div className="card card-neon">
        <SectionHeader title={label} right={<Badge risk={workflow.risk}>{workflow.risk}</Badge>} />
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          <div>
            <div className="metric-label">Tracked Addresses</div>
            <div className="metric-value">{meta.addressCount ?? 0}</div>
          </div>
        </div>
      </div>
    );
  }

  // Fallback
  return (
    <div className="card">
      <SectionHeader title={label} right={<Badge risk={workflow.risk}>{workflow.risk}</Badge>} />
      <div className="empty-state">No detailed view available</div>
    </div>
  );
}
