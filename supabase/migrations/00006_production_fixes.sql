-- Phase 6: Production-readiness fixes
-- Fixes: atomic checkout, idempotent webhook, race-safe stock,
-- missing report RPCs, RLS gaps, consolidated status filter

-- ============================================================
-- FIX 1: Race-safe stock trigger (SELECT FOR UPDATE)
-- Prevents concurrent decrements from bypassing CHECK >= 0
-- ============================================================
CREATE OR REPLACE FUNCTION update_inventory_stock()
RETURNS TRIGGER AS $$
DECLARE
  current_row inventory%ROWTYPE;
BEGIN
  -- Lock the inventory row to prevent concurrent updates
  SELECT * INTO current_row
  FROM inventory
  WHERE id = NEW.inventory_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item % not found', NEW.inventory_id;
  END IF;

  -- Check if the update would violate stock >= 0
  IF (current_row.stock + NEW.quantity) < 0 THEN
    RAISE EXCEPTION 'Insufficient stock: current=%, requested=%',
      current_row.stock, NEW.quantity;
  END IF;

  UPDATE inventory
  SET stock = stock + NEW.quantity,
      updated_at = now()
  WHERE id = NEW.inventory_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FIX 2: Atomic checkout RPC
-- Single transaction: insert transaction + items + stock movements
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
  p_items jsonb  -- array of {inventory_id, book_id, title, quantity, unit_price, discount, total}
)
RETURNS json AS $$
DECLARE
  tx_id uuid;
  item jsonb;
  inv_stock integer;
BEGIN
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
-- FIX 3: Idempotent webhook processing
-- Add processed flag to prevent duplicate stock decrements
-- ============================================================
ALTER TABLE payment
  ADD COLUMN IF NOT EXISTS webhook_processed boolean DEFAULT false;

CREATE OR REPLACE FUNCTION process_payment_webhook(
  p_midtrans_order_id text,
  p_midtrans_transaction_id text,
  p_payment_type text,
  p_gross_amount decimal,
  p_status text,
  p_raw_response jsonb
)
RETURNS json AS $$
DECLARE
  pay_record payment%ROWTYPE;
  tx_record "transaction"%ROWTYPE;
  item record;
BEGIN
  -- Find payment record
  SELECT * INTO pay_record
  FROM payment
  WHERE midtrans_order_id = p_midtrans_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('status', 'error', 'message', 'Payment not found');
  END IF;

  -- Check idempotency: already processed this status?
  IF pay_record.webhook_processed AND pay_record.status = p_status THEN
    RETURN json_build_object('status', 'ok', 'message', 'Already processed');
  END IF;

  -- Update payment record
  UPDATE payment SET
    midtrans_transaction_id = p_midtrans_transaction_id,
    payment_type = p_payment_type,
    gross_amount = p_gross_amount,
    status = p_status,
    raw_response = p_raw_response,
    webhook_processed = true,
    updated_at = now()
  WHERE id = pay_record.id;

  -- Get associated transaction
  SELECT * INTO tx_record
  FROM "transaction"
  WHERE id = pay_record.transaction_id;

  -- Update transaction status based on payment status
  IF p_status IN ('capture', 'settlement') THEN
    UPDATE "transaction" SET
      payment_status = 'paid',
      midtrans_transaction_id = p_midtrans_transaction_id
    WHERE id = tx_record.id;

    -- Decrement stock ONLY if not already done (first successful webhook)
    IF NOT pay_record.webhook_processed OR pay_record.status NOT IN ('capture', 'settlement') THEN
      INSERT INTO stock_movement (inventory_id, type, quantity, reference_id, staff_id)
      SELECT
        ti.inventory_id,
        'sale_out',
        -ti.quantity,
        tx_record.id::text,
        tx_record.staff_id
      FROM transaction_item ti
      WHERE ti.transaction_id = tx_record.id;
    END IF;

  ELSIF p_status IN ('deny', 'cancel', 'expire') THEN
    UPDATE "transaction" SET payment_status = 'failed'
    WHERE id = tx_record.id;

  ELSIF p_status = 'refund' THEN
    UPDATE "transaction" SET payment_status = 'refunded'
    WHERE id = tx_record.id;
  END IF;

  RETURN json_build_object('status', 'ok', 'transaction_id', tx_record.id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FIX 4: Missing report RPCs
-- ============================================================

-- Sales report (daily breakdown)
CREATE OR REPLACE FUNCTION get_sales_report(
  p_outlet_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS json AS $$
BEGIN
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

-- Dead stock report (unsold > N days)
CREATE OR REPLACE FUNCTION get_dead_stock(
  p_outlet_id uuid,
  p_days integer DEFAULT 90
)
RETURNS json AS $$
BEGIN
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

-- Profit margin report
CREATE OR REPLACE FUNCTION get_profit_margin_report(
  p_outlet_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS json AS $$
BEGIN
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

-- Consignment summary report
CREATE OR REPLACE FUNCTION get_consignment_summary(
  p_outlet_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS json AS $$
BEGIN
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

-- Supplier performance report
CREATE OR REPLACE FUNCTION get_supplier_performance(
  p_outlet_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS json AS $$
BEGIN
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

-- ============================================================
-- FIX 5: RLS — scope stock_movement INSERT to staff's outlet
-- ============================================================
DROP POLICY IF EXISTS "Staff can insert stock movements" ON stock_movement;
CREATE POLICY "Staff can insert stock movements" ON stock_movement
  FOR INSERT WITH CHECK (
    staff_id = auth.uid()
    AND inventory_id IN (
      SELECT i.id FROM inventory i
      JOIN staff s ON s.outlet_id = i.outlet_id
      WHERE s.id = auth.uid()
    )
  );

-- Fix notification INSERT policy
DROP POLICY IF EXISTS "System can insert notifications" ON notification;
DROP POLICY IF EXISTS "Anyone can insert notifications" ON notification;
CREATE POLICY "Staff can insert notifications for own outlet" ON notification
  FOR INSERT WITH CHECK (
    outlet_id IN (SELECT outlet_id FROM staff WHERE id = auth.uid())
  );

-- ============================================================
-- FIX 6: consolidated_sales — include 'settlement' status
-- ============================================================
CREATE OR REPLACE FUNCTION rpc_consolidated_sales(
  p_start_date date,
  p_end_date date
)
RETURNS json AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_to_json(sub))
    FROM (
      SELECT
        t.outlet_id,
        o.name AS outlet_name,
        COUNT(*) AS transaction_count,
        SUM(t.total) AS total_sales,
        SUM(ti_agg.total_items) AS total_items,
        ROUND(AVG(t.total), 0) AS avg_transaction,
        SUM(t.total) - SUM(COALESCE(ti_agg.total_cost, 0)) AS net_revenue
      FROM "transaction" t
      JOIN outlet o ON o.id = t.outlet_id
      LEFT JOIN LATERAL (
        SELECT
          SUM(ti.quantity) AS total_items,
          SUM(ti.quantity * COALESCE(i.cost_price, 0)) AS total_cost
        FROM transaction_item ti
        LEFT JOIN inventory i ON i.id = ti.inventory_id
        WHERE ti.transaction_id = t.id
      ) ti_agg ON true
      WHERE t.type = 'sale'
        AND t.payment_status IN ('paid', 'settlement')
        AND DATE(t.created_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      GROUP BY t.outlet_id, o.name
      ORDER BY total_sales DESC
    ) sub
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FIX 7: Add settled_transaction_ids to consignment_settlement
-- to prevent double-counting
-- ============================================================
ALTER TABLE consignment_settlement
  ADD COLUMN IF NOT EXISTS settled_transaction_item_ids uuid[] DEFAULT '{}';
