'use client';

import { ExternalLink } from './ui';

const REGISTRY_ADDRESS = '0xAFc081cde50fA2Da7408f4E811Ca9dE128f7B334';
const EXPLORER_BASE = 'https://sepolia.etherscan.io';

const STEPS = [
  {
    num: '1',
    title: 'CRE Workflow Reads On-Chain',
    desc: 'Each workflow reads live Ethereum mainnet data — staking pools, Morpho markets, Curve balances, price feeds — via EVMClient.callContract().',
    color: 'var(--green)',
  },
  {
    num: '2',
    title: 'Snapshot → ABI Encode',
    desc: 'Key metrics (utilization, fill %, imbalance, timestamps) are ABI-encoded using Solidity parameter types — the same encoding used by smart contracts.',
    color: 'var(--cl-blue)',
  },
  {
    num: '3',
    title: 'keccak256 Hash',
    desc: 'The encoded payload is hashed with keccak256 — Ethereum\'s native hash function. This creates a unique, deterministic fingerprint of the exact data observed.',
    color: 'var(--cl-purple)',
  },
  {
    num: '4',
    title: 'On-Chain Proof',
    desc: 'The hash + risk level are written to SentinelRegistry.recordHealth() on Sepolia. Block timestamp provides an unforgeable record of when the assessment was made.',
    color: 'var(--amber)',
  },
];

export default function VerificationGuide() {
  return (
    <div className="card card-neon">
      <h2 className="section-title">What Do These Proofs Prove?</h2>

      <p style={{ color: 'var(--t2)', fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
        Every workflow run creates a verifiable chain from live on-chain data to an immutable Sepolia record.
        Anyone can independently verify that a specific health assessment was made at a specific time.
      </p>

      {/* Step pipeline */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 28 }}>
        {STEPS.map((s) => (
          <div
            key={s.num}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-sm)',
              padding: 18,
              position: 'relative',
            }}
          >
            <div style={{
              position: 'absolute',
              top: -10,
              left: 14,
              background: s.color,
              color: '#000',
              width: 22,
              height: 22,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 700,
              fontFamily: 'var(--mono)',
            }}>
              {s.num}
            </div>
            <div style={{ fontWeight: 600, color: 'var(--t1)', fontSize: 14, marginBottom: 6, marginTop: 4 }}>
              {s.title}
            </div>
            <div style={{ color: 'var(--t3)', fontSize: 13, lineHeight: 1.5 }}>
              {s.desc}
            </div>
          </div>
        ))}
      </div>

      {/* Verification box */}
      <div style={{
        background: 'rgba(34, 197, 94, 0.06)',
        border: '1px solid rgba(34, 197, 94, 0.2)',
        borderRadius: 'var(--r-sm)',
        padding: 20,
        marginBottom: 20,
      }}>
        <div style={{ fontWeight: 600, color: 'var(--green)', fontSize: 14, marginBottom: 8 }}>
          How to verify a record
        </div>
        <div style={{ color: 'var(--t2)', fontSize: 14, lineHeight: 1.7, fontFamily: 'var(--mono)' }}>
          1. Take any snapshot JSON from this dashboard<br />
          2. ABI-encode the key fields (timestamp, workflow, risk, metrics)<br />
          3. Compute keccak256 of the encoded bytes<br />
          4. Compare with the snapshotHash stored on-chain
        </div>
        <div style={{ marginTop: 12 }}>
          <ExternalLink href={`${EXPLORER_BASE}/address/${REGISTRY_ADDRESS}#events`}>
            View all HealthRecorded events on Etherscan
          </ExternalLink>
        </div>
      </div>

      {/* Trust model */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 16,
      }}>
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-sm)',
          padding: 18,
        }}>
          <div style={{ fontWeight: 600, color: 'var(--amber)', fontSize: 14, marginBottom: 8 }}>
            Current: Hackathon Demo
          </div>
          <div style={{ color: 'var(--t3)', fontSize: 13, lineHeight: 1.6 }}>
            CRE workflows run via <span style={{ fontFamily: 'var(--mono)', color: 'var(--t2)' }}>cre simulate</span> on
            a single operator node. The snapshot data is real (live mainnet reads), but a single key signs all proofs.
            Trust assumption: the operator is honest.
          </div>
        </div>
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid rgba(120, 80, 255, 0.2)',
          borderRadius: 'var(--r-sm)',
          padding: 18,
        }}>
          <div style={{ fontWeight: 600, color: 'var(--cl-purple)', fontSize: 14, marginBottom: 8 }}>
            Production: DON Attestation
          </div>
          <div style={{ color: 'var(--t3)', fontSize: 13, lineHeight: 1.6 }}>
            On Chainlink&apos;s Decentralized Oracle Network, multiple independent nodes execute the same workflow
            and reach consensus. The proof hash is attested by the network — no single party can fabricate results.
          </div>
        </div>
      </div>
    </div>
  );
}
