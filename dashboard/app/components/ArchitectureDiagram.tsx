'use client';

export default function ArchitectureDiagram() {
  const nodes = [
    { title: 'CRE Runtime', desc: '7 Chainlink workflows' },
    { title: 'EVMClient', desc: 'On-chain data reads' },
    { title: 'AI Analysis', desc: 'Risk assessment engine' },
    { title: 'SentinelRegistry', desc: 'Sepolia proof hashes' },
  ];

  const subNodes = [
    { title: '7 Workflow Snapshots', desc: 'JSON state files' },
    { title: 'Risk Assessment', desc: 'Treasury · Peg · CCIP · Gov' },
    { title: 'This Dashboard', desc: 'Real-time monitoring UI' },
  ];

  return (
    <div className="card card-neon">
      <h2 className="section-title">Architecture</h2>

      {/* Main pipeline */}
      <div className="arch-pipeline" style={{ marginBottom: 24 }}>
        {nodes.map((n, i) => (
          <div key={n.title} style={{ display: 'contents' }}>
            <div className="arch-node">
              <div className="arch-node-title">{n.title}</div>
              <div className="arch-node-desc">{n.desc}</div>
            </div>
            {i < nodes.length - 1 && <span className="arch-arrow">→</span>}
          </div>
        ))}
      </div>

      {/* Sub pipeline */}
      <div className="arch-pipeline">
        {subNodes.map((n, i) => (
          <div key={n.title} style={{ display: 'contents' }}>
            <div className="arch-node" style={{ borderColor: 'var(--cl-blue-dim)' }}>
              <div className="arch-node-title">{n.title}</div>
              <div className="arch-node-desc">{n.desc}</div>
            </div>
            {i < subNodes.length - 1 && <span className="arch-arrow">→</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
