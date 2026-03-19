-- =============================================================
-- Migration 00010: Security fixes (HIGH-4, HIGH-6, MED-5)
-- =============================================================

-- HIGH-4: Revoke public access to admin-only refresh functions
REVOKE EXECUTE ON FUNCTION refresh_sales_velocity() FROM authenticated;
REVOKE EXECUTE ON FUNCTION refresh_sales_velocity() FROM anon;
REVOKE EXECUTE ON FUNCTION refresh_all_views() FROM authenticated;
REVOKE EXECUTE ON FUNCTION refresh_all_views() FROM anon;
REVOKE EXECUTE ON FUNCTION refresh_dashboard_views() FROM authenticated;
REVOKE EXECUTE ON FUNCTION refresh_dashboard_views() FROM anon;
REVOKE EXECUTE ON FUNCTION mark_overdue_sessions() FROM authenticated;
REVOKE EXECUTE ON FUNCTION mark_overdue_sessions() FROM anon;

-- HIGH-4: Add outlet access check to get_restock_recommendations
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
  -- Verify caller has access to this outlet
  PERFORM check_outlet_access(p_outlet_id);

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- HIGH-6: Restrict public availability to saleable in-stock items only
CREATE OR REPLACE FUNCTION get_public_availability(p_outlet_id uuid)
RETURNS json AS $$
BEGIN
  RETURN (
    SELECT json_agg(json_build_object(
      'book_id', book_id,
      'type', type,
      'price', price,
      'in_stock', stock > 0,
      'is_preloved', is_preloved
    ))
    FROM inventory
    WHERE outlet_id = p_outlet_id
      AND type IN ('for_sale', 'both')
      AND stock > 0
    LIMIT 500
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- MED-5: Drop unused pin_hash column
ALTER TABLE staff DROP COLUMN IF EXISTS pin_hash;

-- =============================================================
-- CRIT-5: Server-side total verification in checkout_transaction
-- =============================================================
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
  computed_subtotal decimal;
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

  -- Recompute subtotal from items
  SELECT COALESCE(SUM((i->>'quantity')::integer * (i->>'unit_price')::decimal), 0)
  INTO computed_subtotal
  FROM jsonb_array_elements(p_items) AS i;

  -- Verify total is reasonable (within rounding tolerance)
  IF ABS(computed_subtotal - p_subtotal) > 1 THEN
    RAISE EXCEPTION 'Subtotal mismatch: computed=%, claimed=%', computed_subtotal, p_subtotal;
  END IF;

  IF p_total <= 0 THEN
    RAISE EXCEPTION 'Total must be positive';
  END IF;

  IF p_discount < 0 THEN
    RAISE EXCEPTION 'Discount cannot be negative';
  END IF;

  IF p_tax < 0 THEN
    RAISE EXCEPTION 'Tax cannot be negative';
  END IF;

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
