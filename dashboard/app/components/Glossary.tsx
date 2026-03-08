'use client';

import { useState } from 'react';
import { SectionHeader } from './ui';
import { BookOpen, ChevronDown } from 'lucide-react';

type GlossaryEntry = {
  term: string;
  definition: string;
};

type GlossarySection = {
  title: string;
  entries: GlossaryEntry[];
};

const GLOSSARY: GlossarySection[] = [
  {
    title: 'Risk Levels',
    entries: [
      {
        term: 'OK (Green)',
        definition:
          'The monitored metric is within its normal, healthy range. For stLINK price: trading at or above parity with LINK, or within 100 bps of parity. For treasury: pools well-filled and runway stable.',
      },
      {
        term: 'Warning (Amber)',
        definition:
          'The metric has moved outside its normal range and warrants attention, but is not an emergency. For stLINK price: a 100-300 bps discount from parity (notable arb opportunity, possible selling pressure). For Morpho: utilization above 85%.',
      },
      {
        term: 'Critical (Red)',
        definition:
          'The metric has reached an extreme level that may indicate systemic stress. For stLINK price: discount exceeds 300 bps, suggesting sustained depeg pressure beyond normal arb cycles. For Morpho: utilization above 95%, limiting withdrawals.',
      },
      {
        term: 'Stale (Gray)',
        definition:
          'Data is older than 45 minutes. The CRE workflow may not have run recently, or the data source may be temporarily unavailable. The last known values are still displayed.',
      },
    ],
  },
  {
    title: 'Key Metrics',
    entries: [
      {
        term: 'stLINK/LINK Ratio',
        definition:
          'The Curve pool exchange rate between stLINK and LINK. A ratio of 1.0 means parity. stLINK is a yield-bearing token (staked LINK + accrued rewards), so it naturally trades at or above 1.0. A ratio below 1.0 is a "discount" — often a temporary arb opportunity, not necessarily a crisis.',
      },
      {
        term: 'Basis Points (bps)',
        definition:
          'One basis point = 0.01%. Used to express the deviation from parity. Example: 295 bps = 2.95% discount, meaning stLINK trades at 0.9705 LINK. A positive value (e.g., +50 bps) means stLINK is at a premium above 1:1.',
      },
      {
        term: 'Premium vs Discount',
        definition:
          'Premium means stLINK trades above 1:1 with LINK — the normal healthy state reflecting accrued staking rewards. Discount means stLINK trades below 1:1, usually due to temporary selling pressure on the Curve pool. Discounts are also buying opportunities for arbitrageurs.',
      },
      {
        term: 'Community Fill %',
        definition:
          'Percentage of the community staking pool capacity that is currently staked. Higher fill = more LINK staked = stronger protocol participation. At 95%+ the pool is nearly full.',
      },
      {
        term: 'Reward Runway',
        definition:
          'How many days the reward vault can sustain current emission rates before needing a top-up. Measured by dividing vault balance by daily emission. Below 30 days triggers a warning.',
      },
      {
        term: 'Morpho Utilization',
        definition:
          'Percentage of supplied wstLINK in the Morpho lending market that is currently borrowed. High utilization (>85%) means most supplied assets are lent out, which can limit withdrawals.',
      },
    ],
  },
  {
    title: 'Workflow Tags',
    entries: [
      {
        term: 'Treasury',
        definition:
          'Monitors stake.link staking pools (community + operator fill), reward vault runway, Morpho market utilization, and priority pool queue depth. Runs as a CRE workflow reading on-chain state.',
      },
      {
        term: 'Feed (Price Feeds)',
        definition:
          'Monitors the stLINK/LINK exchange rate on Curve, plus LINK/USD and ETH/USD prices via Chainlink Data Feeds. Calculates the peg deviation in basis points.',
      },
      {
        term: 'CCIP (Cross-Chain)',
        definition:
          'Monitors Chainlink CCIP lane health across supported destination chains. Reports how many lanes are operational, paused, or unconfigured.',
      },
      {
        term: 'Governance',
        definition:
          'Tracks active governance proposals from the stake.link DAO. Flags urgent proposals that are close to their voting deadline.',
      },
      {
        term: 'Morpho Vault',
        definition:
          'Monitors the wstLINK Morpho lending market — total supply, utilization rate, and vault TVL in USD.',
      },
      {
        term: 'Curve Pool',
        definition:
          'Monitors the stLINK/LINK Curve liquidity pool — total value locked (TVL), token balance composition, and pool imbalance. A balanced pool (near 50/50 LINK/stLINK) indicates healthy liquidity. Heavy imbalance toward stLINK suggests selling pressure.',
      },
      {
        term: 'Legacy',
        definition:
          'On-chain registry records from earlier iterations that did not include a workflow prefix. Displayed in the proof registry as "legacy" for historical context.',
      },
    ],
  },
  {
    title: 'On-Chain Registry',
    entries: [
      {
        term: 'Snapshot Hash',
        definition:
          'A keccak256 hash of the complete workflow output, written on-chain as an immutable proof of the data at that point in time. Allows anyone to verify that the dashboard data matches what was recorded.',
      },
      {
        term: 'SentinelRegistry Contract',
        definition:
          'A Solidity contract deployed on Sepolia that stores health proofs. Each CRE workflow writes a record with the snapshot hash and risk level (e.g., "treasury:ok"). This creates a tamper-proof audit trail.',
      },
    ],
  },
];

export default function Glossary() {
  const [open, setOpen] = useState(false);

  return (
    <div className="card card-neon">
      <div
        onClick={() => setOpen(!open)}
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <SectionHeader
          title="Glossary"
          right={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <BookOpen size={16} style={{ color: 'var(--cl-blue)' }} />
              <ChevronDown
                size={16}
                style={{
                  color: 'var(--t3)',
                  transition: 'transform 0.2s',
                  transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                }}
              />
            </div>
          }
        />
      </div>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginTop: 8 }}>
          {GLOSSARY.map((section) => (
            <div key={section.title}>
              <div style={{
                fontSize: 14,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.6px',
                color: 'var(--cl-blue)',
                marginBottom: 12,
              }}>
                {section.title}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {section.entries.map((entry) => (
                  <div
                    key={entry.term}
                    style={{
                      padding: '10px 14px',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--r-sm)',
                    }}
                  >
                    <div style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--t1)',
                      marginBottom: 4,
                    }}>
                      {entry.term}
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--t2)', lineHeight: 1.5 }}>
                      {entry.definition}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
