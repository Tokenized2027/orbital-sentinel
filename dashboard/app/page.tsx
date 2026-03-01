'use client';

import { useState, useEffect, useCallback } from 'react';
import Hero from './components/Hero';
import WorkflowGrid from './components/WorkflowGrid';
import TreasuryDetail from './components/TreasuryDetail';
import PegMonitor from './components/PegMonitor';
import CcipLanes from './components/CcipLanes';
import GovernancePanel from './components/GovernancePanel';
import CurvePoolDetail from './components/CurvePoolDetail';
import GenericDetail from './components/GenericDetail';
import SentinelRegistry from './components/SentinelRegistry';
import Glossary from './components/Glossary';
import ArchitectureDiagram from './components/ArchitectureDiagram';
import VerificationGuide from './components/VerificationGuide';

type CREData = {
  ok: boolean;
  overallStatus: string;
  healthyCount: number;
  totalCount: number;
  totalAlerts: number;
  workflows: Record<string, {
    status: string;
    risk: string;
    generatedAt: string | null;
    ageMinutes: number | null;
    stale: boolean;
    data: Record<string, unknown>;
    alerts: string[];
  }>;
  labels: Record<string, string>;
};

function WorkflowDetail({ workflowKey, workflow, label }: {
  workflowKey: string;
  workflow: { status: string; risk: string; data: Record<string, unknown>; alerts: string[] };
  label: string;
}) {
  switch (workflowKey) {
    case 'treasury':
      return <TreasuryDetail workflow={workflow} />;
    case 'feed':
      return <PegMonitor workflow={workflow} />;
    case 'ccip':
      return <CcipLanes workflow={workflow} />;
    case 'governance':
      return <GovernancePanel workflow={workflow} />;
    case 'curvePool':
      return <CurvePoolDetail workflow={workflow} />;
    default:
      return <GenericDetail workflow={workflow} label={label} />;
  }
}

export default function Page() {
  const [data, setData] = useState<CREData | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/cre-signals')
      .then(r => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 60_000);
    return () => clearInterval(iv);
  }, [load]);

  const loading = !data;
  const overallStatus = data?.overallStatus ?? 'unknown';
  const healthyCount = data?.healthyCount ?? 0;
  const totalCount = data?.totalCount ?? 7;
  const totalAlerts = data?.totalAlerts ?? 0;
  const workflows = data?.workflows ?? {};
  const labels = data?.labels ?? {};

  return (
    <main className="page-wrap">
      <Hero
        overallStatus={overallStatus}
        healthyCount={healthyCount}
        totalCount={totalCount}
        totalAlerts={totalAlerts}
        loading={loading}
      />

      <WorkflowGrid
        workflows={workflows}
        labels={labels}
        selected={selected}
        onSelect={setSelected}
      />

      {/* Expanded detail panel for selected workflow */}
      {selected && workflows[selected] && (
        <WorkflowDetail
          workflowKey={selected}
          workflow={workflows[selected]}
          label={labels[selected] ?? selected}
        />
      )}

      <Glossary />

      <SentinelRegistry />

      <VerificationGuide />

      <ArchitectureDiagram />

      <footer className="footer">
        Built for Chainlink Convergence Hackathon 2026 · <a href="https://github.com/Tokenized2027/orbital-sentinel">Orbital</a> · MIT
      </footer>
    </main>
  );
}
