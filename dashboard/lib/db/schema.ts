import {
  pgTable,
  serial,
  varchar,
  bigint,
  timestamp,
  index,
  unique,
} from 'drizzle-orm/pg-core';

export const sentinelRecords = pgTable('sentinel_records', {
  id: serial('id').primaryKey(),
  protocolId: varchar('protocol_id', { length: 50 }).notNull().default('stake.link'),
  snapshotHash: varchar('snapshot_hash', { length: 66 }).notNull(),
  riskLevel: varchar('risk_level', { length: 20 }).notNull(),
  blockTimestamp: timestamp('block_timestamp', { withTimezone: true }).notNull(),
  blockNumber: bigint('block_number', { mode: 'number' }).notNull(),
  txHash: varchar('tx_hash', { length: 66 }).notNull(),
  recorder: varchar('recorder', { length: 42 }).notNull(),
  collectedAt: timestamp('collected_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('uq_sentinel_tx').on(table.txHash),
  index('idx_sentinel_time').on(table.blockTimestamp),
  index('idx_sentinel_protocol').on(table.protocolId),
]);
