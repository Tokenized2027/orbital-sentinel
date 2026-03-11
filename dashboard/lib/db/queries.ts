import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

type RawRecord = {
  protocol_id: string;
  snapshot_hash: string;
  risk_level: string;
  block_timestamp: string;
  block_number: number;
  tx_hash: string;
  recorder: string;
};

function mapRecord(r: RawRecord) {
  return {
    protocolId: r.protocol_id,
    snapshotHash: r.snapshot_hash,
    riskLevel: r.risk_level,
    blockTimestamp: r.block_timestamp,
    blockNumber: r.block_number,
    txHash: r.tx_hash,
    recorder: r.recorder,
  };
}

export function createQueries(db: NodePgDatabase) {
  return {
    async getSentinelRecords(limit = 30) {
      const rows = await db.execute(sql`
        SELECT protocol_id, snapshot_hash, risk_level, block_timestamp, block_number, tx_hash, recorder
        FROM sentinel_records
        ORDER BY block_timestamp DESC
        LIMIT ${limit}
      `);
      return (rows.rows as RawRecord[]).map(mapRecord);
    },

    async getSentinelStats() {
      const rows = await db.execute(sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE risk_level LIKE '%:ok')::int AS ok,
          COUNT(*) FILTER (WHERE risk_level LIKE '%:warning')::int AS warning,
          COUNT(*) FILTER (WHERE risk_level LIKE '%:critical')::int AS critical
        FROM sentinel_records
      `);
      return (rows.rows[0] as { total: number; ok: number; warning: number; critical: number }) ?? { total: 0, ok: 0, warning: 0, critical: 0 };
    },

    async getLatestSentinelRecord() {
      const rows = await db.execute(sql`
        SELECT protocol_id, snapshot_hash, risk_level, block_timestamp, block_number, tx_hash, recorder
        FROM sentinel_records
        ORDER BY block_timestamp DESC
        LIMIT 1
      `);
      const r = rows.rows[0] as RawRecord | undefined;
      return r ? mapRecord(r) : null;
    },

    async getWorkflowStats() {
      const rows = await db.execute(sql`
        SELECT
          SPLIT_PART(risk_level, ':', 1) AS workflow,
          COUNT(*)::int AS count
        FROM sentinel_records
        WHERE risk_level LIKE '%:%'
        GROUP BY workflow
        ORDER BY count DESC
      `);
      const result: Record<string, number> = {};
      for (const row of rows.rows as Array<{ workflow: string; count: number }>) {
        result[row.workflow] = row.count;
      }
      return result;
    },
  };
}
