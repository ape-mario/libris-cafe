-- Senior review production fixes

-- P0-1: Revoke direct access to webhook processing RPC
REVOKE EXECUTE ON FUNCTION process_payment_webhook(text, text, text, decimal, text, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION process_payment_webhook(text, text, text, decimal, text, jsonb) FROM anon;

-- P0-3: Prevent duplicate settlement periods
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_settlement_period
  ON consignment_settlement(consignor_id, period_start, period_end)
  WHERE status != 'cancelled';

-- P2-12: Drop redundant 2-param overload of rpc_consolidated_sales
DROP FUNCTION IF EXISTS rpc_consolidated_sales(date, date);

-- ============================================================
-- P1-5: Validate caller identity in checkout_transaction
-- (Replace function to add auth checks at the top)
-- ============================================================
CREATE OR REPLACE FUNCTION checkout_transaction(
  p_outlet_id uuid,
  p_staff_id uuid,
  p_type text,
  p_subtotal decimal,
  p_discount decimal,
  p_tax decimal,
  p_total decimal,
  p_payment_method text,
  p_payment_status text,
  p_customer_name text,
  p_customer_contact text,
  p_notes text,
  p_offline_id text,
  p_items jsonb
)
RETURNS json AS $$
DECLARE
  tx_id uuid;
  item jsonb;
  inv_stock integer;
BEGIN
  -- Validate caller identity
  IF auth.uid() != p_staff_id THEN
    RAISE EXCEPTION 'Staff ID mismatch';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM staff WHERE id = auth.uid() AND outlet_id = p_outlet_id AND is_active = true) THEN
    RAISE EXCEPTION 'Access denied: staff not assigned to this outlet';
  END IF;

  -- Validate all stock availability first (with row locks)
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT stock INTO inv_stock
    FROM inventory
    WHERE id = (item->>'inventory_id')::uuid
    FOR UPDATE;

    IF inv_stock IS NULL THEN
      RAISE EXCEPTION 'Inventory item % not found', item->>'inventory_id';
    END IF;

    IF inv_stock < (item->>'quantity')::integer THEN
      RAISE EXCEPTION 'Insufficient stock for %: available=%, requested=%',
        item->>'title', inv_stock, (item->>'quantity')::integer;
    END IF;
  END LOOP;

  -- Insert transaction
  INSERT INTO "transaction" (
    outlet_id, staff_id, type, subtotal, discount, tax, total,
    payment_method, payment_status, customer_name, customer_contact,
    notes, offline_id
  ) VALUES (
    p_outlet_id, p_staff_id, p_type, p_subtotal, p_discount, p_tax, p_total,
    p_payment_method, p_payment_status, p_customer_name, p_customer_contact,
    p_notes, p_offline_id
  ) RETURNING id INTO tx_id;

  -- Insert transaction items
  INSERT INTO transaction_item (
    transaction_id, inventory_id, book_id, title, quantity, unit_price, discount, total
  )
  SELECT
    tx_id,
    (item->>'inventory_id')::uuid,
    item->>'book_id',
    item->>'title',
    (item->>'quantity')::integer,
    (item->>'unit_price')::decimal,
    COALESCE((item->>'discount')::decimal, 0),
    (item->>'total')::decimal
  FROM jsonb_array_elements(p_items) AS item;

  -- Insert stock movements (trigger handles stock update with row lock)
  INSERT INTO stock_movement (inventory_id, type, quantity, reference_id, staff_id)
  SELECT
    (item->>'inventory_id')::uuid,
    'sale_out',
    -(item->>'quantity')::integer,
    tx_id::text,
    p_staff_id
  FROM jsonb_array_elements(p_items) AS item;

  RETURN json_build_object('transaction_id', tx_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- P1-9: Outlet access validation helper
-- ============================================================
CREATE OR REPLACE FUNCTION check_outlet_access(p_outlet_id uuid)
RETURNS void AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM staff
    WHERE id = auth.uid()
    AND (outlet_id = p_outlet_id OR role = 'owner')
    AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Access denied: not authorized for this outlet';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- P1-9: Recreate get_today_metrics with outlet access check
CREATE OR REPLACE FUNCTION get_today_metrics(p_outlet_id uuid)
RETURNS json AS $$
DECLARE
  result json;
BEGIN
  PERFORM check_outlet_access(p_outlet_id);

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

-- P1-9: Recreate get_sales_trend with outlet access check
CREATE OR REPLACE FUNCTION get_sales_trend(
  p_outlet_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS json AS $$
DECLARE
  result json;
BEGIN
  PERFORM check_outlet_access(p_outlet_id);

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

-- P1-9: Recreate get_top_books with outlet access check
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
  PERFORM check_outlet_access(p_outlet_id);

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

-- P1-9: Recreate get_lending_stats with outlet access check
CREATE OR REPLACE FUNCTION get_lending_stats(p_outlet_id uuid)
RETURNS json AS $$
BEGIN
  PERFORM check_outlet_access(p_outlet_id);

  RETURN (
    SELECT json_build_object(
      'active_count', COUNT(*) FILTER (WHERE rs.status = 'active'),
      'overdue_count', COUNT(*) FILTER (WHERE rs.status = 'active' AND rs.expected_return_at < now()),
      'today_checkin', COUNT(*) FILTER (WHERE DATE(rs.checked_in_at AT TIME ZONE 'Asia/Jakarta') = CURRENT_DATE),
      'today_checkout', COUNT(*) FILTER (WHERE rs.status = 'returned' AND DATE(rs.checked_out_at AT TIME ZONE 'Asia/Jakarta') = CURRENT_DATE),
      'avg_duration_minutes', ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(rs.checked_out_at, now()) - rs.checked_in_at)) / 60) FILTER (WHERE rs.status = 'returned'), 0)
    )
    FROM reading_session rs
    JOIN inventory i ON i.id = rs.inventory_id
    WHERE i.outlet_id = p_outlet_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- P1-9: Recreate get_sales_report with outlet access check
CREATE OR REPLACE FUNCTION get_sales_report(
  p_outlet_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS json AS $$
BEGIN
  PERFORM check_outlet_access(p_outlet_id);

  RETURN (
    SELECT json_agg(row_to_json(sub))
    FROM (
      SELECT
        DATE(t.created_at AT TIME ZONE 'Asia/Jakarta') AS sale_date,
        COUNT(*) AS transaction_count,
        SUM(t.total) AS total_sales,
        SUM(t.tax) AS total_tax,
        SUM(t.discount) AS total_discount,
        t.payment_method
      FROM "transaction" t
      WHERE t.outlet_id = p_outlet_id
        AND t.type = 'sale'
        AND t.payment_status IN ('paid', 'settlement')
        AND DATE(t.created_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      GROUP BY sale_date, t.payment_method
      ORDER BY sale_date DESC
    ) sub
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- P1-9: Recreate get_dead_stock with outlet access check
CREATE OR REPLACE FUNCTION get_dead_stock(
  p_outlet_id uuid,
  p_days integer DEFAULT 90
)
RETURNS json AS $$
BEGIN
  PERFORM check_outlet_access(p_outlet_id);

  RETURN (
    SELECT json_agg(row_to_json(sub))
    FROM (
      SELECT
        i.id AS inventory_id,
        i.book_id,
        i.stock,
        i.price,
        i.cost_price,
        i.created_at,
        COALESCE(last_sale.last_sold, i.created_at) AS last_activity,
        EXTRACT(DAY FROM now() - COALESCE(last_sale.last_sold, i.created_at))::integer AS days_idle
      FROM inventory i
      LEFT JOIN LATERAL (
        SELECT MAX(t.created_at) AS last_sold
        FROM transaction_item ti
        JOIN "transaction" t ON t.id = ti.transaction_id
        WHERE ti.inventory_id = i.id
          AND t.payment_status IN ('paid', 'settlement')
      ) last_sale ON true
      WHERE i.outlet_id = p_outlet_id
        AND i.stock > 0
        AND EXTRACT(DAY FROM now() - COALESCE(last_sale.last_sold, i.created_at)) >= p_days
      ORDER BY days_idle DESC
    ) sub
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- P1-9: Recreate get_profit_margin_report with outlet access check
CREATE OR REPLACE FUNCTION get_profit_margin_report(
  p_outlet_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS json AS $$
BEGIN
  PERFORM check_outlet_access(p_outlet_id);

  RETURN (
    SELECT json_agg(row_to_json(sub))
    FROM (
      SELECT
        ti.book_id,
        ti.title,
        i.source,
        i.is_preloved,
        SUM(ti.quantity) AS units_sold,
        SUM(ti.total) AS revenue,
        SUM(ti.quantity * COALESCE(i.cost_price, 0)) AS cost,
        SUM(ti.total) - SUM(ti.quantity * COALESCE(i.cost_price, 0)) AS margin,
        CASE WHEN SUM(ti.total) > 0
          THEN ROUND((SUM(ti.total) - SUM(ti.quantity * COALESCE(i.cost_price, 0))) / SUM(ti.total) * 100, 1)
          ELSE 0
        END AS margin_pct
      FROM transaction_item ti
      JOIN "transaction" t ON t.id = ti.transaction_id
      LEFT JOIN inventory i ON i.id = ti.inventory_id
      WHERE t.outlet_id = p_outlet_id
        AND t.type = 'sale'
        AND t.payment_status IN ('paid', 'settlement')
        AND DATE(t.created_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      GROUP BY ti.book_id, ti.title, i.source, i.is_preloved
      ORDER BY margin DESC
    ) sub
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- P1-9: Recreate get_consignment_summary with outlet access check
CREATE OR REPLACE FUNCTION get_consignment_summary(
  p_outlet_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS json AS $$
BEGIN
  PERFORM check_outlet_access(p_outlet_id);

  RETURN (
    SELECT json_agg(row_to_json(sub))
    FROM (
      SELECT
        c.id AS consignor_id,
        c.name AS consignor_name,
        COUNT(DISTINCT ti.id) AS items_sold,
        SUM(ti.total) AS total_sales,
        SUM(ti.total * COALESCE(i.commission_rate, 0) / 100) AS commission,
        SUM(ti.total) - SUM(ti.total * COALESCE(i.commission_rate, 0) / 100) AS payout
      FROM consignor c
      JOIN inventory i ON i.consignor_id = c.id AND i.outlet_id = p_outlet_id
      JOIN transaction_item ti ON ti.inventory_id = i.id
      JOIN "transaction" t ON t.id = ti.transaction_id
      WHERE t.type = 'sale'
        AND t.payment_status IN ('paid', 'settlement')
        AND DATE(t.created_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      GROUP BY c.id, c.name
      ORDER BY total_sales DESC
    ) sub
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- P1-9: Recreate get_supplier_performance with outlet access check
CREATE OR REPLACE FUNCTION get_supplier_performance(
  p_outlet_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS json AS $$
BEGIN
  PERFORM check_outlet_access(p_outlet_id);

  RETURN (
    SELECT json_agg(row_to_json(sub))
    FROM (
      SELECT
        s.id AS supplier_id,
        s.name AS supplier_name,
        COUNT(DISTINCT po.id) AS total_orders,
        SUM(po.total) AS total_spent,
        AVG(EXTRACT(DAY FROM po.received_at - po.ordered_at))::integer AS avg_lead_days,
        COUNT(DISTINCT CASE WHEN po.status = 'received' THEN po.id END) AS completed_orders,
        COUNT(DISTINCT CASE WHEN po.status = 'cancelled' THEN po.id END) AS cancelled_orders
      FROM supplier s
      JOIN purchase_order po ON po.supplier_id = s.id AND po.outlet_id = p_outlet_id
      WHERE DATE(po.created_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      GROUP BY s.id, s.name
      ORDER BY total_spent DESC
    ) sub
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
