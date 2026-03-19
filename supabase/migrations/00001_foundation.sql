-- Phase 1: Foundation tables for Libris Cafe

-- Outlet (multi-outlet ready, start with 1)
CREATE TABLE outlet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  phone text,
  tax_rate decimal(5,2) DEFAULT 11.00,
  created_at timestamptz DEFAULT now()
);

-- Staff & Auth
-- staff.id = Supabase Auth user UUID (set explicitly when creating staff, not auto-generated)
CREATE TABLE staff (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  email text UNIQUE,
  role text NOT NULL CHECK (role IN ('owner', 'staff')),
  pin_hash text NOT NULL,
  outlet_id uuid REFERENCES outlet(id),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Inventory (bridge to Yjs via book_id)
CREATE TABLE inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id text NOT NULL,
  outlet_id uuid REFERENCES outlet(id),
  type text NOT NULL CHECK (type IN ('for_sale', 'read_in_store', 'both'))
    DEFAULT 'for_sale',
  source text NOT NULL CHECK (source IN ('supplier', 'owner', 'consignment', 'buyback'))
    DEFAULT 'supplier',
  is_preloved boolean DEFAULT false,
  price decimal(12,2),
  cost_price decimal(12,2),
  stock integer DEFAULT 0 CHECK (stock >= 0),
  min_stock integer DEFAULT 1,
  location text,
  condition text CHECK (condition IN ('new', 'good', 'fair')) DEFAULT 'new',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (book_id, outlet_id)
);

CREATE INDEX idx_inventory_book_id ON inventory(book_id);
CREATE INDEX idx_inventory_outlet_id ON inventory(outlet_id);

-- Stock Movement (audit trail)
CREATE TABLE stock_movement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id uuid NOT NULL REFERENCES inventory(id),
  type text NOT NULL CHECK (type IN (
    'purchase_in', 'sale_out', 'return_in', 'return_out',
    'adjustment', 'void_restore', 'consignment_in',
    'consignment_return', 'buyback_in'
  )),
  quantity integer NOT NULL CHECK (quantity != 0),
  reference_id text,
  reason text,
  staff_id uuid REFERENCES staff(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_stock_movement_inventory ON stock_movement(inventory_id);

-- Auto-update inventory.stock on stock_movement insert
CREATE OR REPLACE FUNCTION update_inventory_stock()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE inventory
  SET stock = stock + NEW.quantity,
      updated_at = now()
  WHERE id = NEW.inventory_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stock_movement_update
  AFTER INSERT ON stock_movement
  FOR EACH ROW EXECUTE FUNCTION update_inventory_stock();

-- Transaction (POS)
CREATE TABLE "transaction" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id uuid REFERENCES outlet(id),
  staff_id uuid REFERENCES staff(id),
  type text NOT NULL CHECK (type IN ('sale', 'return', 'void')) DEFAULT 'sale',
  subtotal decimal(12,2) NOT NULL DEFAULT 0,
  discount decimal(12,2) DEFAULT 0,
  tax decimal(12,2) DEFAULT 0,
  total decimal(12,2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL CHECK (payment_method IN (
    'cash', 'qris', 'ewallet', 'bank_transfer', 'card'
  )),
  payment_status text NOT NULL CHECK (payment_status IN (
    'pending', 'paid', 'failed', 'refunded'
  )) DEFAULT 'pending',
  customer_name text,
  customer_contact text,
  notes text,
  offline_id text UNIQUE,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_transaction_outlet ON "transaction"(outlet_id);
CREATE INDEX idx_transaction_created ON "transaction"(created_at);
CREATE INDEX idx_transaction_offline_id ON "transaction"(offline_id);

-- Transaction Items
CREATE TABLE transaction_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES "transaction"(id) ON DELETE CASCADE,
  inventory_id uuid REFERENCES inventory(id),
  book_id text NOT NULL,
  title text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price decimal(12,2) NOT NULL,
  discount decimal(12,2) DEFAULT 0,
  total decimal(12,2) NOT NULL
);

CREATE INDEX idx_transaction_item_tx ON transaction_item(transaction_id);

-- Row Level Security
ALTER TABLE outlet ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movement ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_item ENABLE ROW LEVEL SECURITY;

-- RLS Policies: authenticated staff can access their outlet's data
CREATE POLICY "Staff can read own outlet" ON outlet
  FOR SELECT USING (
    id IN (SELECT outlet_id FROM staff WHERE id = auth.uid())
  );

CREATE POLICY "Staff can read own outlet staff" ON staff
  FOR SELECT USING (
    outlet_id IN (SELECT outlet_id FROM staff WHERE id = auth.uid())
  );

CREATE POLICY "Staff can manage own outlet inventory" ON inventory
  FOR ALL USING (
    outlet_id IN (SELECT outlet_id FROM staff WHERE id = auth.uid())
  );

CREATE POLICY "Staff can read own outlet stock movements" ON stock_movement
  FOR SELECT USING (
    inventory_id IN (
      SELECT i.id FROM inventory i
      JOIN staff s ON s.outlet_id = i.outlet_id
      WHERE s.id = auth.uid()
    )
  );

CREATE POLICY "Staff can insert stock movements" ON stock_movement
  FOR INSERT WITH CHECK (
    staff_id = auth.uid()
  );

CREATE POLICY "Staff can manage own outlet transactions" ON "transaction"
  FOR ALL USING (
    outlet_id IN (SELECT outlet_id FROM staff WHERE id = auth.uid())
  );

CREATE POLICY "Staff can manage own outlet transaction items" ON transaction_item
  FOR ALL USING (
    transaction_id IN (
      SELECT t.id FROM "transaction" t
      JOIN staff s ON s.outlet_id = t.outlet_id
      WHERE s.id = auth.uid()
    )
  );

-- Seed: default outlet
INSERT INTO outlet (name, address)
VALUES ('Libris Cafe', 'Alamat cafe di sini');
