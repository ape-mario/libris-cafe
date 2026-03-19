-- Performance indexes and constraint fixes

-- Composite index for the dominant report query pattern
CREATE INDEX IF NOT EXISTS idx_transaction_outlet_status_created
  ON "transaction"(outlet_id, payment_status, created_at DESC);

-- Index for transaction_item JOIN on inventory_id (used in all margin calculations)
CREATE INDEX IF NOT EXISTS idx_transaction_item_inventory
  ON transaction_item(inventory_id);

-- Composite index for stock_movement velocity queries
CREATE INDEX IF NOT EXISTS idx_stock_movement_inventory_created
  ON stock_movement(inventory_id, created_at DESC);

-- NOT NULL constraints on critical FK columns
ALTER TABLE "transaction" ALTER COLUMN outlet_id SET NOT NULL;
ALTER TABLE "transaction" ALTER COLUMN staff_id SET NOT NULL;
ALTER TABLE inventory ALTER COLUMN outlet_id SET NOT NULL;
