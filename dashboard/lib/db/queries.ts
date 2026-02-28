import { desc, eq, sql } from 'drizzle-orm';
import type { Database } from './client';
import { sentinelRecords } from './schema';

export function createQueries(db: Database) {
  return {
    async getSentinelRecords(limit: number = 50, protocolId: string = 'stake.link') {
      return db
        .select()
        .from(sentinelRecords)
        .where(eq(sentinelRecords.protocolId, protocolId))
        .orderBy(desc(sentinelRecords.blockTimestamp))
        .limit(limit);
    },

    async getLatestSentinelRecord(protocolId: string = 'stake.link') {
      const [row] = await db
        .select()
        .from(sentinelRecords)
        .where(eq(sentinelRecords.protocolId, protocolId))
        .orderBy(desc(sentinelRecords.blockTimestamp))
        .limit(1);
      return row ?? null;
    },

    async getSentinelStats(protocolId: string = 'stake.link') {
      const [result] = await db
        .select({
          total: sql<number>`count(*)`,
          okCount: sql<number>`count(*) FILTER (WHERE risk_level LIKE '%:ok' OR risk_level = 'ok')`,
          warningCount: sql<number>`count(*) FILTER (WHERE risk_level LIKE '%:warning' OR risk_level = 'warning')`,
          criticalCount: sql<number>`count(*) FILTER (WHERE risk_level LIKE '%:critical' OR risk_level = 'critical')`,
          latestBlock: sql<number>`max(block_number)`,
        })
        .from(sentinelRecords)
        .where(eq(sentinelRecords.protocolId, protocolId));
      return {
        total: Number(result?.total) || 0,
        ok: Number(result?.okCount) || 0,
        warning: Number(result?.warningCount) || 0,
        critical: Number(result?.criticalCount) || 0,
        latestBlock: Number(result?.latestBlock) || 0,
      };
    },

    async getWorkflowStats(protocolId: string = 'stake.link') {
      const rows = await db
        .select({
          workflow: sql<string>`CASE WHEN risk_level LIKE '%:%' THEN split_part(risk_level, ':', 1) ELSE 'legacy' END`,
          count: sql<number>`count(*)`,
        })
        .from(sentinelRecords)
        .where(eq(sentinelRecords.protocolId, protocolId))
        .groupBy(sql`CASE WHEN risk_level LIKE '%:%' THEN split_part(risk_level, ':', 1) ELSE 'legacy' END`);
      const stats: Record<string, number> = {};
      for (const row of rows) {
        stats[row.workflow] = Number(row.count);
      }
      return stats;
    },
  };
}
