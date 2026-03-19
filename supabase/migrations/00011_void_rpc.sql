CREATE OR REPLACE FUNCTION void_transaction(
  p_transaction_id uuid,
  p_staff_id uuid,
  p_reason text
)
RETURNS json AS $$
DECLARE
  tx_record "transaction"%ROWTYPE;
  item record;
BEGIN
  -- Validate caller
  IF auth.uid() != p_staff_id THEN
    RAISE EXCEPTION 'Staff ID mismatch';
  END IF;

  -- Lock and validate transaction
  SELECT * INTO tx_record
  FROM "transaction"
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  IF tx_record.type = 'void' THEN
    RAISE EXCEPTION 'Transaction already voided';
  END IF;

  -- Mark as voided
  UPDATE "transaction"
  SET type = 'void', payment_status = 'refunded', notes = p_reason
  WHERE id = p_transaction_id;

  -- Restore stock for each item
  FOR item IN SELECT inventory_id, quantity FROM transaction_item WHERE transaction_id = p_transaction_id
  LOOP
    INSERT INTO stock_movement (inventory_id, type, quantity, reference_id, staff_id, reason)
    VALUES (item.inventory_id, 'void_restore', item.quantity, p_transaction_id::text, p_staff_id, 'Void: ' || p_reason);
  END LOOP;

  RETURN json_build_object('status', 'ok');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
