-- Phase 3: Supply chain & consignment tables for Libris Cafe

-- Supplier
CREATE TABLE supplier (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  address text,
  api_endpoint text,
  api_key_encrypted text,
  lead_time_days integer DEFAULT 7,
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_supplier_active ON supplier(is_active);

-- Purchase Order
CREATE TABLE purchase_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES supplier(id),
  outlet_id uuid NOT NULL REFERENCES outlet(id),
  status text NOT NULL CHECK (status IN ('draft', 'ordered', 'received', 'cancelled'))
    DEFAULT 'draft',
  total decimal(12,2) DEFAULT 0,
  notes text,
  ordered_at timestamptz,
  received_at timestamptz,
  created_by uuid REFERENCES staff(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_po_supplier ON purchase_order(supplier_id);
CREATE INDEX idx_po_outlet ON purchase_order(outlet_id);
CREATE INDEX idx_po_status ON purchase_order(status);

-- Purchase Order Item
CREATE TABLE purchase_order_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES purchase_order(id) ON DELETE CASCADE,
  book_id text,
  isbn text,
  title text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price decimal(12,2) NOT NULL DEFAULT 0,
  received_quantity integer DEFAULT 0
);

CREATE INDEX idx_po_item_po ON purchase_order_item(purchase_order_id);

-- Consignor (book owners who consign)
CREATE TABLE consignor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  email text,
  bank_account text,
  bank_name text,
  commission_rate decimal(5,2) NOT NULL DEFAULT 20.00,
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_consignor_active ON consignor(is_active);

-- Add consignor_id FK to inventory (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory' AND column_name = 'consignor_id'
  ) THEN
    ALTER TABLE inventory ADD COLUMN consignor_id uuid REFERENCES consignor(id);
    ALTER TABLE inventory ADD COLUMN commission_rate decimal(5,2);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inventory_consignor ON inventory(consignor_id);

-- Consignment Settlement
CREATE TABLE consignment_settlement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consignor_id uuid NOT NULL REFERENCES consignor(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_sales decimal(12,2) NOT NULL DEFAULT 0,
  commission decimal(12,2) NOT NULL DEFAULT 0,
  payout decimal(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('draft', 'confirmed', 'paid'))
    DEFAULT 'draft',
  paid_at timestamptz,
  notes text,
  created_by uuid REFERENCES staff(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_settlement_consignor ON consignment_settlement(consignor_id);
CREATE INDEX idx_settlement_status ON consignment_settlement(status);

-- Notification
CREATE TABLE notification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id uuid REFERENCES outlet(id),
  recipient_id uuid REFERENCES staff(id),
  type text NOT NULL,
  title text NOT NULL,
  body text,
  data jsonb,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_notification_recipient ON notification(recipient_id);
CREATE INDEX idx_notification_read ON notification(recipient_id, read);
CREATE INDEX idx_notification_created ON notification(created_at);

-- Auto-update PO total when items change
CREATE OR REPLACE FUNCTION update_po_total()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE purchase_order
  SET total = (
    SELECT COALESCE(SUM(quantity * unit_price), 0)
    FROM purchase_order_item
    WHERE purchase_order_id = COALESCE(NEW.purchase_order_id, OLD.purchase_order_id)
  )
  WHERE id = COALESCE(NEW.purchase_order_id, OLD.purchase_order_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_po_item_total
  AFTER INSERT OR UPDATE OR DELETE ON purchase_order_item
  FOR EACH ROW EXECUTE FUNCTION update_po_total();

-- RLS Policies
ALTER TABLE supplier ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE consignor ENABLE ROW LEVEL SECURITY;
ALTER TABLE consignment_settlement ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification ENABLE ROW LEVEL SECURITY;

-- Supplier: owner can manage, staff can read
CREATE POLICY "Owner can manage suppliers" ON supplier
  FOR ALL USING (
    EXISTS (SELECT 1 FROM staff WHERE id = auth.uid() AND role = 'owner')
  );

CREATE POLICY "Staff can read suppliers" ON supplier
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM staff WHERE id = auth.uid())
  );

-- Purchase Order: owner can manage, scoped by outlet
CREATE POLICY "Owner can manage POs" ON purchase_order
  FOR ALL USING (
    outlet_id IN (
      SELECT outlet_id FROM staff WHERE id = auth.uid() AND role = 'owner'
    )
  );

CREATE POLICY "Staff can read POs" ON purchase_order
  FOR SELECT USING (
    outlet_id IN (SELECT outlet_id FROM staff WHERE id = auth.uid())
  );

-- PO Items: follow PO access
CREATE POLICY "Access PO items via PO" ON purchase_order_item
  FOR ALL USING (
    purchase_order_id IN (
      SELECT po.id FROM purchase_order po
      JOIN staff s ON s.outlet_id = po.outlet_id
      WHERE s.id = auth.uid()
    )
  );

-- Consignor: owner can manage, staff can read
CREATE POLICY "Owner can manage consignors" ON consignor
  FOR ALL USING (
    EXISTS (SELECT 1 FROM staff WHERE id = auth.uid() AND role = 'owner')
  );

CREATE POLICY "Staff can read consignors" ON consignor
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM staff WHERE id = auth.uid())
  );

-- Consignment Settlement: owner only
CREATE POLICY "Owner can manage settlements" ON consignment_settlement
  FOR ALL USING (
    EXISTS (SELECT 1 FROM staff WHERE id = auth.uid() AND role = 'owner')
  );

-- Notification: recipient can read/update own
CREATE POLICY "Staff can read own notifications" ON notification
  FOR SELECT USING (recipient_id = auth.uid());

CREATE POLICY "Staff can update own notifications" ON notification
  FOR UPDATE USING (recipient_id = auth.uid());

-- System can insert notifications (service role)
CREATE POLICY "System can insert notifications" ON notification
  FOR INSERT WITH CHECK (true);

-- Enable Realtime for notifications table
ALTER PUBLICATION supabase_realtime ADD TABLE notification;
