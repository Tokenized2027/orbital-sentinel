ALTER TABLE sentinel_records
  ADD COLUMN IF NOT EXISTS registry_address varchar(42);

CREATE INDEX IF NOT EXISTS idx_sentinel_registry_time
  ON sentinel_records (registry_address, block_timestamp DESC);

UPDATE sentinel_records
SET registry_address = '0x5D15952f672fCAaf2492591668A869E26B815aE3'
WHERE registry_address IS NULL
  AND block_number < 10429603;

UPDATE sentinel_records
SET registry_address = '0x35EFB15A46Fa63262dA1c4D8DE02502Dd8b6E3a5'
WHERE registry_address IS NULL
  AND block_number BETWEEN 10429629 AND 10429636;
