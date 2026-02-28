import { NextResponse } from 'next/server';
import { createDb } from '@/lib/db/client';
import { createQueries } from '@/lib/db/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REGISTRY_ADDRESS = '0xAFc081cde50fA2Da7408f4E811Ca9dE128f7B334';
const EXPLORER_BASE = 'https://sepolia.etherscan.io';

export async function GET() {
  const db = createDb();
  if (!db) {
    return NextResponse.json({ ok: false, error: 'DATABASE_URL not configured' }, { status: 503 });
  }

  const queries = createQueries(db);

  try {
    const [records, stats, latest, workflowStats] = await Promise.all([
      queries.getSentinelRecords(30),
      queries.getSentinelStats(),
      queries.getLatestSentinelRecord(),
      queries.getWorkflowStats(),
    ]);

    return NextResponse.json({
      ok: true,
      registry: {
        address: REGISTRY_ADDRESS,
        network: 'sepolia',
        explorer: `${EXPLORER_BASE}/address/${REGISTRY_ADDRESS}`,
      },
      stats,
      workflowStats,
      latest: latest ? {
        ...latest,
        explorerUrl: `${EXPLORER_BASE}/tx/${latest.txHash}`,
      } : null,
      records: records.map((r) => ({
        ...r,
        explorerUrl: `${EXPLORER_BASE}/tx/${r.txHash}`,
      })),
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }, { status: 500 });
  }
}
