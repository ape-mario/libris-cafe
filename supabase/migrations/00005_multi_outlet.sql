-- Phase 5: Multi-outlet support
-- Adds inter-outlet transfer table, consolidated reporting RPCs, and updated RLS

-- ============================================================
-- OUTLET TRANSFER TABLE
-- ============================================================

CREATE TABLE outlet_transfer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_outlet_id uuid NOT NULL REFERENCES outlet(id),
  to_outlet_id uuid NOT NULL REFERENCES outlet(id),
  status text NOT NULL CHECK (status IN (
    'requested', 'approved', 'shipped', 'received', 'cancelled'
  )) DEFAULT 'requested',
  requested_by uuid NOT NULL REFERENCES staff(id),
  approved_by uuid REFERENCES staff(id),
  shipped_by uuid REFERENCES staff(id),
  received_by uuid REFERENCES staff(id),
  notes text,
  requested_at timestamptz DEFAULT now(),
  approved_at timestamptz,
  shipped_at timestamptz,
  received_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT different_outlets CHECK (from_outlet_id != to_outlet_id)
);

CREATE INDEX idx_transfer_from_outlet ON outlet_transfer(from_outlet_id);
CREATE INDEX idx_transfer_to_outlet ON outlet_transfer(to_outlet_id);
CREATE INDEX idx_transfer_status ON outlet_transfer(status);

-- Transfer items (which books and quantities)
CREATE TABLE outlet_transfer_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES outlet_transfer(id) ON DELETE CASCADE,
  inventory_id uuid NOT NULL REFERENCES inventory(id),
  book_id text NOT NULL,
  title text NOT NULL,
  quantity_requested integer NOT NULL CHECK (quantity_requested > 0),
  quantity_shipped integer DEFAULT 0,
  quantity_received integer DEFAULT 0
);

CREATE INDEX idx_transfer_item_transfer ON outlet_transfer_item(transfer_id);

-- ============================================================
-- ADD 'transfer_out' AND 'transfer_in' TO stock_movement.type
-- ============================================================

ALTER TABLE stock_movement
  DROP CONSTRAINT IF EXISTS stock_movement_type_check;

ALTER TABLE stock_movement
  ADD CONSTRAINT stock_movement_type_check
  CHECK (type IN (
    'purchase_in', 'sale_out', 'return_in', 'return_out',
    'adjustment', 'void_restore', 'consignment_in',
    'consignment_return', 'buyback_in',
    'transfer_out', 'transfer_in'
  ));

-- ============================================================
-- RLS FOR OUTLET_TRANSFER
-- ============================================================

ALTER TABLE outlet_transfer ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlet_transfer_item ENABLE ROW LEVEL SECURITY;

-- Owner can see all transfers across all outlets
CREATE POLICY "Owner can manage all transfers" ON outlet_transfer
  FOR ALL USING (
    EXISTS (SELECT 1 FROM staff WHERE id = auth.uid() AND role = 'owner')
  );

-- Staff can see transfers involving their outlet
CREATE POLICY "Staff can view own outlet transfers" ON outlet_transfer
  FOR SELECT USING (
    from_outlet_id IN (SELECT outlet_id FROM staff WHERE id = auth.uid())
    OR to_outlet_id IN (SELECT outlet_id FROM staff WHERE id = auth.uid())
  );

-- Staff can request transfers from their outlet
CREATE POLICY "Staff can request transfers from own outlet" ON outlet_transfer
  FOR INSERT WITH CHECK (
    from_outlet_id IN (SELECT outlet_id FROM staff WHERE id = auth.uid())
    AND requested_by = auth.uid()
  );

-- Transfer items: same visibility as parent transfer
CREATE POLICY "Owner can manage all transfer items" ON outlet_transfer_item
  FOR ALL USING (
    EXISTS (SELECT 1 FROM staff WHERE id = auth.uid() AND role = 'owner')
  );

CREATE POLICY "Staff can view own outlet transfer items" ON outlet_transfer_item
  FOR SELECT USING (
    transfer_id IN (
      SELECT ot.id FROM outlet_transfer ot
      JOIN staff s ON (s.outlet_id = ot.from_outlet_id OR s.outlet_id = ot.to_outlet_id)
      WHERE s.id = auth.uid()
    )
  );

-- ============================================================
-- UPDATE OUTLET RLS — Owner can see ALL outlets
-- ============================================================

-- Drop existing policy (Phase 1 only allowed staff to see own outlet)
DROP POLICY IF EXISTS "Staff can read own outlet" ON outlet;

-- Owner can read/manage all outlets
CREATE POLICY "Owner can manage all outlets" ON outlet
  FOR ALL USING (
    EXISTS (SELECT 1 FROM staff WHERE id = auth.uid() AND role = 'owner')
  );

-- Staff can read their own outlet only
CREATE POLICY "Staff can read own outlet" ON outlet
  FOR SELECT USING (
    id IN (SELECT outlet_id FROM staff WHERE id = auth.uid())
  );

-- Owner can manage staff across all outlets
DROP POLICY IF EXISTS "Staff can read own outlet staff" ON staff;

CREATE POLICY "Owner can manage all staff" ON staff
  FOR ALL USING (
    EXISTS (SELECT 1 FROM staff WHERE id = auth.uid() AND role = 'owner')
  );

CREATE POLICY "Staff can read own outlet staff" ON staff
  FOR SELECT USING (
    outlet_id IN (SELECT outlet_id FROM staff WHERE id = auth.uid())
  );

-- ============================================================
-- OWNER CROSS-OUTLET INVENTORY ACCESS
-- ============================================================

-- Owner can read inventory across all outlets
DROP POLICY IF EXISTS "Staff can manage own outlet inventory" ON inventory;

CREATE POLICY "Owner can manage all outlet inventory" ON inventory
  FOR ALL USING (
    EXISTS (SELECT 1 FROM staff WHERE id = auth.uid() AND role = 'owner')
  );

CREATE POLICY "Staff can manage own outlet inventory" ON inventory
  FOR ALL USING (
    outlet_id IN (SELECT outlet_id FROM staff WHERE id = auth.uid())
  );

-- ============================================================
-- RPC: CONSOLIDATED SALES REPORT
-- ============================================================

CREATE OR REPLACE FUNCTION rpc_consolidated_sales(
  p_date_from date,
  p_date_to date,
  p_outlet_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  outlet_id uuid,
  outlet_name text,
  total_sales numeric,
  total_transactions bigint,
  total_items_sold bigint,
  avg_transaction_value numeric,
  total_tax numeric,
  total_discount numeric,
  net_revenue numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify caller is owner
  IF NOT EXISTS (SELECT 1 FROM staff WHERE id = auth.uid() AND role = 'owner') THEN
    RAISE EXCEPTION 'Access denied: owner role required';
  END IF;

  RETURN QUERY
  SELECT
    o.id AS outlet_id,
    o.name AS outlet_name,
    COALESCE(SUM(t.total), 0)::numeric AS total_sales,
    COUNT(t.id)::bigint AS total_transactions,
    COALESCE(SUM(ti.total_items), 0)::bigint AS total_items_sold,
    CASE WHEN COUNT(t.id) > 0
      THEN (SUM(t.total) / COUNT(t.id))::numeric
      ELSE 0
    END AS avg_transaction_value,
    COALESCE(SUM(t.tax), 0)::numeric AS total_tax,
    COALESCE(SUM(t.discount), 0)::numeric AS total_discount,
    COALESCE(SUM(t.total - t.tax), 0)::numeric AS net_revenue
  FROM outlet o
  LEFT JOIN "transaction" t ON t.outlet_id = o.id
    AND t.created_at >= p_date_from::timestamptz
    AND t.created_at < (p_date_to + 1)::timestamptz
    AND t.payment_status = 'paid'
    AND t.type = 'sale'
  LEFT JOIN LATERAL (
    SELECT SUM(ti2.quantity) AS total_items
    FROM transaction_item ti2
    WHERE ti2.transaction_id = t.id
  ) ti ON true
  WHERE (p_outlet_ids IS NULL OR o.id = ANY(p_outlet_ids))
  GROUP BY o.id, o.name
  ORDER BY total_sales DESC;
END;
$$;

-- ============================================================
-- RPC: CONSOLIDATED INVENTORY REPORT
-- ============================================================

CREATE OR REPLACE FUNCTION rpc_consolidated_inventory(
  p_outlet_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  outlet_id uuid,
  outlet_name text,
  total_skus bigint,
  total_stock bigint,
  total_stock_value numeric,
  low_stock_count bigint,
  out_of_stock_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify caller is owner
  IF NOT EXISTS (SELECT 1 FROM staff WHERE id = auth.uid() AND role = 'owner') THEN
    RAISE EXCEPTION 'Access denied: owner role required';
  END IF;

  RETURN QUERY
  SELECT
    o.id AS outlet_id,
    o.name AS outlet_name,
    COUNT(i.id)::bigint AS total_skus,
    COALESCE(SUM(i.stock), 0)::bigint AS total_stock,
    COALESCE(SUM(i.cost_price * i.stock), 0)::numeric AS total_stock_value,
    COUNT(CASE WHEN i.stock > 0 AND i.stock <= i.min_stock THEN 1 END)::bigint AS low_stock_count,
    COUNT(CASE WHEN i.stock <= 0 THEN 1 END)::bigint AS out_of_stock_count
  FROM outlet o
  LEFT JOIN inventory i ON i.outlet_id = o.id
  WHERE (p_outlet_ids IS NULL OR o.id = ANY(p_outlet_ids))
  GROUP BY o.id, o.name
  ORDER BY o.name;
END;
$$;

-- ============================================================
-- RPC: DAILY SALES TREND (CROSS-OUTLET)
-- ============================================================

CREATE OR REPLACE FUNCTION rpc_consolidated_daily_trend(
  p_date_from date,
  p_date_to date,
  p_outlet_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  sale_date date,
  outlet_id uuid,
  outlet_name text,
  daily_total numeric,
  daily_transactions bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM staff WHERE id = auth.uid() AND role = 'owner') THEN
    RAISE EXCEPTION 'Access denied: owner role required';
  END IF;

  RETURN QUERY
  SELECT
    d.dt::date AS sale_date,
    o.id AS outlet_id,
    o.name AS outlet_name,
    COALESCE(SUM(t.total), 0)::numeric AS daily_total,
    COUNT(t.id)::bigint AS daily_transactions
  FROM generate_series(p_date_from::timestamptz, p_date_to::timestamptz, '1 day') d(dt)
  CROSS JOIN outlet o
  LEFT JOIN "transaction" t ON t.outlet_id = o.id
    AND t.created_at >= d.dt
    AND t.created_at < d.dt + interval '1 day'
    AND t.payment_status = 'paid'
    AND t.type = 'sale'
  WHERE (p_outlet_ids IS NULL OR o.id = ANY(p_outlet_ids))
  GROUP BY d.dt, o.id, o.name
  ORDER BY d.dt, o.name;
END;
$$;

-- ============================================================
-- RPC: TOP BOOKS ACROSS OUTLETS
-- ============================================================

CREATE OR REPLACE FUNCTION rpc_consolidated_top_books(
  p_date_from date,
  p_date_to date,
  p_limit integer DEFAULT 10,
  p_outlet_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  book_id text,
  title text,
  total_quantity bigint,
  total_revenue numeric,
  outlet_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM staff WHERE id = auth.uid() AND role = 'owner') THEN
    RAISE EXCEPTION 'Access denied: owner role required';
  END IF;

  RETURN QUERY
  SELECT
    ti.book_id,
    ti.title,
    SUM(ti.quantity)::bigint AS total_quantity,
    SUM(ti.total)::numeric AS total_revenue,
    COUNT(DISTINCT t.outlet_id)::bigint AS outlet_count
  FROM transaction_item ti
  JOIN "transaction" t ON t.id = ti.transaction_id
    AND t.payment_status = 'paid'
    AND t.type = 'sale'
    AND t.created_at >= p_date_from::timestamptz
    AND t.created_at < (p_date_to + 1)::timestamptz
  WHERE (p_outlet_ids IS NULL OR t.outlet_id = ANY(p_outlet_ids))
  GROUP BY ti.book_id, ti.title
  ORDER BY total_quantity DESC
  LIMIT p_limit;
END;
$$;

-- ============================================================
-- TRIGGER: UPDATE outlet_transfer.updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_transfer_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transfer_updated_at
  BEFORE UPDATE ON outlet_transfer
  FOR EACH ROW EXECUTE FUNCTION update_transfer_updated_at();
