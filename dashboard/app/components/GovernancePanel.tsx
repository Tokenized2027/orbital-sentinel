'use client';

import { Badge, SectionHeader, ExternalLink } from './ui';

type Proposal = {
  id: string;
  title: string;
  space: string;
  state: string;
  start: number;
  end: number;
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

const COUNCIL_SIZE = 7;

function truncateAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function isCouncilVote(p: Proposal): boolean {
  return p.space === 'council.stakedotlink.eth';
}

function getOutcome(p: Proposal): { label: string; risk: string } {
  if (p.state === 'active') return { label: 'Active', risk: 'ok' };
  const yesScore = p.scores[0] ?? 0;
  const noScore = p.scores[1] ?? 0;
  if (yesScore > noScore) return { label: 'Passed', risk: 'ok' };
  if (noScore > yesScore) return { label: 'Rejected', risk: 'critical' };
  return { label: 'Tied', risk: 'warning' };
}

function formatDate(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function extractSlurpNumber(title: string): string | null {
  const m = title.match(/SLURP[- ]?(\d+)/i);
  return m ? m[1] : null;
}

export default function GovernancePanel({ workflow }: { workflow: Workflow | null }) {
  if (!workflow) return <div className="card empty-state">Governance data unavailable</div>;

  const allProposals = (workflow.data.proposals as Proposal[]) ?? [];
  const active = allProposals.filter(p => p.state === 'active');
  const closed = allProposals.filter(p => p.state === 'closed');

  // Get recent SLURPs only (filter out non-SLURP votes like council elections, BUILD cubes)
  const slurps = closed.filter(p => extractSlurpNumber(p.title) !== null).slice(0, 7);

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

      {/* Active proposals — full detail */}
      {active.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
          {active.map((p) => {
            const total = p.scores_total || 1;
            const yesPct = (p.scores[0] ?? 0) / total * 100;
            const noPct = (p.scores[1] ?? 0) / total * 100;
            const voterCount = p.votes ?? 0;
            const council = isCouncilVote(p);

            return (
              <div key={p.id} style={{
                background: 'rgba(46, 123, 255, 0.06)',
                border: '1px solid rgba(46, 123, 255, 0.2)',
                borderRadius: 10,
                padding: 16,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Badge risk="ok">Active</Badge>
                  <Badge risk="info">{council ? 'Council' : 'Community'}</Badge>
                  {p.isUrgent && <Badge risk="warning">Urgent</Badge>}
                </div>
                <div style={{ fontSize: 15, color: 'var(--t1)', fontWeight: 600, marginBottom: 8, lineHeight: 1.4 }}>
                  {p.title}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, fontSize: 13 }}>
                  {council ? (
                    <span style={{ color: 'var(--t2)' }}>
                      <span style={{ color: 'var(--t1)', fontWeight: 600 }}>{voterCount}</span>/{COUNCIL_SIZE} council members voted
                    </span>
                  ) : (
                    <span style={{ color: 'var(--t2)' }}>
                      <span style={{ color: 'var(--t1)', fontWeight: 600 }}>{voterCount}</span> voters
                    </span>
                  )}
                  <span style={{ color: 'var(--t3)' }}>·</span>
                  <span style={{ color: 'var(--t3)' }}>
                    Author:{' '}
                    <ExternalLink href={`https://etherscan.io/address/${p.author}`}>
                      {truncateAddr(p.author)}
                    </ExternalLink>
                  </span>
                  {p.hoursRemaining != null && (
                    <>
                      <span style={{ color: 'var(--t3)' }}>·</span>
                      <span style={{ color: p.hoursRemaining < 24 ? 'var(--yellow)' : 'var(--t2)' }}>
                        {p.hoursRemaining < 24
                          ? `${p.hoursRemaining.toFixed(0)}h remaining`
                          : `${Math.floor(p.hoursRemaining / 24)}d ${Math.round(p.hoursRemaining % 24)}h remaining`}
                      </span>
                    </>
                  )}
                </div>

                {/* Vote bar */}
                <div className="vote-bar-track" style={{ marginBottom: 4 }}>
                  <div className="vote-bar-yes" style={{ width: `${yesPct}%` }} />
                  <div className="vote-bar-no" style={{ width: `${noPct}%` }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--t3)' }}>
                  <span style={{ color: 'var(--green)' }}>
                    {p.choices[0] ?? 'YES'} {yesPct.toFixed(0)}%{' '}
                    ({council ? p.scores[0] ?? 0 : `${((p.scores[0] ?? 0) / 1e6).toFixed(1)}M`})
                  </span>
                  <span style={{ color: 'var(--red)' }}>
                    {p.choices[1] ?? 'NO'} {noPct.toFixed(0)}%{' '}
                    ({council ? p.scores[1] ?? 0 : `${((p.scores[1] ?? 0) / 1e6).toFixed(1)}M`})
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {active.length === 0 && (
        <div style={{ color: 'var(--t3)', fontSize: 14, marginBottom: 16, fontStyle: 'italic' }}>
          No active proposals
        </div>
      )}

      {/* SLURP History */}
      {slurps.length > 0 && (
        <>
          <div style={{ fontSize: 13, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, fontWeight: 600 }}>
            Recent SLURPs
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {slurps.map((p) => {
              const outcome = getOutcome(p);
              const slurpNum = extractSlurpNumber(p.title);
              const council = isCouncilVote(p);
              const yesPct = p.scores_total > 0 ? ((p.scores[0] ?? 0) / p.scores_total * 100) : 0;
              // Clean title: remove "SLURP-XX | " prefix
              const cleanTitle = p.title.replace(/^SLURP[- ]?\d+\s*\|?\s*/i, '');

              return (
                <div key={p.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 0',
                  borderBottom: '1px solid var(--border)',
                  fontSize: 13,
                }}>
                  <span style={{ color: 'var(--cl-blue)', fontWeight: 700, minWidth: 28, fontFamily: 'var(--font-mono)' }}>
                    {slurpNum}
                  </span>
                  <span style={{
                    color: 'var(--t2)',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {cleanTitle}
                  </span>
                  <span style={{ color: 'var(--t3)', fontSize: 12, minWidth: 70, textAlign: 'right' }}>
                    {formatDate(p.end)}
                  </span>
                  <span style={{ color: 'var(--t3)', fontSize: 12, minWidth: 42, textAlign: 'right' }}>
                    {council ? `${p.votes}/${COUNCIL_SIZE}` : `${p.votes}v`}
                  </span>
                  <span style={{ color: 'var(--green)', fontSize: 12, minWidth: 32, textAlign: 'right' }}>
                    {yesPct.toFixed(0)}%
                  </span>
                  <Badge risk={outcome.risk}>{outcome.label}</Badge>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
