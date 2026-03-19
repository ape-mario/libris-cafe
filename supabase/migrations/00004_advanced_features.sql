-- supabase/migrations/00004_advanced_features.sql

-- Phase 4: Advanced Features — Lending & Prediction

-- ===================================================
-- Step 1: Reading Session table
-- ===================================================

CREATE TABLE reading_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id uuid NOT NULL REFERENCES inventory(id),
  book_id text NOT NULL,
  outlet_id uuid NOT NULL REFERENCES outlet(id),
  staff_id uuid NOT NULL REFERENCES staff(id),

  -- Session lifecycle
  status text NOT NULL CHECK (status IN ('active', 'returned', 'overdue')) DEFAULT 'active',
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  expected_return_at timestamptz,       -- NULL for semi-formal (level B)
  checked_out_at timestamptz,           -- NULL until returned
  checked_out_by uuid REFERENCES staff(id),

  -- Lending level
  level text NOT NULL CHECK (level IN ('semi_formal', 'formal')) DEFAULT 'semi_formal',

  -- Formal lending fields (level C)
  customer_name text,
  customer_contact text,
  deposit_amount decimal(12,2) DEFAULT 0,
  deposit_status text CHECK (deposit_status IN ('held', 'refunded', 'forfeited')),
  deposit_refunded_at timestamptz,

  -- Metadata
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_reading_session_outlet ON reading_session(outlet_id);
CREATE INDEX idx_reading_session_status ON reading_session(status);
CREATE INDEX idx_reading_session_inventory ON reading_session(inventory_id);
CREATE INDEX idx_reading_session_active ON reading_session(outlet_id, status) WHERE status = 'active';

-- ===================================================
-- Step 2: Overdue detection & timestamp trigger
-- ===================================================

-- Auto-mark sessions as overdue when expected_return_at has passed
-- This runs via a pg_cron job or can be called manually via RPC
CREATE OR REPLACE FUNCTION mark_overdue_sessions()
RETURNS integer AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE reading_session
  SET status = 'overdue',
      updated_at = now()
  WHERE status = 'active'
    AND expected_return_at IS NOT NULL
    AND expected_return_at < now();

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Auto-update updated_at on reading_session changes
CREATE OR REPLACE FUNCTION update_reading_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reading_session_timestamp
  BEFORE UPDATE ON reading_session
  FOR EACH ROW EXECUTE FUNCTION update_reading_session_timestamp();

-- ===================================================
-- Step 3: Materialized view for sales velocity (prediction engine)
-- ===================================================

CREATE MATERIALIZED VIEW mv_sales_velocity AS
SELECT
  i.id AS inventory_id,
  i.book_id,
  i.outlet_id,
  i.stock AS current_stock,
  i.min_stock,
  COALESCE(
    SUM(CASE
      WHEN sm.type = 'sale_out' AND sm.created_at >= now() - interval '30 days'
      THEN ABS(sm.quantity)
      ELSE 0
    END), 0
  ) AS units_sold_30d,
  COALESCE(
    SUM(CASE
      WHEN sm.type = 'sale_out' AND sm.created_at >= now() - interval '7 days'
      THEN ABS(sm.quantity)
      ELSE 0
    END), 0
  ) AS units_sold_7d,
  CASE
    WHEN SUM(CASE
      WHEN sm.type = 'sale_out' AND sm.created_at >= now() - interval '30 days'
      THEN ABS(sm.quantity) ELSE 0
    END) > 0
    THEN ROUND(
      i.stock::decimal / (
        SUM(CASE
          WHEN sm.type = 'sale_out' AND sm.created_at >= now() - interval '30 days'
          THEN ABS(sm.quantity) ELSE 0
        END)::decimal / 30.0
      ), 1
    )
    ELSE NULL  -- No sales → cannot predict
  END AS days_until_stockout,
  ROUND(
    COALESCE(
      SUM(CASE
        WHEN sm.type = 'sale_out' AND sm.created_at >= now() - interval '30 days'
        THEN ABS(sm.quantity) ELSE 0
      END)::decimal / 30.0
    , 0), 2
  ) AS avg_daily_sales
FROM inventory i
LEFT JOIN stock_movement sm ON sm.inventory_id = i.id
GROUP BY i.id, i.book_id, i.outlet_id, i.stock, i.min_stock;

CREATE UNIQUE INDEX idx_mv_sales_velocity_inventory ON mv_sales_velocity(inventory_id);

-- RPC to refresh the materialized view (called by cron or on-demand)
CREATE OR REPLACE FUNCTION refresh_sales_velocity()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_sales_velocity;
END;
$$ LANGUAGE plpgsql;

-- ===================================================
-- Step 4: RPC function for restock recommendations
-- ===================================================

CREATE OR REPLACE FUNCTION get_restock_recommendations(
  p_outlet_id uuid,
  p_lead_time_days integer DEFAULT 7
)
RETURNS TABLE (
  inventory_id uuid,
  book_id text,
  current_stock integer,
  min_stock integer,
  avg_daily_sales decimal,
  days_until_stockout decimal,
  units_sold_30d bigint,
  units_sold_7d bigint,
  suggested_quantity integer,
  urgency text,
  restock_score decimal
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sv.inventory_id,
    sv.book_id,
    sv.current_stock::integer,
    sv.min_stock::integer,
    sv.avg_daily_sales,
    sv.days_until_stockout,
    sv.units_sold_30d,
    sv.units_sold_7d,
    -- Suggested quantity: enough for lead_time + 14-day buffer
    CASE
      WHEN sv.avg_daily_sales > 0
      THEN CEIL(sv.avg_daily_sales * (p_lead_time_days + 14))::integer
      ELSE sv.min_stock::integer
    END AS suggested_quantity,
    -- Urgency classification
    CASE
      WHEN sv.current_stock <= 0 THEN 'critical'
      WHEN sv.days_until_stockout IS NOT NULL AND sv.days_until_stockout <= p_lead_time_days THEN 'urgent'
      WHEN sv.days_until_stockout IS NOT NULL AND sv.days_until_stockout <= p_lead_time_days * 2 THEN 'warning'
      WHEN sv.current_stock <= sv.min_stock THEN 'low'
      ELSE 'ok'
    END AS urgency,
    -- Restock score (higher = more urgent, 0-100 scale)
    CASE
      WHEN sv.current_stock <= 0 THEN 100.0
      WHEN sv.days_until_stockout IS NULL THEN
        CASE WHEN sv.current_stock <= sv.min_stock THEN 40.0 ELSE 0.0 END
      ELSE GREATEST(0, LEAST(100,
        ROUND((1.0 - (sv.days_until_stockout / GREATEST(p_lead_time_days * 3.0, 1))) * 100, 1)
      ))
    END AS restock_score
  FROM mv_sales_velocity sv
  WHERE sv.outlet_id = p_outlet_id
    AND (
      sv.current_stock <= sv.min_stock
      OR (sv.days_until_stockout IS NOT NULL AND sv.days_until_stockout <= p_lead_time_days * 2)
      OR sv.current_stock <= 0
    )
  ORDER BY restock_score DESC;
END;
$$ LANGUAGE plpgsql;

-- ===================================================
-- Step 5: RLS policies for reading_session
-- ===================================================

ALTER TABLE reading_session ENABLE ROW LEVEL SECURITY;

-- Staff can view sessions for their outlet
CREATE POLICY "Staff can view outlet sessions"
  ON reading_session FOR SELECT
  USING (
    outlet_id IN (
      SELECT s.outlet_id FROM staff s
      WHERE s.id = auth.uid() AND s.is_active = true
    )
  );

-- Staff can insert sessions for their outlet
CREATE POLICY "Staff can create sessions"
  ON reading_session FOR INSERT
  WITH CHECK (
    outlet_id IN (
      SELECT s.outlet_id FROM staff s
      WHERE s.id = auth.uid() AND s.is_active = true
    )
  );

-- Staff can update sessions for their outlet
CREATE POLICY "Staff can update sessions"
  ON reading_session FOR UPDATE
  USING (
    outlet_id IN (
      SELECT s.outlet_id FROM staff s
      WHERE s.id = auth.uid() AND s.is_active = true
    )
  );

-- Only owner can delete sessions
CREATE POLICY "Owner can delete sessions"
  ON reading_session FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM staff s
      WHERE s.id = auth.uid() AND s.role = 'owner' AND s.is_active = true
    )
  );
