'use client';

import { Badge, SectionHeader, ExternalLink } from './ui';

type Proposal = {
  id: string;
  title: string;
  space: string;
  state: string;
  choices: string[];
  scores: number[];
  scores_total: number;
  votes: number;
  hoursRemaining: number | null;
  isUrgent: boolean;
  author: string;
};

type Workflow = {
  status: string;
  risk: string;
  data: Record<string, unknown>;
};

// stake.link council has 7 members
const COUNCIL_SIZE = 7;

function truncateAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function GovernancePanel({ workflow }: { workflow: Workflow | null }) {
  if (!workflow) return <div className="card empty-state">Governance data unavailable</div>;

  const proposals = ((workflow.data.proposals as Proposal[]) ?? []).slice(0, 5);
  const active = proposals.filter(p => p.state === 'active');

  return (
    <div className="card card-neon">
      <SectionHeader
        title="Governance"
        right={
          <span style={{ fontSize: 14, color: 'var(--t2)' }}>
            {active.length} active proposal{active.length !== 1 ? 's' : ''}
          </span>
        }
      />

      {proposals.length === 0 ? (
        <div className="empty-state">No governance proposals found</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {proposals.map((p) => {
            const total = p.scores_total || 1;
            const yesPct = (p.scores[0] ?? 0) / total * 100;
            const noPct = (p.scores[1] ?? 0) / total * 100;
            const voterCount = p.votes ?? 0;

            return (
              <div key={p.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 14, color: 'var(--t1)', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.title}
                  </span>
                  {p.isUrgent && <Badge risk="warning">Urgent</Badge>}
                  <Badge risk={p.state === 'active' ? 'ok' : 'stale'}>{p.state}</Badge>
                </div>

                {/* Vote count & author */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, fontSize: 14 }}>
                  <span style={{ color: 'var(--t2)' }}>
                    <span style={{ color: 'var(--t1)', fontWeight: 600 }}>{voterCount}</span>/{COUNCIL_SIZE} council members voted
                  </span>
                  <span style={{ color: 'var(--t3)' }}>·</span>
                  <span style={{ color: 'var(--t3)' }}>
                    Author:{' '}
                    <ExternalLink href={`https://etherscan.io/address/${p.author}`}>
                      {truncateAddr(p.author)}
                    </ExternalLink>
                  </span>
                </div>

                {/* Vote distribution */}
                <div className="vote-bar-track" style={{ marginBottom: 4 }}>
                  <div className="vote-bar-yes" style={{ width: `${yesPct}%` }} />
                  <div className="vote-bar-no" style={{ width: `${noPct}%` }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: 'var(--t3)' }}>
                  <span style={{ color: 'var(--green)' }}>YES {yesPct.toFixed(0)}% ({p.scores[0] ?? 0})</span>
                  {p.hoursRemaining != null && (
                    <span>{p.hoursRemaining.toFixed(0)}h remaining</span>
                  )}
                  <span style={{ color: 'var(--red)' }}>NO {noPct.toFixed(0)}% ({p.scores[1] ?? 0})</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
