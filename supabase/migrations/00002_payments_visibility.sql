-- Phase 2: Payments, Receipts, Dashboard

-- ============================================================
-- PAYMENT TABLE (Midtrans)
-- ============================================================
CREATE TABLE payment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES "transaction"(id),
  midtrans_order_id text NOT NULL UNIQUE,
  midtrans_transaction_id text,
  payment_type text,
  gross_amount decimal(12,2) NOT NULL,
  status text NOT NULL CHECK (status IN (
    'pending', 'capture', 'settlement', 'deny',
    'cancel', 'expire', 'refund'
  )) DEFAULT 'pending',
  snap_token text,
  snap_redirect_url text,
  raw_response jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_payment_transaction ON payment(transaction_id);
CREATE INDEX idx_payment_midtrans_order ON payment(midtrans_order_id);
CREATE INDEX idx_payment_status ON payment(status);

-- ============================================================
-- ADD MIDTRANS FIELDS TO TRANSACTION TABLE
-- ============================================================
ALTER TABLE "transaction"
  ADD COLUMN IF NOT EXISTS midtrans_order_id text,
  ADD COLUMN IF NOT EXISTS midtrans_transaction_id text;

-- ============================================================
-- RECEIPT TABLE
-- ============================================================
CREATE TABLE receipt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES "transaction"(id),
  type text NOT NULL CHECK (type IN ('whatsapp', 'email')),
  recipient text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'sent', 'failed')) DEFAULT 'queued',
  error_message text,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_receipt_transaction ON receipt(transaction_id);
CREATE INDEX idx_receipt_status ON receipt(status);

-- ============================================================
-- RLS FOR NEW TABLES
-- ============================================================
ALTER TABLE payment ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read payments for own outlet transactions" ON payment
  FOR SELECT USING (
    transaction_id IN (
      SELECT t.id FROM "transaction" t
      JOIN staff s ON s.outlet_id = t.outlet_id
      WHERE s.id = auth.uid()
    )
  );

CREATE POLICY "Staff can insert payments" ON payment
  FOR INSERT WITH CHECK (
    transaction_id IN (
      SELECT t.id FROM "transaction" t
      JOIN staff s ON s.outlet_id = t.outlet_id
      WHERE s.id = auth.uid()
    )
  );

CREATE POLICY "Staff can update payments" ON payment
  FOR UPDATE USING (
    transaction_id IN (
      SELECT t.id FROM "transaction" t
      JOIN staff s ON s.outlet_id = t.outlet_id
      WHERE s.id = auth.uid()
    )
  );

CREATE POLICY "Staff can manage receipts for own outlet" ON receipt
  FOR ALL USING (
    transaction_id IN (
      SELECT t.id FROM "transaction" t
      JOIN staff s ON s.outlet_id = t.outlet_id
      WHERE s.id = auth.uid()
    )
  );

-- ============================================================
-- MATERIALIZED VIEW: DAILY SALES SUMMARY
-- ============================================================
CREATE MATERIALIZED VIEW mv_daily_sales AS
SELECT
  t.outlet_id,
  DATE(t.created_at AT TIME ZONE 'Asia/Jakarta') AS sale_date,
  COUNT(*) AS transaction_count,
  SUM(t.total) AS total_sales,
  SUM(t.subtotal - COALESCE(
    (SELECT SUM(ti.quantity * i.cost_price)
     FROM transaction_item ti
     JOIN inventory i ON i.id = ti.inventory_id
     WHERE ti.transaction_id = t.id),
    0
  )) AS total_margin,
  SUM(t.tax) AS total_tax,
  t.payment_method
FROM "transaction" t
WHERE t.type = 'sale'
  AND t.payment_status IN ('paid', 'settlement')
GROUP BY t.outlet_id, sale_date, t.payment_method;

CREATE UNIQUE INDEX idx_mv_daily_sales
  ON mv_daily_sales(outlet_id, sale_date, payment_method);

-- ============================================================
-- MATERIALIZED VIEW: TOP SELLING BOOKS
-- ============================================================
CREATE MATERIALIZED VIEW mv_top_books AS
SELECT
  t.outlet_id,
  ti.book_id,
  ti.title,
  SUM(ti.quantity) AS total_sold,
  SUM(ti.total) AS total_revenue,
  DATE(MIN(t.created_at) AT TIME ZONE 'Asia/Jakarta') AS first_sale,
  DATE(MAX(t.created_at) AT TIME ZONE 'Asia/Jakarta') AS last_sale
FROM transaction_item ti
JOIN "transaction" t ON t.id = ti.transaction_id
WHERE t.type = 'sale'
  AND t.payment_status IN ('paid', 'settlement')
GROUP BY t.outlet_id, ti.book_id, ti.title;

CREATE UNIQUE INDEX idx_mv_top_books
  ON mv_top_books(outlet_id, book_id);

-- ============================================================
-- RPC: TODAY'S DASHBOARD METRICS
-- ============================================================
CREATE OR REPLACE FUNCTION get_today_metrics(p_outlet_id uuid)
RETURNS json AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'total_sales', COALESCE(SUM(t.total), 0),
    'transaction_count', COUNT(*),
    'total_margin', COALESCE(SUM(t.subtotal), 0) - COALESCE(
      (SELECT SUM(ti.quantity * i.cost_price)
       FROM transaction_item ti
       JOIN inventory i ON i.id = ti.inventory_id
       JOIN "transaction" tx ON tx.id = ti.transaction_id
       WHERE tx.outlet_id = p_outlet_id
         AND tx.type = 'sale'
         AND tx.payment_status IN ('paid', 'settlement')
         AND DATE(tx.created_at AT TIME ZONE 'Asia/Jakarta') = CURRENT_DATE),
      0
    ),
    'low_stock_count', (
      SELECT COUNT(*) FROM inventory
      WHERE outlet_id = p_outlet_id
        AND stock > 0 AND stock <= min_stock
    ),
    'out_of_stock_count', (
      SELECT COUNT(*) FROM inventory
      WHERE outlet_id = p_outlet_id AND stock <= 0
    ),
    'payment_breakdown', (
      SELECT json_agg(json_build_object(
        'method', payment_method,
        'total', method_total,
        'count', method_count
      ))
      FROM (
        SELECT payment_method,
               SUM(total) AS method_total,
               COUNT(*) AS method_count
        FROM "transaction"
        WHERE outlet_id = p_outlet_id
          AND type = 'sale'
          AND payment_status IN ('paid', 'settlement')
          AND DATE(created_at AT TIME ZONE 'Asia/Jakarta') = CURRENT_DATE
        GROUP BY payment_method
      ) sub
    )
  ) INTO result
  FROM "transaction" t
  WHERE t.outlet_id = p_outlet_id
    AND t.type = 'sale'
    AND t.payment_status IN ('paid', 'settlement')
    AND DATE(t.created_at AT TIME ZONE 'Asia/Jakarta') = CURRENT_DATE;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RPC: SALES TREND (date range)
-- ============================================================
CREATE OR REPLACE FUNCTION get_sales_trend(
  p_outlet_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS json AS $$
DECLARE
  result json;
BEGIN
  SELECT json_agg(
    json_build_object(
      'date', d.day::text,
      'total_sales', COALESCE(s.total_sales, 0),
      'transaction_count', COALESCE(s.tx_count, 0)
    ) ORDER BY d.day
  ) INTO result
  FROM generate_series(p_start_date, p_end_date, '1 day'::interval) AS d(day)
  LEFT JOIN (
    SELECT DATE(created_at AT TIME ZONE 'Asia/Jakarta') AS sale_date,
           SUM(total) AS total_sales,
           COUNT(*) AS tx_count
    FROM "transaction"
    WHERE outlet_id = p_outlet_id
      AND type = 'sale'
      AND payment_status IN ('paid', 'settlement')
      AND DATE(created_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
    GROUP BY sale_date
  ) s ON s.sale_date = d.day::date;

  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RPC: TOP SELLING BOOKS (for dashboard)
-- ============================================================
CREATE OR REPLACE FUNCTION get_top_books(
  p_outlet_id uuid,
  p_start_date date,
  p_end_date date,
  p_limit int DEFAULT 10
)
RETURNS json AS $$
DECLARE
  result json;
BEGIN
  SELECT json_agg(row_to_json(sub)) INTO result
  FROM (
    SELECT ti.book_id,
           ti.title,
           SUM(ti.quantity) AS total_sold,
           SUM(ti.total) AS total_revenue
    FROM transaction_item ti
    JOIN "transaction" t ON t.id = ti.transaction_id
    WHERE t.outlet_id = p_outlet_id
      AND t.type = 'sale'
      AND t.payment_status IN ('paid', 'settlement')
      AND DATE(t.created_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
    GROUP BY ti.book_id, ti.title
    ORDER BY total_sold DESC
    LIMIT p_limit
  ) sub;

  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RPC: INVENTORY AVAILABILITY (for pelanggan browse, no auth needed)
-- ============================================================
CREATE OR REPLACE FUNCTION get_public_availability(p_outlet_id uuid)
RETURNS json AS $$
DECLARE
  result json;
BEGIN
  SELECT json_agg(json_build_object(
    'book_id', book_id,
    'type', type,
    'price', price,
    'in_stock', stock > 0,
    'is_preloved', is_preloved,
    'location', location
  )) INTO result
  FROM inventory
  WHERE outlet_id = p_outlet_id;

  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant anonymous access to public availability
GRANT EXECUTE ON FUNCTION get_public_availability(uuid) TO anon;

-- ============================================================
-- REFRESH MATERIALIZED VIEWS FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION refresh_dashboard_views()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_sales;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_top_books;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
