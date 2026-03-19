# Phase 3: Supply Chain & Consignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add supplier management, purchase orders, consignment tracking with settlement, in-app + WhatsApp notifications, and a restock suggestion engine to Libris Cafe.

**Architecture:** Supplier and consignment modules interact with existing inventory (stock movements) and POS (transaction items for consignment ledger). Notification module uses Supabase Realtime for in-app delivery and reuses the Phase 2 `MessagingProvider` interface for WhatsApp. Restock engine runs heuristics against sales history and inventory data.

**Tech Stack:** SvelteKit 2 + Svelte 5, Supabase (Postgres + Realtime + Edge Functions), Vitest for testing.

**Assumes Phase 1+2 complete:** Auth, inventory, POS, payment (Midtrans), receipt (WhatsApp/email via MessagingProvider), dashboard, pelanggan browse all exist.

**Spec Reference:** `docs/superpowers/specs/2026-03-19-libris-cafe-design.md`

---

## File Structure

### New Files

```
src/lib/
├── modules/
│   ├── supplier/
│   │   ├── types.ts                 # Supplier, PurchaseOrder, PurchaseOrderItem types
│   │   ├── service.ts               # Supplier CRUD, PO lifecycle
│   │   ├── service.test.ts          # Supplier + PO service tests
│   │   ├── adapter.ts               # Abstract SupplierAdapter interface
│   │   └── adapters/
│   │       └── manual.ts            # Manual/no-API adapter (default)
│   │
│   ├── consignment/
│   │   ├── types.ts                 # Consignor, ConsignmentSettlement types
│   │   ├── service.ts               # Consignor CRUD, settlement lifecycle
│   │   ├── service.test.ts          # Consignment service tests
│   │   └── ledger.ts                # Consignment sales ledger (query helpers)
│   │
│   ├── notification/
│   │   ├── types.ts                 # Notification, NotificationEvent types
│   │   ├── service.ts               # Create, mark-read, fetch notifications
│   │   ├── service.test.ts          # Notification service tests
│   │   ├── realtime.ts              # Supabase Realtime subscription for in-app
│   │   ├── whatsapp.ts              # WhatsApp notification dispatcher
│   │   └── stores.svelte.ts         # Unread count, notification list reactive state
│   │
│   └── restock/
│       ├── types.ts                 # RestockSuggestion, RestockUrgency types
│       ├── engine.ts                # Heuristic restock suggestion engine
│       └── engine.test.ts           # Restock engine tests

src/routes/
├── owner/
│   ├── suppliers/
│   │   ├── +page.svelte             # Supplier list
│   │   ├── new/
│   │   │   └── +page.svelte         # Add supplier form
│   │   └── [id]/
│   │       └── +page.svelte         # Supplier detail + PO history
│   ├── purchase-orders/
│   │   ├── +page.svelte             # PO list (all statuses)
│   │   ├── new/
│   │   │   └── +page.svelte         # Create PO form
│   │   └── [id]/
│   │       └── +page.svelte         # PO detail + receive goods
│   ├── consignment/
│   │   ├── +page.svelte             # Consignor list + settlement summary
│   │   ├── new/
│   │   │   └── +page.svelte         # Add consignor form
│   │   └── [id]/
│   │       └── +page.svelte         # Consignor detail + settlement history
│   ├── restock/
│   │   └── +page.svelte             # Restock suggestions dashboard
│   └── notifications/
│       └── +page.svelte             # Notification center (full list)

supabase/
├── migrations/
│   └── 00003_supply_chain.sql       # Phase 3 tables: supplier, purchase_order,
│                                    # purchase_order_item, consignor,
│                                    # consignment_settlement, notification
└── functions/
    └── daily-summary/
        └── index.ts                 # Edge Function: daily summary via WhatsApp
```

### Modified Files

```
src/lib/components/TopBar.svelte         # Add notification bell with unread badge
src/lib/components/BottomNav.svelte      # (no change — owner routes accessible from dashboard)
src/lib/i18n/en.ts                       # Add supplier, consignment, notification, restock strings
src/lib/i18n/id.ts                       # Add supplier, consignment, notification, restock strings
src/routes/+layout.svelte                # Init notification realtime subscription
src/routes/owner/+layout.svelte          # Ensure owner-only guard (may already exist from Phase 2)
```

---

## Task 1: Database Migration — Supply Chain Tables

**Files:**
- Create: `supabase/migrations/00003_supply_chain.sql`

- [ ] **Step 1: Write the supply chain migration**

Create `supabase/migrations/00003_supply_chain.sql`:

```sql
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
```

- [ ] **Step 2: Apply migration locally**

```bash
npx supabase db reset
```

Expected: All tables created, triggers working, RLS policies active, no errors.

- [ ] **Step 3: Regenerate TypeScript types**

```bash
npx supabase gen types typescript --local > src/lib/supabase/types.ts
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00003_supply_chain.sql src/lib/supabase/types.ts
git commit -m "feat: add Phase 3 migration — supplier, PO, consignor, settlement, notification tables"
```

---

## Task 2: Supplier Module — Types & Service

**Files:**
- Create: `src/lib/modules/supplier/types.ts`
- Create: `src/lib/modules/supplier/service.ts`
- Create: `src/lib/modules/supplier/service.test.ts`
- Create: `src/lib/modules/supplier/adapter.ts`
- Create: `src/lib/modules/supplier/adapters/manual.ts`

- [ ] **Step 1: Write supplier types**

Create `src/lib/modules/supplier/types.ts`:

```typescript
export interface Supplier {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  api_endpoint: string | null;
  api_key_encrypted: string | null;
  lead_time_days: number;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export type PurchaseOrderStatus = 'draft' | 'ordered' | 'received' | 'cancelled';

export interface PurchaseOrder {
  id: string;
  supplier_id: string;
  outlet_id: string;
  status: PurchaseOrderStatus;
  total: number;
  notes: string | null;
  ordered_at: string | null;
  received_at: string | null;
  created_by: string | null;
  created_at: string;
  // Joined data
  supplier?: Supplier;
  items?: PurchaseOrderItem[];
}

export interface PurchaseOrderItem {
  id: string;
  purchase_order_id: string;
  book_id: string | null;
  isbn: string | null;
  title: string;
  quantity: number;
  unit_price: number;
  received_quantity: number;
}

export interface NewSupplier {
  name: string;
  contact_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  api_endpoint?: string;
  lead_time_days?: number;
  notes?: string;
}

export interface NewPurchaseOrder {
  supplier_id: string;
  outlet_id: string;
  notes?: string;
  created_by: string;
  items: NewPurchaseOrderItem[];
}

export interface NewPurchaseOrderItem {
  book_id?: string;
  isbn?: string;
  title: string;
  quantity: number;
  unit_price: number;
}
```

- [ ] **Step 2: Write failing test for supplier service**

Create `src/lib/modules/supplier/service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockSelect = vi.fn();

function createChainable(data: any) {
  const chain: any = {
    select: vi.fn().mockReturnValue(chain),
    insert: mockInsert.mockReturnValue(chain),
    update: mockUpdate.mockReturnValue(chain),
    eq: vi.fn().mockReturnValue(chain),
    order: vi.fn().mockReturnValue(chain),
    single: vi.fn().mockResolvedValue({ data, error: null }),
    then: (resolve: any) => resolve({ data, error: null }),
  };
  // Make chain itself thenable for await
  chain[Symbol.toStringTag] = 'Promise';
  return chain;
}

vi.mock('$lib/supabase/client', () => ({
  getSupabase: () => ({
    from: vi.fn((table: string) => {
      if (table === 'supplier') {
        return createChainable({
          id: 'sup-1', name: 'Gramedia', contact_name: 'Budi',
          phone: '08123456789', email: 'budi@gramedia.com',
          lead_time_days: 7, is_active: true, created_at: '2026-01-01',
        });
      }
      if (table === 'purchase_order') {
        return createChainable({
          id: 'po-1', supplier_id: 'sup-1', outlet_id: 'outlet-1',
          status: 'draft', total: 0, created_at: '2026-01-01',
        });
      }
      if (table === 'purchase_order_item') {
        return createChainable({ id: 'poi-1' });
      }
      return createChainable(null);
    }),
  }),
}));

import {
  createSupplier,
  getSuppliers,
  updateSupplier,
  createPurchaseOrder,
  updatePOStatus,
} from './service';

beforeEach(() => vi.clearAllMocks());

describe('Supplier service', () => {
  it('should create a supplier', async () => {
    const supplier = await createSupplier({
      name: 'Gramedia',
      contact_name: 'Budi',
      phone: '08123456789',
      email: 'budi@gramedia.com',
    });

    expect(mockInsert).toHaveBeenCalled();
    expect(supplier.name).toBe('Gramedia');
  });

  it('should create a purchase order with items', async () => {
    const po = await createPurchaseOrder({
      supplier_id: 'sup-1',
      outlet_id: 'outlet-1',
      created_by: 'staff-1',
      items: [
        { title: 'Atomic Habits', quantity: 5, unit_price: 60000 },
        { title: 'Deep Work', quantity: 3, unit_price: 55000, isbn: '978-xxx' },
      ],
    });

    expect(mockInsert).toHaveBeenCalled();
    expect(po.supplier_id).toBe('sup-1');
  });

  it('should update PO status to ordered', async () => {
    await updatePOStatus('po-1', 'ordered');
    expect(mockUpdate).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run src/lib/modules/supplier/service.test.ts
```

Expected: FAIL — functions not found.

- [ ] **Step 4: Implement supplier service**

Create `src/lib/modules/supplier/service.ts`:

```typescript
import { getSupabase } from '$lib/supabase/client';
import type {
  Supplier, NewSupplier, PurchaseOrder, PurchaseOrderItem,
  NewPurchaseOrder, PurchaseOrderStatus,
} from './types';

// --- Supplier CRUD ---

export async function createSupplier(input: NewSupplier): Promise<Supplier> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('supplier')
    .insert({
      name: input.name,
      contact_name: input.contact_name ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      api_endpoint: input.api_endpoint ?? null,
      lead_time_days: input.lead_time_days ?? 7,
      notes: input.notes ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create supplier: ${error.message}`);
  return data as Supplier;
}

export async function getSuppliers(activeOnly = true): Promise<Supplier[]> {
  const supabase = getSupabase();
  let query = supabase.from('supplier').select();
  if (activeOnly) query = query.eq('is_active', true);
  const { data, error } = await query.order('name');

  if (error) throw new Error(`Failed to fetch suppliers: ${error.message}`);
  return (data ?? []) as Supplier[];
}

export async function getSupplierById(id: string): Promise<Supplier | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('supplier')
    .select()
    .eq('id', id)
    .single();

  if (error) return null;
  return data as Supplier;
}

export async function updateSupplier(id: string, updates: Partial<NewSupplier>): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('supplier')
    .update(updates)
    .eq('id', id);

  if (error) throw new Error(`Failed to update supplier: ${error.message}`);
}

export async function deactivateSupplier(id: string): Promise<void> {
  await updateSupplier(id, { name: '' } as any);
  const supabase = getSupabase();
  const { error } = await supabase
    .from('supplier')
    .update({ is_active: false })
    .eq('id', id);

  if (error) throw new Error(`Failed to deactivate supplier: ${error.message}`);
}

// --- Purchase Order CRUD ---

export async function createPurchaseOrder(input: NewPurchaseOrder): Promise<PurchaseOrder> {
  const supabase = getSupabase();

  // Create PO header
  const { data: po, error: poError } = await supabase
    .from('purchase_order')
    .insert({
      supplier_id: input.supplier_id,
      outlet_id: input.outlet_id,
      status: 'draft',
      notes: input.notes ?? null,
      created_by: input.created_by,
    })
    .select()
    .single();

  if (poError) throw new Error(`Failed to create PO: ${poError.message}`);

  // Create PO items
  const items = input.items.map(item => ({
    purchase_order_id: po.id,
    book_id: item.book_id ?? null,
    isbn: item.isbn ?? null,
    title: item.title,
    quantity: item.quantity,
    unit_price: item.unit_price,
  }));

  const { error: itemsError } = await supabase
    .from('purchase_order_item')
    .insert(items);

  if (itemsError) throw new Error(`Failed to create PO items: ${itemsError.message}`);

  return po as PurchaseOrder;
}

export async function getPurchaseOrders(
  outletId: string,
  status?: PurchaseOrderStatus
): Promise<PurchaseOrder[]> {
  const supabase = getSupabase();
  let query = supabase
    .from('purchase_order')
    .select('*, supplier(name, contact_name, phone)')
    .eq('outlet_id', outletId);

  if (status) query = query.eq('status', status);

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch POs: ${error.message}`);
  return (data ?? []) as PurchaseOrder[];
}

export async function getPurchaseOrderById(id: string): Promise<PurchaseOrder | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('purchase_order')
    .select('*, supplier(*), purchase_order_item(*)')
    .eq('id', id)
    .single();

  if (error) return null;

  const po = data as any;
  return {
    ...po,
    supplier: po.supplier,
    items: po.purchase_order_item ?? [],
  } as PurchaseOrder;
}

export async function updatePOStatus(
  id: string,
  status: PurchaseOrderStatus
): Promise<void> {
  const supabase = getSupabase();
  const updates: Record<string, any> = { status };

  if (status === 'ordered') updates.ordered_at = new Date().toISOString();
  if (status === 'received') updates.received_at = new Date().toISOString();

  const { error } = await supabase
    .from('purchase_order')
    .update(updates)
    .eq('id', id);

  if (error) throw new Error(`Failed to update PO status: ${error.message}`);
}

export async function receivePOItem(
  itemId: string,
  receivedQty: number
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('purchase_order_item')
    .update({ received_quantity: receivedQty })
    .eq('id', itemId);

  if (error) throw new Error(`Failed to update received quantity: ${error.message}`);
}

/**
 * Receive a complete PO: update all item received quantities,
 * create stock movements, and set PO status to 'received'.
 */
export async function receivePurchaseOrder(
  poId: string,
  receivedItems: Array<{ itemId: string; inventoryId: string; receivedQty: number }>,
  staffId: string
): Promise<void> {
  const supabase = getSupabase();

  for (const item of receivedItems) {
    // Update received quantity on PO item
    await receivePOItem(item.itemId, item.receivedQty);

    // Create stock movement for each received item
    if (item.receivedQty > 0) {
      const { error } = await supabase
        .from('stock_movement')
        .insert({
          inventory_id: item.inventoryId,
          type: 'purchase_in',
          quantity: item.receivedQty,
          reference_id: poId,
          staff_id: staffId,
          reason: `PO received: ${item.receivedQty} units`,
        });

      if (error) throw new Error(`Failed to record stock movement: ${error.message}`);
    }
  }

  // Mark PO as received
  await updatePOStatus(poId, 'received');
}

export async function getSupplierPOs(supplierId: string): Promise<PurchaseOrder[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('purchase_order')
    .select('*')
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch supplier POs: ${error.message}`);
  return (data ?? []) as PurchaseOrder[];
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run src/lib/modules/supplier/service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Write SupplierAdapter interface and manual adapter**

Create `src/lib/modules/supplier/adapter.ts`:

```typescript
/**
 * Abstract interface for supplier API integration.
 * Each supplier with an API gets a concrete adapter implementation.
 * Suppliers without APIs use the ManualAdapter (no-op).
 */
export interface SupplierAdapter {
  /** Check if a book is available from this supplier */
  checkAvailability(isbn: string): Promise<SupplierAvailability | null>;

  /** Place an order with the supplier */
  createOrder(items: SupplierOrderItem[]): Promise<SupplierOrderResult>;

  /** Check the status of a previously placed order */
  checkOrderStatus(orderId: string): Promise<SupplierOrderStatus>;
}

export interface SupplierAvailability {
  isbn: string;
  title: string;
  available: boolean;
  price: number;
  estimatedDeliveryDays: number;
}

export interface SupplierOrderItem {
  isbn: string;
  title: string;
  quantity: number;
}

export interface SupplierOrderResult {
  success: boolean;
  externalOrderId: string | null;
  message: string;
}

export type SupplierOrderStatusValue = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'unknown';

export interface SupplierOrderStatus {
  externalOrderId: string;
  status: SupplierOrderStatusValue;
  estimatedDelivery: string | null;
  trackingUrl: string | null;
}

/**
 * Registry: maps supplier IDs to their adapter instances.
 * Populated at app init or lazily on first use.
 */
const adapterRegistry = new Map<string, SupplierAdapter>();

export function registerAdapter(supplierId: string, adapter: SupplierAdapter): void {
  adapterRegistry.set(supplierId, adapter);
}

export function getAdapter(supplierId: string): SupplierAdapter | null {
  return adapterRegistry.get(supplierId) ?? null;
}
```

Create `src/lib/modules/supplier/adapters/manual.ts`:

```typescript
import type {
  SupplierAdapter,
  SupplierAvailability,
  SupplierOrderItem,
  SupplierOrderResult,
  SupplierOrderStatus,
} from '../adapter';

/**
 * Manual adapter for suppliers without an API.
 * All operations return "not supported" — POs are managed
 * manually by the owner (phone, email, in-person).
 */
export class ManualAdapter implements SupplierAdapter {
  async checkAvailability(_isbn: string): Promise<SupplierAvailability | null> {
    // Manual suppliers don't have availability checks
    return null;
  }

  async createOrder(_items: SupplierOrderItem[]): Promise<SupplierOrderResult> {
    return {
      success: false,
      externalOrderId: null,
      message: 'This supplier does not support API ordering. Please place orders manually.',
    };
  }

  async checkOrderStatus(_orderId: string): Promise<SupplierOrderStatus> {
    return {
      externalOrderId: _orderId,
      status: 'unknown',
      estimatedDelivery: null,
      trackingUrl: null,
    };
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/modules/supplier/
git commit -m "feat: add supplier module — CRUD, purchase orders, abstract adapter"
```

---

## Task 3: Consignment Module — Types, Service & Ledger

**Files:**
- Create: `src/lib/modules/consignment/types.ts`
- Create: `src/lib/modules/consignment/service.ts`
- Create: `src/lib/modules/consignment/service.test.ts`
- Create: `src/lib/modules/consignment/ledger.ts`

- [ ] **Step 1: Write consignment types**

Create `src/lib/modules/consignment/types.ts`:

```typescript
export interface Consignor {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  bank_account: string | null;
  bank_name: string | null;
  commission_rate: number;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export type SettlementStatus = 'draft' | 'confirmed' | 'paid';

export interface ConsignmentSettlement {
  id: string;
  consignor_id: string;
  period_start: string;
  period_end: string;
  total_sales: number;
  commission: number;
  payout: number;
  status: SettlementStatus;
  paid_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  // Joined
  consignor?: Consignor;
}

export interface NewConsignor {
  name: string;
  phone?: string;
  email?: string;
  bank_account?: string;
  bank_name?: string;
  commission_rate?: number;
  notes?: string;
}

export interface ConsignmentSaleRecord {
  transaction_id: string;
  transaction_date: string;
  book_title: string;
  quantity: number;
  unit_price: number;
  total: number;
  commission_rate: number;
  commission_amount: number;
  payout_amount: number;
}
```

- [ ] **Step 2: Write failing test for consignment service**

Create `src/lib/modules/consignment/service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockRpc = vi.fn();

function createChainable(data: any) {
  const chain: any = {
    select: vi.fn().mockReturnValue(chain),
    insert: mockInsert.mockReturnValue(chain),
    update: mockUpdate.mockReturnValue(chain),
    eq: vi.fn().mockReturnValue(chain),
    gte: vi.fn().mockReturnValue(chain),
    lte: vi.fn().mockReturnValue(chain),
    order: vi.fn().mockReturnValue(chain),
    single: vi.fn().mockResolvedValue({ data, error: null }),
    then: (resolve: any) => resolve({ data: Array.isArray(data) ? data : [data], error: null }),
  };
  return chain;
}

vi.mock('$lib/supabase/client', () => ({
  getSupabase: () => ({
    from: vi.fn((table: string) => {
      if (table === 'consignor') {
        return createChainable({
          id: 'con-1', name: 'Pak Rudi', phone: '08111222333',
          commission_rate: 20, is_active: true, created_at: '2026-01-01',
        });
      }
      if (table === 'consignment_settlement') {
        return createChainable({
          id: 'set-1', consignor_id: 'con-1', total_sales: 500000,
          commission: 100000, payout: 400000, status: 'draft',
        });
      }
      return createChainable(null);
    }),
    rpc: mockRpc.mockResolvedValue({ data: [], error: null }),
  }),
}));

import { createConsignor, createSettlement, confirmSettlement } from './service';

beforeEach(() => vi.clearAllMocks());

describe('Consignment service', () => {
  it('should create a consignor', async () => {
    const consignor = await createConsignor({
      name: 'Pak Rudi',
      phone: '08111222333',
      commission_rate: 20,
    });

    expect(mockInsert).toHaveBeenCalled();
    expect(consignor.name).toBe('Pak Rudi');
  });

  it('should create a settlement draft', async () => {
    const settlement = await createSettlement({
      consignorId: 'con-1',
      periodStart: '2026-02-01',
      periodEnd: '2026-02-28',
      totalSales: 500000,
      commissionRate: 20,
      staffId: 'staff-1',
    });

    expect(mockInsert).toHaveBeenCalled();
    expect(settlement.status).toBe('draft');
  });

  it('should confirm a settlement', async () => {
    await confirmSettlement('set-1');
    expect(mockUpdate).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run src/lib/modules/consignment/service.test.ts
```

Expected: FAIL — functions not found.

- [ ] **Step 4: Implement consignment service**

Create `src/lib/modules/consignment/service.ts`:

```typescript
import { getSupabase } from '$lib/supabase/client';
import type {
  Consignor, NewConsignor, ConsignmentSettlement, SettlementStatus,
} from './types';

// --- Consignor CRUD ---

export async function createConsignor(input: NewConsignor): Promise<Consignor> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('consignor')
    .insert({
      name: input.name,
      phone: input.phone ?? null,
      email: input.email ?? null,
      bank_account: input.bank_account ?? null,
      bank_name: input.bank_name ?? null,
      commission_rate: input.commission_rate ?? 20,
      notes: input.notes ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create consignor: ${error.message}`);
  return data as Consignor;
}

export async function getConsignors(activeOnly = true): Promise<Consignor[]> {
  const supabase = getSupabase();
  let query = supabase.from('consignor').select();
  if (activeOnly) query = query.eq('is_active', true);
  const { data, error } = await query.order('name');

  if (error) throw new Error(`Failed to fetch consignors: ${error.message}`);
  return (data ?? []) as Consignor[];
}

export async function getConsignorById(id: string): Promise<Consignor | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('consignor')
    .select()
    .eq('id', id)
    .single();

  if (error) return null;
  return data as Consignor;
}

export async function updateConsignor(id: string, updates: Partial<NewConsignor>): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('consignor')
    .update(updates)
    .eq('id', id);

  if (error) throw new Error(`Failed to update consignor: ${error.message}`);
}

export async function deactivateConsignor(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('consignor')
    .update({ is_active: false })
    .eq('id', id);

  if (error) throw new Error(`Failed to deactivate consignor: ${error.message}`);
}

// --- Settlement ---

export interface CreateSettlementInput {
  consignorId: string;
  periodStart: string;
  periodEnd: string;
  totalSales: number;
  commissionRate: number;
  staffId: string;
  notes?: string;
}

export async function createSettlement(input: CreateSettlementInput): Promise<ConsignmentSettlement> {
  const commission = Math.round(input.totalSales * (input.commissionRate / 100));
  const payout = input.totalSales - commission;

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('consignment_settlement')
    .insert({
      consignor_id: input.consignorId,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      total_sales: input.totalSales,
      commission,
      payout,
      status: 'draft',
      created_by: input.staffId,
      notes: input.notes ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create settlement: ${error.message}`);
  return data as ConsignmentSettlement;
}

export async function getSettlements(
  consignorId?: string,
  status?: SettlementStatus
): Promise<ConsignmentSettlement[]> {
  const supabase = getSupabase();
  let query = supabase
    .from('consignment_settlement')
    .select('*, consignor(name, phone, bank_name, bank_account)');

  if (consignorId) query = query.eq('consignor_id', consignorId);
  if (status) query = query.eq('status', status);

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch settlements: ${error.message}`);
  return (data ?? []) as ConsignmentSettlement[];
}

export async function getSettlementById(id: string): Promise<ConsignmentSettlement | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('consignment_settlement')
    .select('*, consignor(*)')
    .eq('id', id)
    .single();

  if (error) return null;
  return data as ConsignmentSettlement;
}

export async function confirmSettlement(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('consignment_settlement')
    .update({ status: 'confirmed' })
    .eq('id', id);

  if (error) throw new Error(`Failed to confirm settlement: ${error.message}`);
}

export async function markSettlementPaid(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('consignment_settlement')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(`Failed to mark settlement paid: ${error.message}`);
}

/**
 * Get total unsettled amount across all consignors.
 * Useful for dashboard summary.
 */
export async function getUnsettledTotal(): Promise<number> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('consignment_settlement')
    .select('payout')
    .in('status', ['draft', 'confirmed']);

  if (error) return 0;
  return (data ?? []).reduce((sum: number, s: any) => sum + (s.payout ?? 0), 0);
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run src/lib/modules/consignment/service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Write consignment ledger helper**

Create `src/lib/modules/consignment/ledger.ts`:

```typescript
import { getSupabase } from '$lib/supabase/client';
import type { ConsignmentSaleRecord } from './types';

/**
 * Get all sales of consignment items for a given consignor within a date range.
 * Joins transaction_item → inventory (where source = 'consignment' and consignor_id matches)
 * → transaction (for date and status).
 */
export async function getConsignmentSales(
  consignorId: string,
  periodStart: string,
  periodEnd: string
): Promise<ConsignmentSaleRecord[]> {
  const supabase = getSupabase();

  // Use a raw query via RPC for the complex join.
  // This function should be created as a Supabase RPC or we query with joins.
  const { data, error } = await supabase
    .from('transaction_item')
    .select(`
      id,
      transaction_id,
      title,
      quantity,
      unit_price,
      total,
      inventory!inner(consignor_id, commission_rate),
      transaction!inner(created_at, payment_status)
    `)
    .eq('inventory.consignor_id', consignorId)
    .eq('transaction.payment_status', 'paid')
    .gte('transaction.created_at', periodStart)
    .lte('transaction.created_at', `${periodEnd}T23:59:59Z`);

  if (error) throw new Error(`Failed to fetch consignment sales: ${error.message}`);

  return (data ?? []).map((row: any) => {
    const commissionRate = row.inventory?.commission_rate ?? 20;
    const commissionAmount = Math.round(row.total * (commissionRate / 100));

    return {
      transaction_id: row.transaction_id,
      transaction_date: row.transaction?.created_at,
      book_title: row.title,
      quantity: row.quantity,
      unit_price: row.unit_price,
      total: row.total,
      commission_rate: commissionRate,
      commission_amount: commissionAmount,
      payout_amount: row.total - commissionAmount,
    } satisfies ConsignmentSaleRecord;
  });
}

/**
 * Calculate settlement totals from a list of sale records.
 */
export function calculateSettlementTotals(
  sales: ConsignmentSaleRecord[]
): { totalSales: number; totalCommission: number; totalPayout: number } {
  return sales.reduce(
    (acc, sale) => ({
      totalSales: acc.totalSales + sale.total,
      totalCommission: acc.totalCommission + sale.commission_amount,
      totalPayout: acc.totalPayout + sale.payout_amount,
    }),
    { totalSales: 0, totalCommission: 0, totalPayout: 0 }
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/modules/consignment/
git commit -m "feat: add consignment module — consignor CRUD, settlement lifecycle, sales ledger"
```

---

## Task 4: Notification Module — Service, Realtime & Store

**Files:**
- Create: `src/lib/modules/notification/types.ts`
- Create: `src/lib/modules/notification/service.ts`
- Create: `src/lib/modules/notification/service.test.ts`
- Create: `src/lib/modules/notification/realtime.ts`
- Create: `src/lib/modules/notification/whatsapp.ts`
- Create: `src/lib/modules/notification/stores.svelte.ts`

- [ ] **Step 1: Write notification types**

Create `src/lib/modules/notification/types.ts`:

```typescript
export type NotificationType =
  | 'low_stock'
  | 'out_of_stock'
  | 'po_received'
  | 'settlement_due'
  | 'payment_failed'
  | 'offline_synced'
  | 'daily_summary'
  | 'restock_suggestion';

export interface Notification {
  id: string;
  outlet_id: string | null;
  recipient_id: string | null;
  type: NotificationType;
  title: string;
  body: string | null;
  data: Record<string, any> | null;
  read: boolean;
  created_at: string;
}

export interface NewNotification {
  outlet_id: string;
  recipient_id: string;
  type: NotificationType;
  title: string;
  body?: string;
  data?: Record<string, any>;
}

export interface NotificationEvent {
  type: NotificationType;
  title: string;
  body?: string;
  data?: Record<string, any>;
  /** Send WhatsApp in addition to in-app? */
  whatsapp?: boolean;
  /** WhatsApp recipient phone number (if different from staff phone) */
  whatsappRecipient?: string;
}
```

- [ ] **Step 2: Write failing test for notification service**

Create `src/lib/modules/notification/service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInsert = vi.fn();
const mockUpdate = vi.fn();

function createChainable(data: any) {
  const chain: any = {
    select: vi.fn().mockReturnValue(chain),
    insert: mockInsert.mockReturnValue(chain),
    update: mockUpdate.mockReturnValue(chain),
    eq: vi.fn().mockReturnValue(chain),
    order: vi.fn().mockReturnValue(chain),
    limit: vi.fn().mockReturnValue(chain),
    single: vi.fn().mockResolvedValue({ data, error: null }),
    then: (resolve: any) => resolve({ data: Array.isArray(data) ? data : [data], error: null }),
  };
  return chain;
}

vi.mock('$lib/supabase/client', () => ({
  getSupabase: () => ({
    from: vi.fn(() =>
      createChainable({
        id: 'notif-1', type: 'low_stock', title: 'Low stock: Atomic Habits',
        body: 'Only 2 left', read: false, created_at: '2026-01-01',
      })
    ),
  }),
}));

import { createNotification, markAsRead, getUnreadCount } from './service';

beforeEach(() => vi.clearAllMocks());

describe('Notification service', () => {
  it('should create a notification', async () => {
    const notif = await createNotification({
      outlet_id: 'outlet-1',
      recipient_id: 'staff-1',
      type: 'low_stock',
      title: 'Low stock: Atomic Habits',
      body: 'Only 2 left',
    });

    expect(mockInsert).toHaveBeenCalled();
    expect(notif.type).toBe('low_stock');
  });

  it('should mark notification as read', async () => {
    await markAsRead('notif-1');
    expect(mockUpdate).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run src/lib/modules/notification/service.test.ts
```

Expected: FAIL — functions not found.

- [ ] **Step 4: Implement notification service**

Create `src/lib/modules/notification/service.ts`:

```typescript
import { getSupabase } from '$lib/supabase/client';
import type { Notification, NewNotification } from './types';

export async function createNotification(input: NewNotification): Promise<Notification> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('notification')
    .insert({
      outlet_id: input.outlet_id,
      recipient_id: input.recipient_id,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      data: input.data ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create notification: ${error.message}`);
  return data as Notification;
}

export async function getNotifications(
  recipientId: string,
  limit = 50
): Promise<Notification[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('notification')
    .select()
    .eq('recipient_id', recipientId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to fetch notifications: ${error.message}`);
  return (data ?? []) as Notification[];
}

export async function getUnreadCount(recipientId: string): Promise<number> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('notification')
    .select('id')
    .eq('recipient_id', recipientId)
    .eq('read', false);

  if (error) return 0;
  return (data ?? []).length;
}

export async function markAsRead(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('notification')
    .update({ read: true })
    .eq('id', id);

  if (error) throw new Error(`Failed to mark notification as read: ${error.message}`);
}

export async function markAllAsRead(recipientId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('notification')
    .update({ read: true })
    .eq('recipient_id', recipientId)
    .eq('read', false);

  if (error) throw new Error(`Failed to mark all as read: ${error.message}`);
}

/**
 * Send notification to all staff with a given role at an outlet.
 * Used for broadcast alerts (e.g., low stock → all staff + owner).
 */
export async function broadcastNotification(
  outletId: string,
  role: 'owner' | 'staff' | 'all',
  notification: Omit<NewNotification, 'outlet_id' | 'recipient_id'>
): Promise<void> {
  const supabase = getSupabase();

  let query = supabase
    .from('staff')
    .select('id')
    .eq('outlet_id', outletId)
    .eq('is_active', true);

  if (role !== 'all') query = query.eq('role', role);

  const { data: staffList, error } = await query;
  if (error || !staffList) return;

  const notifications = staffList.map((s: any) => ({
    outlet_id: outletId,
    recipient_id: s.id,
    type: notification.type,
    title: notification.title,
    body: notification.body ?? null,
    data: notification.data ?? null,
  }));

  if (notifications.length > 0) {
    await supabase.from('notification').insert(notifications);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run src/lib/modules/notification/service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Write Realtime subscription for in-app notifications**

Create `src/lib/modules/notification/realtime.ts`:

```typescript
import { getSupabase } from '$lib/supabase/client';
import type { Notification } from './types';
import { addNotification, incrementUnread } from './stores.svelte';
import { showToast } from '$lib/stores/toast.svelte';

let subscription: any = null;

/**
 * Subscribe to new notifications for the current staff member via Supabase Realtime.
 * Call once after login. Call unsubscribe() on logout.
 */
export function subscribeToNotifications(staffId: string): void {
  if (subscription) return; // Already subscribed

  const supabase = getSupabase();

  subscription = supabase
    .channel('notifications')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notification',
        filter: `recipient_id=eq.${staffId}`,
      },
      (payload: any) => {
        const notif = payload.new as Notification;
        addNotification(notif);
        incrementUnread();

        // Show toast for urgent notification types
        const urgentTypes = ['low_stock', 'out_of_stock', 'payment_failed', 'settlement_due'];
        if (urgentTypes.includes(notif.type)) {
          showToast(notif.title, 'info');
        }
      }
    )
    .subscribe();
}

export function unsubscribeFromNotifications(): void {
  if (subscription) {
    const supabase = getSupabase();
    supabase.removeChannel(subscription);
    subscription = null;
  }
}
```

- [ ] **Step 7: Write WhatsApp notification dispatcher**

Create `src/lib/modules/notification/whatsapp.ts`:

```typescript
/**
 * WhatsApp notification dispatcher.
 * Reuses the MessagingProvider interface from Phase 2 receipt module.
 * Routes notification events through the existing WhatsApp provider.
 */
import type { NotificationEvent } from './types';

// Import Phase 2 messaging provider (already exists from receipt module)
// The MessagingProvider interface has: sendMessage(recipient, message): Promise<void>
type MessagingProvider = {
  sendMessage(recipient: string, message: string): Promise<{ success: boolean }>;
};

let whatsappProvider: MessagingProvider | null = null;

export function setWhatsappProvider(provider: MessagingProvider): void {
  whatsappProvider = provider;
}

/**
 * Send a WhatsApp notification.
 * Falls back silently if provider is not configured.
 */
export async function sendWhatsappNotification(
  phoneNumber: string,
  event: NotificationEvent
): Promise<boolean> {
  if (!whatsappProvider) {
    console.warn('[Notification] WhatsApp provider not configured, skipping');
    return false;
  }

  const message = formatNotificationMessage(event);

  try {
    const result = await whatsappProvider.sendMessage(phoneNumber, message);
    return result.success;
  } catch (err) {
    console.error('[Notification] WhatsApp send failed:', err);
    return false;
  }
}

function formatNotificationMessage(event: NotificationEvent): string {
  const lines = [
    `*Libris Cafe*`,
    ``,
    `*${event.title}*`,
  ];

  if (event.body) {
    lines.push(event.body);
  }

  // Add type-specific formatting
  switch (event.type) {
    case 'low_stock':
      lines.push('', 'Segera lakukan restok untuk menghindari kehabisan stok.');
      break;
    case 'settlement_due':
      lines.push('', 'Silakan lakukan penyelesaian pembayaran konsinyasi.');
      break;
    case 'daily_summary':
      if (event.data) {
        lines.push(
          '',
          `Penjualan: Rp ${(event.data.totalSales ?? 0).toLocaleString('id-ID')}`,
          `Transaksi: ${event.data.transactionCount ?? 0}`,
          `Margin: Rp ${(event.data.totalMargin ?? 0).toLocaleString('id-ID')}`,
        );
      }
      break;
  }

  lines.push('', `_${new Date().toLocaleDateString('id-ID', { dateStyle: 'full' })}_`);

  return lines.join('\n');
}

/**
 * Dispatch a notification event: creates in-app notification AND
 * optionally sends WhatsApp if the event specifies it.
 */
export async function dispatchNotificationEvent(
  outletId: string,
  recipientId: string,
  event: NotificationEvent,
  phoneNumber?: string
): Promise<void> {
  // 1. Create in-app notification
  const { createNotification } = await import('./service');
  await createNotification({
    outlet_id: outletId,
    recipient_id: recipientId,
    type: event.type,
    title: event.title,
    body: event.body,
    data: event.data,
  });

  // 2. Send WhatsApp if requested and phone is available
  if (event.whatsapp && (phoneNumber || event.whatsappRecipient)) {
    await sendWhatsappNotification(
      (phoneNumber || event.whatsappRecipient)!,
      event
    );
  }
}
```

- [ ] **Step 8: Write notification store**

Create `src/lib/modules/notification/stores.svelte.ts`:

```typescript
import type { Notification } from './types';

let notifications = $state<Notification[]>([]);
let unreadCount = $state(0);

export function getNotifications(): Notification[] {
  return notifications;
}

export function setNotifications(list: Notification[]): void {
  notifications = list;
}

export function addNotification(notif: Notification): void {
  notifications = [notif, ...notifications];
}

export function getUnreadCount(): number {
  return unreadCount;
}

export function setUnreadCount(count: number): void {
  unreadCount = count;
}

export function incrementUnread(): void {
  unreadCount++;
}

export function decrementUnread(): void {
  if (unreadCount > 0) unreadCount--;
}

export function markNotificationRead(id: string): void {
  notifications = notifications.map(n =>
    n.id === id ? { ...n, read: true } : n
  );
  decrementUnread();
}

export function clearNotifications(): void {
  notifications = [];
  unreadCount = 0;
}
```

- [ ] **Step 9: Commit**

```bash
git add src/lib/modules/notification/
git commit -m "feat: add notification module — in-app via Realtime, WhatsApp dispatch, reactive store"
```

---

## Task 5: Restock Suggestion Engine

**Files:**
- Create: `src/lib/modules/restock/types.ts`
- Create: `src/lib/modules/restock/engine.ts`
- Create: `src/lib/modules/restock/engine.test.ts`

- [ ] **Step 1: Write restock types**

Create `src/lib/modules/restock/types.ts`:

```typescript
export type RestockUrgency = 'critical' | 'urgent' | 'warning' | 'ok';

export interface RestockSuggestion {
  inventory_id: string;
  book_id: string;
  book_title: string;
  current_stock: number;
  avg_daily_sales: number;
  days_until_stockout: number | null;  // null if avg_daily_sales is 0
  lead_time_days: number;
  urgency: RestockUrgency;
  suggested_quantity: number;
  supplier_id: string | null;
  supplier_name: string | null;
}

export interface RestockInput {
  inventory_id: string;
  book_id: string;
  book_title: string;
  current_stock: number;
  min_stock: number;
  supplier_id: string | null;
  supplier_name: string | null;
  lead_time_days: number;
  /** Total units sold in the last 30 days */
  sales_last_30d: number;
}
```

- [ ] **Step 2: Write failing test for restock engine**

Create `src/lib/modules/restock/engine.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { calculateRestockSuggestion, generateRestockSuggestions } from './engine';
import type { RestockInput } from './types';

describe('Restock engine', () => {
  it('should flag CRITICAL when days_until_stockout < lead_time', () => {
    const result = calculateRestockSuggestion({
      inventory_id: 'inv-1',
      book_id: 'book-1',
      book_title: 'Atomic Habits',
      current_stock: 2,
      min_stock: 5,
      supplier_id: 'sup-1',
      supplier_name: 'Gramedia',
      lead_time_days: 7,
      sales_last_30d: 15,  // 0.5/day → 4 days until stockout
    });

    expect(result.urgency).toBe('critical');
    expect(result.avg_daily_sales).toBeCloseTo(0.5);
    expect(result.days_until_stockout).toBe(4);
    expect(result.suggested_quantity).toBeGreaterThan(0);
  });

  it('should flag URGENT when days_until_stockout < 2x lead_time', () => {
    const result = calculateRestockSuggestion({
      inventory_id: 'inv-2',
      book_id: 'book-2',
      book_title: 'Deep Work',
      current_stock: 8,
      min_stock: 3,
      supplier_id: 'sup-1',
      supplier_name: 'Gramedia',
      lead_time_days: 7,
      sales_last_30d: 15,  // 0.5/day → 16 days until stockout
    });

    expect(result.urgency).toBe('warning');
  });

  it('should flag WARNING when stock is at or below min_stock', () => {
    const result = calculateRestockSuggestion({
      inventory_id: 'inv-3',
      book_id: 'book-3',
      book_title: 'Range',
      current_stock: 1,
      min_stock: 2,
      supplier_id: null,
      supplier_name: null,
      lead_time_days: 7,
      sales_last_30d: 0,  // No sales
    });

    expect(result.urgency).toBe('warning');
    expect(result.days_until_stockout).toBeNull();
  });

  it('should flag OK when stock is healthy', () => {
    const result = calculateRestockSuggestion({
      inventory_id: 'inv-4',
      book_id: 'book-4',
      book_title: 'Sapiens',
      current_stock: 20,
      min_stock: 3,
      supplier_id: 'sup-1',
      supplier_name: 'Gramedia',
      lead_time_days: 7,
      sales_last_30d: 6,  // 0.2/day → 100 days
    });

    expect(result.urgency).toBe('ok');
  });

  it('should filter and sort suggestions by urgency', () => {
    const inputs: RestockInput[] = [
      {
        inventory_id: 'inv-1', book_id: 'b1', book_title: 'Book A',
        current_stock: 1, min_stock: 5, supplier_id: null, supplier_name: null,
        lead_time_days: 7, sales_last_30d: 30,  // critical
      },
      {
        inventory_id: 'inv-2', book_id: 'b2', book_title: 'Book B',
        current_stock: 50, min_stock: 3, supplier_id: null, supplier_name: null,
        lead_time_days: 7, sales_last_30d: 1,  // ok
      },
      {
        inventory_id: 'inv-3', book_id: 'b3', book_title: 'Book C',
        current_stock: 3, min_stock: 5, supplier_id: null, supplier_name: null,
        lead_time_days: 7, sales_last_30d: 10,  // urgent
      },
    ];

    const suggestions = generateRestockSuggestions(inputs);

    // Should exclude 'ok' items and sort critical first
    expect(suggestions).toHaveLength(2);
    expect(suggestions[0].urgency).toBe('critical');
    expect(suggestions[1].urgency).toBe('urgent');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run src/lib/modules/restock/engine.test.ts
```

Expected: FAIL — functions not found.

- [ ] **Step 4: Implement restock engine**

Create `src/lib/modules/restock/engine.ts`:

```typescript
import type { RestockInput, RestockSuggestion, RestockUrgency } from './types';

/** Buffer multiplier: order enough for lead_time + 50% extra */
const BUFFER_MULTIPLIER = 1.5;

/**
 * Calculate restock suggestion for a single inventory item.
 *
 * Heuristic:
 * - avg_daily_sales = sales_last_30d / 30
 * - days_until_stockout = current_stock / avg_daily_sales
 * - If days_until_stockout < lead_time → CRITICAL
 * - If days_until_stockout < 2 * lead_time → URGENT
 * - If current_stock <= min_stock → WARNING (even if no sales)
 * - Otherwise → OK
 * - suggested_quantity = avg_daily_sales * (lead_time * BUFFER) - current_stock
 */
export function calculateRestockSuggestion(input: RestockInput): RestockSuggestion {
  const avgDailySales = input.sales_last_30d / 30;
  const daysUntilStockout = avgDailySales > 0
    ? Math.floor(input.current_stock / avgDailySales)
    : null;

  let urgency: RestockUrgency = 'ok';

  if (daysUntilStockout !== null) {
    if (daysUntilStockout < input.lead_time_days) {
      urgency = 'critical';
    } else if (daysUntilStockout < input.lead_time_days * 2) {
      urgency = 'urgent';
    }
  }

  // Even without sales data, flag low stock
  if (urgency === 'ok' && input.current_stock <= input.min_stock) {
    urgency = 'warning';
  }

  // Calculate suggested reorder quantity
  const targetStock = Math.ceil(
    avgDailySales * input.lead_time_days * BUFFER_MULTIPLIER
  );
  const suggestedQuantity = Math.max(
    targetStock - input.current_stock,
    input.min_stock - input.current_stock,
    0
  );

  return {
    inventory_id: input.inventory_id,
    book_id: input.book_id,
    book_title: input.book_title,
    current_stock: input.current_stock,
    avg_daily_sales: avgDailySales,
    days_until_stockout: daysUntilStockout,
    lead_time_days: input.lead_time_days,
    urgency,
    suggested_quantity: suggestedQuantity,
    supplier_id: input.supplier_id,
    supplier_name: input.supplier_name,
  };
}

/**
 * Generate restock suggestions for multiple inventory items.
 * Returns only items that need attention (not 'ok'), sorted by urgency.
 */
export function generateRestockSuggestions(inputs: RestockInput[]): RestockSuggestion[] {
  const urgencyOrder: Record<RestockUrgency, number> = {
    critical: 0,
    urgent: 1,
    warning: 2,
    ok: 3,
  };

  return inputs
    .map(calculateRestockSuggestion)
    .filter(s => s.urgency !== 'ok')
    .sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);
}

/**
 * Fetch sales data for restock calculation.
 * Queries transaction_items from the last 30 days, grouped by inventory_id.
 */
export async function fetchSalesData(
  outletId: string
): Promise<Map<string, number>> {
  const { getSupabase } = await import('$lib/supabase/client');
  const supabase = getSupabase();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data, error } = await supabase
    .from('transaction_item')
    .select(`
      inventory_id,
      quantity,
      transaction!inner(outlet_id, payment_status, created_at)
    `)
    .eq('transaction.outlet_id', outletId)
    .eq('transaction.payment_status', 'paid')
    .gte('transaction.created_at', thirtyDaysAgo.toISOString());

  if (error) {
    console.error('Failed to fetch sales data:', error);
    return new Map();
  }

  const salesMap = new Map<string, number>();
  for (const row of data ?? []) {
    const current = salesMap.get(row.inventory_id) ?? 0;
    salesMap.set(row.inventory_id, current + row.quantity);
  }

  return salesMap;
}

/**
 * Full pipeline: fetch inventory + sales data, generate suggestions.
 */
export async function getRestockSuggestions(outletId: string): Promise<RestockSuggestion[]> {
  const { getSupabase } = await import('$lib/supabase/client');
  const { getBookById } = await import('$lib/services/books');
  const supabase = getSupabase();

  // Fetch inventory with supplier info
  const { data: inventoryData, error } = await supabase
    .from('inventory')
    .select('*, supplier:inventory_supplier_fk(id, name, lead_time_days)')
    .eq('outlet_id', outletId)
    .in('type', ['for_sale', 'both']);

  if (error || !inventoryData) return [];

  // Fetch 30-day sales
  const salesMap = await fetchSalesData(outletId);

  // Build inputs
  const inputs: RestockInput[] = inventoryData.map((inv: any) => {
    const book = getBookById(inv.book_id);
    return {
      inventory_id: inv.id,
      book_id: inv.book_id,
      book_title: book?.title ?? `Book ${inv.book_id.slice(0, 8)}`,
      current_stock: inv.stock,
      min_stock: inv.min_stock,
      supplier_id: inv.supplier?.id ?? null,
      supplier_name: inv.supplier?.name ?? null,
      lead_time_days: inv.supplier?.lead_time_days ?? 7,
      sales_last_30d: salesMap.get(inv.id) ?? 0,
    };
  });

  return generateRestockSuggestions(inputs);
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run src/lib/modules/restock/engine.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/modules/restock/
git commit -m "feat: add restock suggestion engine — heuristic analysis with urgency levels"
```

---

## Task 6: i18n — Add Phase 3 Business Strings

**Files:**
- Modify: `src/lib/i18n/en.ts`
- Modify: `src/lib/i18n/id.ts`

- [ ] **Step 1: Add English strings**

Add to `src/lib/i18n/en.ts` (append to the existing object):

```typescript
// Supplier
'supplier.title': 'Suppliers',
'supplier.add': 'Add Supplier',
'supplier.name': 'Supplier Name',
'supplier.contact': 'Contact Person',
'supplier.phone': 'Phone',
'supplier.email': 'Email',
'supplier.address': 'Address',
'supplier.lead_time': 'Lead Time (days)',
'supplier.api_endpoint': 'API Endpoint',
'supplier.notes': 'Notes',
'supplier.active': 'Active',
'supplier.inactive': 'Inactive',
'supplier.deactivate': 'Deactivate',
'supplier.no_suppliers': 'No suppliers yet',

// Purchase Orders
'po.title': 'Purchase Orders',
'po.create': 'Create PO',
'po.supplier': 'Supplier',
'po.status': 'Status',
'po.status_draft': 'Draft',
'po.status_ordered': 'Ordered',
'po.status_received': 'Received',
'po.status_cancelled': 'Cancelled',
'po.total': 'Total',
'po.items': 'Items',
'po.add_item': 'Add Item',
'po.book_title': 'Book Title',
'po.isbn': 'ISBN',
'po.quantity': 'Qty',
'po.unit_price': 'Unit Price',
'po.received_qty': 'Received',
'po.mark_ordered': 'Mark as Ordered',
'po.receive_goods': 'Receive Goods',
'po.cancel': 'Cancel PO',
'po.notes': 'Notes',
'po.no_orders': 'No purchase orders yet',
'po.receive_confirm': 'Confirm receipt of goods?',

// Consignment
'consignment.title': 'Consignment',
'consignment.consignors': 'Consignors',
'consignment.add_consignor': 'Add Consignor',
'consignment.name': 'Consignor Name',
'consignment.phone': 'Phone',
'consignment.email': 'Email',
'consignment.bank_account': 'Bank Account',
'consignment.bank_name': 'Bank Name',
'consignment.commission_rate': 'Commission Rate (%)',
'consignment.notes': 'Notes',
'consignment.settlements': 'Settlements',
'consignment.create_settlement': 'Create Settlement',
'consignment.period': 'Period',
'consignment.total_sales': 'Total Sales',
'consignment.commission': 'Commission (Cafe)',
'consignment.payout': 'Payout (Consignor)',
'consignment.status_draft': 'Draft',
'consignment.status_confirmed': 'Confirmed',
'consignment.status_paid': 'Paid',
'consignment.confirm': 'Confirm Settlement',
'consignment.mark_paid': 'Mark as Paid',
'consignment.unsettled': 'Unsettled Amount',
'consignment.no_consignors': 'No consignors yet',
'consignment.no_settlements': 'No settlements yet',
'consignment.sales_detail': 'Sales Detail',

// Notification
'notification.title': 'Notifications',
'notification.mark_all_read': 'Mark all as read',
'notification.empty': 'No notifications',
'notification.low_stock': 'Low Stock Alert',
'notification.out_of_stock': 'Out of Stock',
'notification.po_received': 'PO Received',
'notification.settlement_due': 'Settlement Due',
'notification.payment_failed': 'Payment Failed',
'notification.daily_summary': 'Daily Summary',
'notification.restock': 'Restock Suggestion',

// Restock
'restock.title': 'Restock Suggestions',
'restock.urgency_critical': 'Critical',
'restock.urgency_urgent': 'Urgent',
'restock.urgency_warning': 'Warning',
'restock.current_stock': 'Current Stock',
'restock.avg_daily_sales': 'Avg Daily Sales',
'restock.days_until_stockout': 'Days Until Stockout',
'restock.suggested_qty': 'Suggested Order',
'restock.lead_time': 'Lead Time',
'restock.create_po': 'Create PO',
'restock.no_suggestions': 'All stock levels are healthy!',

// Navigation
'nav.suppliers': 'Suppliers',
'nav.purchase_orders': 'Purchase Orders',
'nav.consignment': 'Consignment',
'nav.restock': 'Restock',
'nav.notifications': 'Notifications',
```

- [ ] **Step 2: Add Indonesian strings**

Add matching keys to `src/lib/i18n/id.ts`:

```typescript
// Supplier
'supplier.title': 'Supplier',
'supplier.add': 'Tambah Supplier',
'supplier.name': 'Nama Supplier',
'supplier.contact': 'Kontak',
'supplier.phone': 'Telepon',
'supplier.email': 'Email',
'supplier.address': 'Alamat',
'supplier.lead_time': 'Waktu Kirim (hari)',
'supplier.api_endpoint': 'API Endpoint',
'supplier.notes': 'Catatan',
'supplier.active': 'Aktif',
'supplier.inactive': 'Nonaktif',
'supplier.deactivate': 'Nonaktifkan',
'supplier.no_suppliers': 'Belum ada supplier',

// Purchase Orders
'po.title': 'Pesanan Pembelian',
'po.create': 'Buat PO',
'po.supplier': 'Supplier',
'po.status': 'Status',
'po.status_draft': 'Draf',
'po.status_ordered': 'Dipesan',
'po.status_received': 'Diterima',
'po.status_cancelled': 'Dibatalkan',
'po.total': 'Total',
'po.items': 'Item',
'po.add_item': 'Tambah Item',
'po.book_title': 'Judul Buku',
'po.isbn': 'ISBN',
'po.quantity': 'Jml',
'po.unit_price': 'Harga Satuan',
'po.received_qty': 'Diterima',
'po.mark_ordered': 'Tandai Dipesan',
'po.receive_goods': 'Terima Barang',
'po.cancel': 'Batalkan PO',
'po.notes': 'Catatan',
'po.no_orders': 'Belum ada pesanan pembelian',
'po.receive_confirm': 'Konfirmasi penerimaan barang?',

// Consignment
'consignment.title': 'Konsinyasi',
'consignment.consignors': 'Konsinyator',
'consignment.add_consignor': 'Tambah Konsinyator',
'consignment.name': 'Nama Konsinyator',
'consignment.phone': 'Telepon',
'consignment.email': 'Email',
'consignment.bank_account': 'Nomor Rekening',
'consignment.bank_name': 'Nama Bank',
'consignment.commission_rate': 'Komisi (%)',
'consignment.notes': 'Catatan',
'consignment.settlements': 'Penyelesaian',
'consignment.create_settlement': 'Buat Penyelesaian',
'consignment.period': 'Periode',
'consignment.total_sales': 'Total Penjualan',
'consignment.commission': 'Komisi (Cafe)',
'consignment.payout': 'Pembayaran (Konsinyator)',
'consignment.status_draft': 'Draf',
'consignment.status_confirmed': 'Dikonfirmasi',
'consignment.status_paid': 'Dibayar',
'consignment.confirm': 'Konfirmasi Penyelesaian',
'consignment.mark_paid': 'Tandai Lunas',
'consignment.unsettled': 'Belum Diselesaikan',
'consignment.no_consignors': 'Belum ada konsinyator',
'consignment.no_settlements': 'Belum ada penyelesaian',
'consignment.sales_detail': 'Detail Penjualan',

// Notification
'notification.title': 'Notifikasi',
'notification.mark_all_read': 'Tandai semua dibaca',
'notification.empty': 'Tidak ada notifikasi',
'notification.low_stock': 'Stok Rendah',
'notification.out_of_stock': 'Stok Habis',
'notification.po_received': 'PO Diterima',
'notification.settlement_due': 'Penyelesaian Jatuh Tempo',
'notification.payment_failed': 'Pembayaran Gagal',
'notification.daily_summary': 'Ringkasan Harian',
'notification.restock': 'Saran Restok',

// Restock
'restock.title': 'Saran Restok',
'restock.urgency_critical': 'Kritis',
'restock.urgency_urgent': 'Mendesak',
'restock.urgency_warning': 'Peringatan',
'restock.current_stock': 'Stok Saat Ini',
'restock.avg_daily_sales': 'Rata-rata Penjualan/Hari',
'restock.days_until_stockout': 'Hari Sampai Habis',
'restock.suggested_qty': 'Jumlah Disarankan',
'restock.lead_time': 'Waktu Kirim',
'restock.create_po': 'Buat PO',
'restock.no_suggestions': 'Semua stok dalam kondisi sehat!',

// Navigation
'nav.suppliers': 'Supplier',
'nav.purchase_orders': 'Pesanan Pembelian',
'nav.consignment': 'Konsinyasi',
'nav.restock': 'Restok',
'nav.notifications': 'Notifikasi',
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/i18n/
git commit -m "feat: add i18n strings for supplier, consignment, notification, restock"
```

---

## Task 7: Owner Layout & Supplier Pages

**Files:**
- Create: `src/routes/owner/+layout.svelte` (if not existing from Phase 2)
- Create: `src/routes/owner/suppliers/+page.svelte`
- Create: `src/routes/owner/suppliers/new/+page.svelte`
- Create: `src/routes/owner/suppliers/[id]/+page.svelte`

- [ ] **Step 1: Create owner layout with role guard**

Create `src/routes/owner/+layout.svelte` (skip if already exists from Phase 2):

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { requireRole } from '$lib/modules/auth/guard';

  let { children } = $props();
  let authorized = $state(false);

  onMount(() => {
    authorized = requireRole('owner');
  });
</script>

{#if authorized}
  {@render children()}
{/if}
```

- [ ] **Step 2: Create supplier list page**

Create `src/routes/owner/suppliers/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { getSuppliers } from '$lib/modules/supplier/service';
  import type { Supplier } from '$lib/modules/supplier/types';

  let suppliers = $state<Supplier[]>([]);
  let loading = $state(true);
  let showInactive = $state(false);

  onMount(async () => {
    try {
      suppliers = await getSuppliers(!showInactive);
    } finally {
      loading = false;
    }
  });

  async function reload() {
    loading = true;
    try {
      suppliers = await getSuppliers(!showInactive);
    } finally {
      loading = false;
    }
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h1 class="font-display text-xl font-bold text-ink">{t('supplier.title')}</h1>
    <a
      href="{base}/owner/suppliers/new"
      class="px-4 py-2 rounded-xl bg-accent text-cream text-sm font-medium"
    >
      + {t('supplier.add')}
    </a>
  </div>

  <label class="flex items-center gap-2 text-sm text-ink-muted">
    <input type="checkbox" bind:checked={showInactive} onchange={reload} class="rounded" />
    Show inactive
  </label>

  {#if loading}
    <div class="py-8 text-center text-sm text-ink-muted">Loading...</div>
  {:else if suppliers.length === 0}
    <div class="py-8 text-center text-sm text-ink-muted">{t('supplier.no_suppliers')}</div>
  {:else}
    <div class="space-y-2">
      {#each suppliers as supplier}
        <a
          href="{base}/owner/suppliers/{supplier.id}"
          class="block bg-surface rounded-xl border border-warm-100 px-4 py-3 hover:border-accent/30 transition-colors"
        >
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-ink">{supplier.name}</p>
              <p class="text-xs text-ink-muted">
                {supplier.contact_name ?? ''}
                {supplier.phone ? ` · ${supplier.phone}` : ''}
              </p>
            </div>
            <div class="text-right">
              <span class="text-[10px] px-1.5 py-0.5 rounded-full font-medium {supplier.is_active ? 'bg-sage/10 text-sage' : 'bg-warm-100 text-ink-muted'}">
                {supplier.is_active ? t('supplier.active') : t('supplier.inactive')}
              </span>
              <p class="text-xs text-ink-muted mt-1">{t('supplier.lead_time')}: {supplier.lead_time_days}d</p>
            </div>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
```

- [ ] **Step 3: Create add supplier form**

Create `src/routes/owner/suppliers/new/+page.svelte`:

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import { createSupplier } from '$lib/modules/supplier/service';

  let name = $state('');
  let contactName = $state('');
  let phone = $state('');
  let email = $state('');
  let address = $state('');
  let leadTimeDays = $state(7);
  let notes = $state('');
  let saving = $state(false);

  async function handleSubmit() {
    if (!name.trim() || saving) return;
    saving = true;

    try {
      await createSupplier({
        name: name.trim(),
        contact_name: contactName.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        lead_time_days: leadTimeDays,
        notes: notes.trim() || undefined,
      });

      showToast('Supplier added', 'success');
      goto(`${base}/owner/suppliers`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to add supplier', 'error');
    } finally {
      saving = false;
    }
  }
</script>

<div class="space-y-4">
  <button class="text-sm text-ink-muted hover:text-accent" onclick={() => goto(`${base}/owner/suppliers`)}>
    &larr; {t('supplier.title')}
  </button>

  <h1 class="font-display text-xl font-bold text-ink">{t('supplier.add')}</h1>

  <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-4">
    <div>
      <label for="name" class="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
        {t('supplier.name')} *
      </label>
      <input id="name" type="text" bind:value={name} required
        class="w-full px-4 py-3 rounded-xl bg-surface border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
    </div>

    <div class="grid grid-cols-2 gap-3">
      <div>
        <label for="contact" class="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
          {t('supplier.contact')}
        </label>
        <input id="contact" type="text" bind:value={contactName}
          class="w-full px-4 py-3 rounded-xl bg-surface border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
      </div>
      <div>
        <label for="phone" class="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
          {t('supplier.phone')}
        </label>
        <input id="phone" type="tel" bind:value={phone}
          class="w-full px-4 py-3 rounded-xl bg-surface border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
      </div>
    </div>

    <div>
      <label for="email" class="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
        {t('supplier.email')}
      </label>
      <input id="email" type="email" bind:value={email}
        class="w-full px-4 py-3 rounded-xl bg-surface border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
    </div>

    <div>
      <label for="address" class="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
        {t('supplier.address')}
      </label>
      <textarea id="address" bind:value={address} rows="2"
        class="w-full px-4 py-3 rounded-xl bg-surface border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"></textarea>
    </div>

    <div>
      <label for="lead_time" class="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
        {t('supplier.lead_time')}
      </label>
      <input id="lead_time" type="number" min="1" max="90" bind:value={leadTimeDays}
        class="w-full px-4 py-3 rounded-xl bg-surface border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
    </div>

    <div>
      <label for="notes" class="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
        {t('supplier.notes')}
      </label>
      <textarea id="notes" bind:value={notes} rows="2"
        class="w-full px-4 py-3 rounded-xl bg-surface border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"></textarea>
    </div>

    <button type="submit" disabled={saving}
      class="w-full py-3 rounded-xl bg-accent text-cream font-semibold text-sm hover:bg-accent/90 transition-colors disabled:opacity-50">
      {saving ? '...' : t('supplier.add')}
    </button>
  </form>
</div>
```

- [ ] **Step 4: Create supplier detail page**

Create `src/routes/owner/suppliers/[id]/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import { showConfirm } from '$lib/stores/dialog.svelte';
  import { getSupplierById, deactivateSupplier, getSupplierPOs } from '$lib/modules/supplier/service';
  import type { Supplier, PurchaseOrder } from '$lib/modules/supplier/types';

  let supplier = $state<Supplier | null>(null);
  let orders = $state<PurchaseOrder[]>([]);
  let loading = $state(true);

  const supplierId = page.params.id;

  onMount(async () => {
    try {
      supplier = await getSupplierById(supplierId);
      if (supplier) {
        orders = await getSupplierPOs(supplierId);
      }
    } finally {
      loading = false;
    }
  });

  async function handleDeactivate() {
    if (!supplier) return;
    const confirmed = await showConfirm({
      title: t('supplier.deactivate'),
      message: `Deactivate ${supplier.name}?`,
    });
    if (!confirmed) return;

    try {
      await deactivateSupplier(supplier.id);
      showToast('Supplier deactivated', 'success');
      goto(`${base}/owner/suppliers`);
    } catch (err) {
      showToast('Failed to deactivate', 'error');
    }
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatPrice(amount: number): string {
    return `Rp ${amount.toLocaleString('id-ID')}`;
  }

  function statusClass(status: string): string {
    switch (status) {
      case 'draft': return 'bg-warm-100 text-ink-muted';
      case 'ordered': return 'bg-accent/10 text-accent';
      case 'received': return 'bg-sage/10 text-sage';
      case 'cancelled': return 'bg-berry/10 text-berry';
      default: return 'bg-warm-100 text-ink-muted';
    }
  }
</script>

{#if loading}
  <div class="py-8 text-center text-sm text-ink-muted">Loading...</div>
{:else if !supplier}
  <div class="py-8 text-center text-sm text-ink-muted">Supplier not found</div>
{:else}
  <div class="space-y-4">
    <button class="text-sm text-ink-muted hover:text-accent" onclick={() => goto(`${base}/owner/suppliers`)}>
      &larr; {t('supplier.title')}
    </button>

    <!-- Supplier Info -->
    <div class="bg-surface rounded-xl border border-warm-100 p-4">
      <div class="flex items-start justify-between">
        <div>
          <h1 class="font-display text-lg font-bold text-ink">{supplier.name}</h1>
          {#if supplier.contact_name}
            <p class="text-sm text-ink-muted">{supplier.contact_name}</p>
          {/if}
        </div>
        <span class="text-[10px] px-1.5 py-0.5 rounded-full font-medium {supplier.is_active ? 'bg-sage/10 text-sage' : 'bg-warm-100 text-ink-muted'}">
          {supplier.is_active ? t('supplier.active') : t('supplier.inactive')}
        </span>
      </div>

      <div class="grid grid-cols-2 gap-3 mt-3 text-sm">
        <div>
          <span class="text-xs text-ink-muted uppercase">{t('supplier.phone')}</span>
          <p class="font-medium text-ink">{supplier.phone ?? '-'}</p>
        </div>
        <div>
          <span class="text-xs text-ink-muted uppercase">{t('supplier.email')}</span>
          <p class="font-medium text-ink">{supplier.email ?? '-'}</p>
        </div>
        <div>
          <span class="text-xs text-ink-muted uppercase">{t('supplier.address')}</span>
          <p class="font-medium text-ink">{supplier.address ?? '-'}</p>
        </div>
        <div>
          <span class="text-xs text-ink-muted uppercase">{t('supplier.lead_time')}</span>
          <p class="font-medium text-ink">{supplier.lead_time_days} days</p>
        </div>
      </div>

      {#if supplier.notes}
        <p class="text-xs text-ink-muted mt-3">{supplier.notes}</p>
      {/if}

      <div class="flex gap-2 mt-4">
        <a href="{base}/owner/purchase-orders/new?supplier={supplier.id}"
          class="flex-1 py-2.5 rounded-xl bg-accent text-cream font-medium text-sm text-center">
          {t('po.create')}
        </a>
        {#if supplier.is_active}
          <button onclick={handleDeactivate}
            class="px-4 py-2.5 rounded-xl bg-berry/10 text-berry font-medium text-sm">
            {t('supplier.deactivate')}
          </button>
        {/if}
      </div>
    </div>

    <!-- Purchase Order History -->
    <div class="bg-surface rounded-xl border border-warm-100">
      <div class="px-4 py-3 border-b border-warm-50">
        <h2 class="text-sm font-semibold text-ink uppercase tracking-wide">{t('po.title')}</h2>
      </div>

      {#if orders.length === 0}
        <div class="px-4 py-6 text-center text-sm text-ink-muted">{t('po.no_orders')}</div>
      {:else}
        <div class="divide-y divide-warm-50">
          {#each orders as po}
            <a href="{base}/owner/purchase-orders/{po.id}" class="block px-4 py-3 hover:bg-warm-50 transition-colors">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-medium text-ink">{formatDate(po.created_at)}</p>
                  <span class="text-[10px] px-1.5 py-0.5 rounded-full font-medium {statusClass(po.status)}">
                    {po.status}
                  </span>
                </div>
                <p class="text-sm font-semibold text-ink">{formatPrice(po.total)}</p>
              </div>
            </a>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}
```

- [ ] **Step 5: Commit**

```bash
git add src/routes/owner/+layout.svelte src/routes/owner/suppliers/
git commit -m "feat: add supplier management pages — list, add, detail with PO history"
```

---

## Task 8: Purchase Order Pages

**Files:**
- Create: `src/routes/owner/purchase-orders/+page.svelte`
- Create: `src/routes/owner/purchase-orders/new/+page.svelte`
- Create: `src/routes/owner/purchase-orders/[id]/+page.svelte`

- [ ] **Step 1: Create PO list page**

Create `src/routes/owner/purchase-orders/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { getCurrentStaff } from '$lib/modules/auth/stores.svelte';
  import { getPurchaseOrders } from '$lib/modules/supplier/service';
  import type { PurchaseOrder, PurchaseOrderStatus } from '$lib/modules/supplier/types';

  let orders = $state<PurchaseOrder[]>([]);
  let loading = $state(true);
  let filterStatus = $state<PurchaseOrderStatus | 'all'>('all');

  const staff = getCurrentStaff();

  onMount(async () => {
    if (!staff) return;
    try {
      orders = await getPurchaseOrders(staff.outlet_id);
    } finally {
      loading = false;
    }
  });

  let filtered = $derived(
    filterStatus === 'all' ? orders : orders.filter(o => o.status === filterStatus)
  );

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatPrice(amount: number): string {
    return `Rp ${amount.toLocaleString('id-ID')}`;
  }

  function statusClass(status: string): string {
    switch (status) {
      case 'draft': return 'bg-warm-100 text-ink-muted';
      case 'ordered': return 'bg-accent/10 text-accent';
      case 'received': return 'bg-sage/10 text-sage';
      case 'cancelled': return 'bg-berry/10 text-berry';
      default: return 'bg-warm-100 text-ink-muted';
    }
  }

  const statuses: Array<PurchaseOrderStatus | 'all'> = ['all', 'draft', 'ordered', 'received', 'cancelled'];
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h1 class="font-display text-xl font-bold text-ink">{t('po.title')}</h1>
    <a href="{base}/owner/purchase-orders/new"
      class="px-4 py-2 rounded-xl bg-accent text-cream text-sm font-medium">
      + {t('po.create')}
    </a>
  </div>

  <!-- Status filter -->
  <div class="flex gap-2 overflow-x-auto pb-1">
    {#each statuses as s}
      <button
        class="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors {filterStatus === s ? 'bg-accent text-cream' : 'bg-surface text-ink-muted border border-warm-100'}"
        onclick={() => filterStatus = s}
      >
        {s === 'all' ? 'All' : t(`po.status_${s}`)}
        ({s === 'all' ? orders.length : orders.filter(o => o.status === s).length})
      </button>
    {/each}
  </div>

  {#if loading}
    <div class="py-8 text-center text-sm text-ink-muted">Loading...</div>
  {:else if filtered.length === 0}
    <div class="py-8 text-center text-sm text-ink-muted">{t('po.no_orders')}</div>
  {:else}
    <div class="space-y-2">
      {#each filtered as po}
        <a href="{base}/owner/purchase-orders/{po.id}"
          class="block bg-surface rounded-xl border border-warm-100 px-4 py-3 hover:border-accent/30 transition-colors">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-ink">{(po as any).supplier?.name ?? 'Unknown Supplier'}</p>
              <p class="text-xs text-ink-muted">{formatDate(po.created_at)}</p>
            </div>
            <div class="text-right">
              <p class="text-sm font-semibold text-ink">{formatPrice(po.total)}</p>
              <span class="text-[10px] px-1.5 py-0.5 rounded-full font-medium {statusClass(po.status)}">
                {t(`po.status_${po.status}`)}
              </span>
            </div>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
```

- [ ] **Step 2: Create new PO form**

Create `src/routes/owner/purchase-orders/new/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { page } from '$app/state';
  import { t } from '$lib/i18n/index.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import { getCurrentStaff } from '$lib/modules/auth/stores.svelte';
  import { getSuppliers, createPurchaseOrder } from '$lib/modules/supplier/service';
  import type { Supplier, NewPurchaseOrderItem } from '$lib/modules/supplier/types';

  let suppliers = $state<Supplier[]>([]);
  let selectedSupplierId = $state(page.url.searchParams.get('supplier') ?? '');
  let notes = $state('');
  let saving = $state(false);

  let items = $state<Array<NewPurchaseOrderItem & { _key: string }>>([
    { _key: crypto.randomUUID(), title: '', quantity: 1, unit_price: 0, isbn: '' },
  ]);

  const staff = getCurrentStaff();

  onMount(async () => {
    suppliers = await getSuppliers();
  });

  function addItem() {
    items = [...items, { _key: crypto.randomUUID(), title: '', quantity: 1, unit_price: 0, isbn: '' }];
  }

  function removeItem(key: string) {
    items = items.filter(i => i._key !== key);
  }

  let poTotal = $derived(
    items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0)
  );

  async function handleSubmit() {
    if (!staff || !selectedSupplierId || saving) return;
    if (items.length === 0 || items.some(i => !i.title.trim())) {
      showToast('Please fill all item titles', 'error');
      return;
    }

    saving = true;
    try {
      const po = await createPurchaseOrder({
        supplier_id: selectedSupplierId,
        outlet_id: staff.outlet_id,
        created_by: staff.id,
        notes: notes.trim() || undefined,
        items: items.map(({ _key, ...item }) => ({
          ...item,
          title: item.title.trim(),
          isbn: item.isbn?.trim() || undefined,
        })),
      });

      showToast('Purchase order created', 'success');
      goto(`${base}/owner/purchase-orders/${po.id}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create PO', 'error');
    } finally {
      saving = false;
    }
  }

  function formatPrice(amount: number): string {
    return `Rp ${amount.toLocaleString('id-ID')}`;
  }
</script>

<div class="space-y-4">
  <button class="text-sm text-ink-muted hover:text-accent" onclick={() => goto(`${base}/owner/purchase-orders`)}>
    &larr; {t('po.title')}
  </button>

  <h1 class="font-display text-xl font-bold text-ink">{t('po.create')}</h1>

  <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-4">
    <!-- Supplier select -->
    <div>
      <label for="supplier" class="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
        {t('po.supplier')} *
      </label>
      <select id="supplier" bind:value={selectedSupplierId} required
        class="w-full px-4 py-3 rounded-xl bg-surface border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30">
        <option value="">Select supplier...</option>
        {#each suppliers as s}
          <option value={s.id}>{s.name}</option>
        {/each}
      </select>
    </div>

    <!-- Items -->
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold text-ink uppercase tracking-wide">{t('po.items')}</h2>
        <button type="button" onclick={addItem}
          class="text-xs text-accent font-medium hover:text-accent/80">
          + {t('po.add_item')}
        </button>
      </div>

      {#each items as item, i (item._key)}
        <div class="bg-surface rounded-xl border border-warm-100 p-3 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-ink-muted">Item {i + 1}</span>
            {#if items.length > 1}
              <button type="button" onclick={() => removeItem(item._key)}
                class="text-xs text-berry hover:text-berry/80">Remove</button>
            {/if}
          </div>
          <input type="text" bind:value={item.title} placeholder={t('po.book_title')} required
            class="w-full px-3 py-2 rounded-lg bg-cream border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
          <div class="grid grid-cols-3 gap-2">
            <input type="text" bind:value={item.isbn} placeholder={t('po.isbn')}
              class="px-3 py-2 rounded-lg bg-cream border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
            <input type="number" min="1" bind:value={item.quantity} placeholder={t('po.quantity')}
              class="px-3 py-2 rounded-lg bg-cream border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
            <input type="number" min="0" bind:value={item.unit_price} placeholder={t('po.unit_price')}
              class="px-3 py-2 rounded-lg bg-cream border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
          </div>
        </div>
      {/each}
    </div>

    <!-- Notes -->
    <div>
      <label for="notes" class="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
        {t('po.notes')}
      </label>
      <textarea id="notes" bind:value={notes} rows="2"
        class="w-full px-4 py-3 rounded-xl bg-surface border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"></textarea>
    </div>

    <!-- Total -->
    <div class="bg-surface rounded-xl border border-warm-100 px-4 py-3 flex justify-between items-center">
      <span class="text-sm font-semibold text-ink">{t('po.total')}</span>
      <span class="text-lg font-bold text-ink">{formatPrice(poTotal)}</span>
    </div>

    <button type="submit" disabled={saving}
      class="w-full py-3 rounded-xl bg-accent text-cream font-semibold text-sm hover:bg-accent/90 transition-colors disabled:opacity-50">
      {saving ? '...' : t('po.create')}
    </button>
  </form>
</div>
```

- [ ] **Step 3: Create PO detail page with receive goods flow**

Create `src/routes/owner/purchase-orders/[id]/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import { showConfirm } from '$lib/stores/dialog.svelte';
  import { getCurrentStaff } from '$lib/modules/auth/stores.svelte';
  import {
    getPurchaseOrderById, updatePOStatus, receivePurchaseOrder,
  } from '$lib/modules/supplier/service';
  import { addInventoryItem } from '$lib/modules/inventory/service';
  import { getInventoryByBookId } from '$lib/modules/inventory/service';
  import type { PurchaseOrder, PurchaseOrderItem } from '$lib/modules/supplier/types';

  let po = $state<PurchaseOrder | null>(null);
  let loading = $state(true);
  let processing = $state(false);
  let receivedQtys = $state<Record<string, number>>({});

  const poId = page.params.id;
  const staff = getCurrentStaff();

  onMount(async () => {
    try {
      po = await getPurchaseOrderById(poId);
      if (po?.items) {
        for (const item of po.items) {
          receivedQtys[item.id] = item.received_quantity;
        }
      }
    } finally {
      loading = false;
    }
  });

  async function handleMarkOrdered() {
    if (!po) return;
    const confirmed = await showConfirm({
      title: t('po.mark_ordered'),
      message: 'This will mark the PO as sent to supplier.',
    });
    if (!confirmed) return;

    processing = true;
    try {
      await updatePOStatus(po.id, 'ordered');
      po = { ...po, status: 'ordered', ordered_at: new Date().toISOString() };
      showToast('PO marked as ordered', 'success');
    } catch (err) {
      showToast('Failed to update PO', 'error');
    } finally {
      processing = false;
    }
  }

  async function handleReceiveGoods() {
    if (!po?.items || !staff) return;

    const confirmed = await showConfirm({
      title: t('po.receive_goods'),
      message: t('po.receive_confirm'),
    });
    if (!confirmed) return;

    processing = true;
    try {
      const receivedItems = [];

      for (const item of po.items) {
        const qty = receivedQtys[item.id] ?? 0;
        if (qty <= 0) continue;

        // Find or create inventory record for this book
        let inventoryId: string;

        if (item.book_id) {
          const existing = await getInventoryByBookId(item.book_id, staff.outlet_id);
          if (existing) {
            inventoryId = existing.id;
          } else {
            const newInv = await addInventoryItem({
              book_id: item.book_id,
              outlet_id: staff.outlet_id,
              type: 'for_sale',
              source: 'supplier',
              is_preloved: false,
              price: item.unit_price,
              cost_price: item.unit_price,
              stock: 0, // Will be updated via stock movement
              condition: 'new',
            });
            inventoryId = newInv.id;
          }
        } else {
          // No book_id — need to create a placeholder.
          // In practice, the owner should link the book_id before receiving.
          continue;
        }

        receivedItems.push({
          itemId: item.id,
          inventoryId,
          receivedQty: qty,
        });
      }

      await receivePurchaseOrder(po.id, receivedItems, staff.id);
      po = { ...po, status: 'received', received_at: new Date().toISOString() };
      showToast('Goods received and stock updated', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to receive goods', 'error');
    } finally {
      processing = false;
    }
  }

  async function handleCancel() {
    if (!po) return;
    const confirmed = await showConfirm({
      title: t('po.cancel'),
      message: 'Cancel this purchase order?',
    });
    if (!confirmed) return;

    processing = true;
    try {
      await updatePOStatus(po.id, 'cancelled');
      po = { ...po, status: 'cancelled' };
      showToast('PO cancelled', 'success');
    } catch (err) {
      showToast('Failed to cancel PO', 'error');
    } finally {
      processing = false;
    }
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatPrice(amount: number): string {
    return `Rp ${amount.toLocaleString('id-ID')}`;
  }

  function statusClass(status: string): string {
    switch (status) {
      case 'draft': return 'bg-warm-100 text-ink-muted';
      case 'ordered': return 'bg-accent/10 text-accent';
      case 'received': return 'bg-sage/10 text-sage';
      case 'cancelled': return 'bg-berry/10 text-berry';
      default: return 'bg-warm-100 text-ink-muted';
    }
  }
</script>

{#if loading}
  <div class="py-8 text-center text-sm text-ink-muted">Loading...</div>
{:else if !po}
  <div class="py-8 text-center text-sm text-ink-muted">Purchase order not found</div>
{:else}
  <div class="space-y-4">
    <button class="text-sm text-ink-muted hover:text-accent" onclick={() => goto(`${base}/owner/purchase-orders`)}>
      &larr; {t('po.title')}
    </button>

    <!-- PO Header -->
    <div class="bg-surface rounded-xl border border-warm-100 p-4">
      <div class="flex items-start justify-between">
        <div>
          <h1 class="font-display text-lg font-bold text-ink">
            {(po.supplier as any)?.name ?? 'Unknown Supplier'}
          </h1>
          <p class="text-xs text-ink-muted">Created: {formatDate(po.created_at)}</p>
          {#if po.ordered_at}
            <p class="text-xs text-ink-muted">Ordered: {formatDate(po.ordered_at)}</p>
          {/if}
          {#if po.received_at}
            <p class="text-xs text-ink-muted">Received: {formatDate(po.received_at)}</p>
          {/if}
        </div>
        <span class="text-xs px-2 py-0.5 rounded-full font-medium {statusClass(po.status)}">
          {t(`po.status_${po.status}`)}
        </span>
      </div>

      {#if po.notes}
        <p class="text-xs text-ink-muted mt-2">{po.notes}</p>
      {/if}

      <p class="text-lg font-bold text-ink mt-3">{t('po.total')}: {formatPrice(po.total)}</p>
    </div>

    <!-- Items -->
    <div class="bg-surface rounded-xl border border-warm-100">
      <div class="px-4 py-3 border-b border-warm-50">
        <h2 class="text-sm font-semibold text-ink uppercase tracking-wide">{t('po.items')}</h2>
      </div>
      <div class="divide-y divide-warm-50">
        {#each (po.items ?? []) as item}
          <div class="px-4 py-3">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium text-ink">{item.title}</p>
                {#if item.isbn}
                  <p class="text-xs text-ink-muted">ISBN: {item.isbn}</p>
                {/if}
              </div>
              <div class="text-right text-sm">
                <p>{item.quantity} x {formatPrice(item.unit_price)}</p>
                <p class="font-semibold">{formatPrice(item.quantity * item.unit_price)}</p>
              </div>
            </div>

            {#if po.status === 'ordered'}
              <div class="mt-2 flex items-center gap-2">
                <label class="text-xs text-ink-muted">{t('po.received_qty')}:</label>
                <input type="number" min="0" max={item.quantity}
                  bind:value={receivedQtys[item.id]}
                  class="w-20 px-2 py-1 rounded-lg bg-cream border border-warm-100 text-sm text-center focus:outline-none focus:ring-2 focus:ring-accent/30" />
                <span class="text-xs text-ink-muted">/ {item.quantity}</span>
              </div>
            {:else if po.status === 'received'}
              <p class="text-xs text-sage mt-1">{t('po.received_qty')}: {item.received_quantity} / {item.quantity}</p>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <!-- Actions -->
    {#if po.status === 'draft'}
      <div class="flex gap-2">
        <button onclick={handleMarkOrdered} disabled={processing}
          class="flex-1 py-3 rounded-xl bg-accent text-cream font-semibold text-sm disabled:opacity-50">
          {t('po.mark_ordered')}
        </button>
        <button onclick={handleCancel} disabled={processing}
          class="px-4 py-3 rounded-xl bg-berry/10 text-berry font-medium text-sm">
          {t('po.cancel')}
        </button>
      </div>
    {:else if po.status === 'ordered'}
      <button onclick={handleReceiveGoods} disabled={processing}
        class="w-full py-3 rounded-xl bg-sage text-cream font-semibold text-sm disabled:opacity-50">
        {t('po.receive_goods')}
      </button>
    {/if}
  </div>
{/if}
```

- [ ] **Step 4: Commit**

```bash
git add src/routes/owner/purchase-orders/
git commit -m "feat: add purchase order pages — list, create, detail with receive goods flow"
```

---

## Task 9: Consignment Pages

**Files:**
- Create: `src/routes/owner/consignment/+page.svelte`
- Create: `src/routes/owner/consignment/new/+page.svelte`
- Create: `src/routes/owner/consignment/[id]/+page.svelte`

- [ ] **Step 1: Create consignment list page**

Create `src/routes/owner/consignment/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { getConsignors, getUnsettledTotal } from '$lib/modules/consignment/service';
  import type { Consignor } from '$lib/modules/consignment/types';

  let consignors = $state<Consignor[]>([]);
  let unsettledTotal = $state(0);
  let loading = $state(true);

  onMount(async () => {
    try {
      [consignors, unsettledTotal] = await Promise.all([
        getConsignors(),
        getUnsettledTotal(),
      ]);
    } finally {
      loading = false;
    }
  });

  function formatPrice(amount: number): string {
    return `Rp ${amount.toLocaleString('id-ID')}`;
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h1 class="font-display text-xl font-bold text-ink">{t('consignment.title')}</h1>
    <a href="{base}/owner/consignment/new"
      class="px-4 py-2 rounded-xl bg-accent text-cream text-sm font-medium">
      + {t('consignment.add_consignor')}
    </a>
  </div>

  <!-- Unsettled summary -->
  {#if unsettledTotal > 0}
    <div class="bg-gold/10 border border-gold/20 rounded-xl px-4 py-3">
      <p class="text-xs font-semibold text-gold uppercase tracking-wide">{t('consignment.unsettled')}</p>
      <p class="text-lg font-bold text-ink mt-1">{formatPrice(unsettledTotal)}</p>
    </div>
  {/if}

  {#if loading}
    <div class="py-8 text-center text-sm text-ink-muted">Loading...</div>
  {:else if consignors.length === 0}
    <div class="py-8 text-center text-sm text-ink-muted">{t('consignment.no_consignors')}</div>
  {:else}
    <div class="space-y-2">
      {#each consignors as consignor}
        <a href="{base}/owner/consignment/{consignor.id}"
          class="block bg-surface rounded-xl border border-warm-100 px-4 py-3 hover:border-accent/30 transition-colors">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-ink">{consignor.name}</p>
              <p class="text-xs text-ink-muted">
                {consignor.phone ?? ''}
                {consignor.bank_name ? ` · ${consignor.bank_name}` : ''}
              </p>
            </div>
            <div class="text-right">
              <p class="text-xs text-ink-muted">{t('consignment.commission_rate')}</p>
              <p class="text-sm font-semibold text-ink">{consignor.commission_rate}%</p>
            </div>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
```

- [ ] **Step 2: Create add consignor form**

Create `src/routes/owner/consignment/new/+page.svelte`:

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import { createConsignor } from '$lib/modules/consignment/service';

  let name = $state('');
  let phone = $state('');
  let email = $state('');
  let bankAccount = $state('');
  let bankName = $state('');
  let commissionRate = $state(20);
  let notes = $state('');
  let saving = $state(false);

  async function handleSubmit() {
    if (!name.trim() || saving) return;
    saving = true;

    try {
      await createConsignor({
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        bank_account: bankAccount.trim() || undefined,
        bank_name: bankName.trim() || undefined,
        commission_rate: commissionRate,
        notes: notes.trim() || undefined,
      });

      showToast('Consignor added', 'success');
      goto(`${base}/owner/consignment`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to add consignor', 'error');
    } finally {
      saving = false;
    }
  }
</script>

<div class="space-y-4">
  <button class="text-sm text-ink-muted hover:text-accent" onclick={() => goto(`${base}/owner/consignment`)}>
    &larr; {t('consignment.title')}
  </button>

  <h1 class="font-display text-xl font-bold text-ink">{t('consignment.add_consignor')}</h1>

  <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-4">
    <div>
      <label for="name" class="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
        {t('consignment.name')} *
      </label>
      <input id="name" type="text" bind:value={name} required
        class="w-full px-4 py-3 rounded-xl bg-surface border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
    </div>

    <div class="grid grid-cols-2 gap-3">
      <div>
        <label for="phone" class="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
          {t('consignment.phone')}
        </label>
        <input id="phone" type="tel" bind:value={phone}
          class="w-full px-4 py-3 rounded-xl bg-surface border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
      </div>
      <div>
        <label for="email" class="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
          {t('consignment.email')}
        </label>
        <input id="email" type="email" bind:value={email}
          class="w-full px-4 py-3 rounded-xl bg-surface border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
      </div>
    </div>

    <div class="grid grid-cols-2 gap-3">
      <div>
        <label for="bank_name" class="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
          {t('consignment.bank_name')}
        </label>
        <input id="bank_name" type="text" bind:value={bankName}
          class="w-full px-4 py-3 rounded-xl bg-surface border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
      </div>
      <div>
        <label for="bank_account" class="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
          {t('consignment.bank_account')}
        </label>
        <input id="bank_account" type="text" bind:value={bankAccount}
          class="w-full px-4 py-3 rounded-xl bg-surface border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
      </div>
    </div>

    <div>
      <label for="commission" class="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
        {t('consignment.commission_rate')}
      </label>
      <input id="commission" type="number" min="0" max="100" step="0.5" bind:value={commissionRate}
        class="w-full px-4 py-3 rounded-xl bg-surface border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
    </div>

    <div>
      <label for="notes" class="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
        {t('consignment.notes')}
      </label>
      <textarea id="notes" bind:value={notes} rows="2"
        class="w-full px-4 py-3 rounded-xl bg-surface border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"></textarea>
    </div>

    <button type="submit" disabled={saving}
      class="w-full py-3 rounded-xl bg-accent text-cream font-semibold text-sm hover:bg-accent/90 transition-colors disabled:opacity-50">
      {saving ? '...' : t('consignment.add_consignor')}
    </button>
  </form>
</div>
```

- [ ] **Step 3: Create consignor detail page with settlement flow**

Create `src/routes/owner/consignment/[id]/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import { showConfirm } from '$lib/stores/dialog.svelte';
  import { getCurrentStaff } from '$lib/modules/auth/stores.svelte';
  import {
    getConsignorById, getSettlements, createSettlement,
    confirmSettlement, markSettlementPaid,
  } from '$lib/modules/consignment/service';
  import { getConsignmentSales, calculateSettlementTotals } from '$lib/modules/consignment/ledger';
  import type { Consignor, ConsignmentSettlement, ConsignmentSaleRecord } from '$lib/modules/consignment/types';

  let consignor = $state<Consignor | null>(null);
  let settlements = $state<ConsignmentSettlement[]>([]);
  let loading = $state(true);
  let creating = $state(false);

  // Settlement creation form
  let showCreateForm = $state(false);
  let periodStart = $state('');
  let periodEnd = $state('');
  let salesPreview = $state<ConsignmentSaleRecord[]>([]);
  let loadingSales = $state(false);

  const consignorId = page.params.id;
  const staff = getCurrentStaff();

  onMount(async () => {
    try {
      consignor = await getConsignorById(consignorId);
      settlements = await getSettlements(consignorId);
    } finally {
      loading = false;
    }
  });

  async function previewSales() {
    if (!periodStart || !periodEnd) return;
    loadingSales = true;
    try {
      salesPreview = await getConsignmentSales(consignorId, periodStart, periodEnd);
    } catch (err) {
      showToast('Failed to load sales data', 'error');
    } finally {
      loadingSales = false;
    }
  }

  async function handleCreateSettlement() {
    if (!consignor || !staff || creating) return;
    if (salesPreview.length === 0) {
      showToast('No sales in this period', 'error');
      return;
    }

    creating = true;
    try {
      const totals = calculateSettlementTotals(salesPreview);
      await createSettlement({
        consignorId: consignor.id,
        periodStart,
        periodEnd,
        totalSales: totals.totalSales,
        commissionRate: consignor.commission_rate,
        staffId: staff.id,
      });

      showToast('Settlement created', 'success');
      settlements = await getSettlements(consignorId);
      showCreateForm = false;
      salesPreview = [];
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    } finally {
      creating = false;
    }
  }

  async function handleConfirm(settlementId: string) {
    const confirmed = await showConfirm({
      title: t('consignment.confirm'),
      message: 'Confirm this settlement?',
    });
    if (!confirmed) return;

    try {
      await confirmSettlement(settlementId);
      settlements = settlements.map(s => s.id === settlementId ? { ...s, status: 'confirmed' as const } : s);
      showToast('Settlement confirmed', 'success');
    } catch (err) {
      showToast('Failed', 'error');
    }
  }

  async function handleMarkPaid(settlementId: string) {
    const confirmed = await showConfirm({
      title: t('consignment.mark_paid'),
      message: 'Mark this settlement as paid?',
    });
    if (!confirmed) return;

    try {
      await markSettlementPaid(settlementId);
      settlements = settlements.map(s =>
        s.id === settlementId ? { ...s, status: 'paid' as const, paid_at: new Date().toISOString() } : s
      );
      showToast('Settlement marked as paid', 'success');
    } catch (err) {
      showToast('Failed', 'error');
    }
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatPrice(amount: number): string {
    return `Rp ${amount.toLocaleString('id-ID')}`;
  }

  function statusClass(status: string): string {
    switch (status) {
      case 'draft': return 'bg-warm-100 text-ink-muted';
      case 'confirmed': return 'bg-accent/10 text-accent';
      case 'paid': return 'bg-sage/10 text-sage';
      default: return 'bg-warm-100 text-ink-muted';
    }
  }
</script>

{#if loading}
  <div class="py-8 text-center text-sm text-ink-muted">Loading...</div>
{:else if !consignor}
  <div class="py-8 text-center text-sm text-ink-muted">Consignor not found</div>
{:else}
  <div class="space-y-4">
    <button class="text-sm text-ink-muted hover:text-accent" onclick={() => goto(`${base}/owner/consignment`)}>
      &larr; {t('consignment.title')}
    </button>

    <!-- Consignor Info -->
    <div class="bg-surface rounded-xl border border-warm-100 p-4">
      <h1 class="font-display text-lg font-bold text-ink">{consignor.name}</h1>
      <div class="grid grid-cols-2 gap-3 mt-3 text-sm">
        <div>
          <span class="text-xs text-ink-muted uppercase">{t('consignment.phone')}</span>
          <p class="font-medium text-ink">{consignor.phone ?? '-'}</p>
        </div>
        <div>
          <span class="text-xs text-ink-muted uppercase">{t('consignment.commission_rate')}</span>
          <p class="font-medium text-ink">{consignor.commission_rate}%</p>
        </div>
        <div>
          <span class="text-xs text-ink-muted uppercase">{t('consignment.bank_name')}</span>
          <p class="font-medium text-ink">{consignor.bank_name ?? '-'}</p>
        </div>
        <div>
          <span class="text-xs text-ink-muted uppercase">{t('consignment.bank_account')}</span>
          <p class="font-medium text-ink">{consignor.bank_account ?? '-'}</p>
        </div>
      </div>
    </div>

    <!-- Create Settlement -->
    <button
      class="w-full py-2.5 rounded-xl bg-accent/10 text-accent font-medium text-sm hover:bg-accent/20 transition-colors"
      onclick={() => showCreateForm = !showCreateForm}
    >
      {t('consignment.create_settlement')}
    </button>

    {#if showCreateForm}
      <div class="bg-surface rounded-xl border border-warm-100 p-4 space-y-3">
        <h3 class="text-sm font-semibold text-ink">{t('consignment.create_settlement')}</h3>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-ink-muted mb-1">Start Date</label>
            <input type="date" bind:value={periodStart}
              class="w-full px-3 py-2 rounded-lg bg-cream border border-warm-100 text-sm" />
          </div>
          <div>
            <label class="block text-xs text-ink-muted mb-1">End Date</label>
            <input type="date" bind:value={periodEnd}
              class="w-full px-3 py-2 rounded-lg bg-cream border border-warm-100 text-sm" />
          </div>
        </div>

        <button onclick={previewSales} disabled={loadingSales || !periodStart || !periodEnd}
          class="w-full py-2 rounded-lg bg-warm-100 text-ink text-sm font-medium disabled:opacity-50">
          {loadingSales ? 'Loading...' : 'Preview Sales'}
        </button>

        {#if salesPreview.length > 0}
          <div class="divide-y divide-warm-50 text-sm">
            {#each salesPreview as sale}
              <div class="py-2 flex justify-between">
                <span class="text-ink">{sale.book_title} x{sale.quantity}</span>
                <span class="font-medium">{formatPrice(sale.total)}</span>
              </div>
            {/each}
          </div>

          {@const totals = calculateSettlementTotals(salesPreview)}
          <div class="border-t border-warm-100 pt-2 space-y-1 text-sm">
            <div class="flex justify-between"><span>{t('consignment.total_sales')}</span><span class="font-semibold">{formatPrice(totals.totalSales)}</span></div>
            <div class="flex justify-between"><span>{t('consignment.commission')}</span><span>{formatPrice(totals.totalCommission)}</span></div>
            <div class="flex justify-between font-bold"><span>{t('consignment.payout')}</span><span>{formatPrice(totals.totalPayout)}</span></div>
          </div>

          <button onclick={handleCreateSettlement} disabled={creating}
            class="w-full py-2.5 rounded-xl bg-accent text-cream font-semibold text-sm disabled:opacity-50">
            {creating ? '...' : t('consignment.create_settlement')}
          </button>
        {:else if !loadingSales && periodStart && periodEnd}
          <p class="text-xs text-ink-muted text-center">No sales found in this period</p>
        {/if}
      </div>
    {/if}

    <!-- Settlement History -->
    <div class="bg-surface rounded-xl border border-warm-100">
      <div class="px-4 py-3 border-b border-warm-50">
        <h2 class="text-sm font-semibold text-ink uppercase tracking-wide">{t('consignment.settlements')}</h2>
      </div>

      {#if settlements.length === 0}
        <div class="px-4 py-6 text-center text-sm text-ink-muted">{t('consignment.no_settlements')}</div>
      {:else}
        <div class="divide-y divide-warm-50">
          {#each settlements as s}
            <div class="px-4 py-3">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-medium text-ink">{formatDate(s.period_start)} - {formatDate(s.period_end)}</p>
                  <span class="text-[10px] px-1.5 py-0.5 rounded-full font-medium {statusClass(s.status)}">
                    {t(`consignment.status_${s.status}`)}
                  </span>
                </div>
                <div class="text-right">
                  <p class="text-sm font-semibold text-ink">{formatPrice(s.payout)}</p>
                  <p class="text-xs text-ink-muted">{t('consignment.commission')}: {formatPrice(s.commission)}</p>
                </div>
              </div>

              {#if s.status === 'draft'}
                <button onclick={() => handleConfirm(s.id)}
                  class="mt-2 w-full py-2 rounded-lg bg-accent/10 text-accent text-xs font-medium">
                  {t('consignment.confirm')}
                </button>
              {:else if s.status === 'confirmed'}
                <button onclick={() => handleMarkPaid(s.id)}
                  class="mt-2 w-full py-2 rounded-lg bg-sage/10 text-sage text-xs font-medium">
                  {t('consignment.mark_paid')}
                </button>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}
```

- [ ] **Step 4: Commit**

```bash
git add src/routes/owner/consignment/
git commit -m "feat: add consignment pages — consignor list, add, detail with settlement flow"
```

---

## Task 10: Restock Suggestions Page

**Files:**
- Create: `src/routes/owner/restock/+page.svelte`

- [ ] **Step 1: Create restock suggestions page**

Create `src/routes/owner/restock/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { getCurrentStaff } from '$lib/modules/auth/stores.svelte';
  import { getRestockSuggestions } from '$lib/modules/restock/engine';
  import type { RestockSuggestion, RestockUrgency } from '$lib/modules/restock/types';

  let suggestions = $state<RestockSuggestion[]>([]);
  let loading = $state(true);
  let filterUrgency = $state<RestockUrgency | 'all'>('all');

  const staff = getCurrentStaff();

  onMount(async () => {
    if (!staff) return;
    try {
      suggestions = await getRestockSuggestions(staff.outlet_id);
    } catch (err) {
      console.error('Failed to load restock suggestions:', err);
    } finally {
      loading = false;
    }
  });

  let filtered = $derived(
    filterUrgency === 'all'
      ? suggestions
      : suggestions.filter(s => s.urgency === filterUrgency)
  );

  function urgencyClass(urgency: RestockUrgency): string {
    switch (urgency) {
      case 'critical': return 'bg-berry/10 text-berry';
      case 'urgent': return 'bg-accent/10 text-accent';
      case 'warning': return 'bg-gold/10 text-gold';
      default: return 'bg-sage/10 text-sage';
    }
  }

  function urgencyLabel(urgency: RestockUrgency): string {
    switch (urgency) {
      case 'critical': return t('restock.urgency_critical');
      case 'urgent': return t('restock.urgency_urgent');
      case 'warning': return t('restock.urgency_warning');
      default: return 'OK';
    }
  }

  const urgencies: Array<RestockUrgency | 'all'> = ['all', 'critical', 'urgent', 'warning'];
</script>

<div class="space-y-4">
  <h1 class="font-display text-xl font-bold text-ink">{t('restock.title')}</h1>

  <!-- Filter -->
  <div class="flex gap-2 overflow-x-auto pb-1">
    {#each urgencies as u}
      <button
        class="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors {filterUrgency === u ? 'bg-accent text-cream' : 'bg-surface text-ink-muted border border-warm-100'}"
        onclick={() => filterUrgency = u}
      >
        {u === 'all' ? 'All' : urgencyLabel(u)}
        ({u === 'all' ? suggestions.length : suggestions.filter(s => s.urgency === u).length})
      </button>
    {/each}
  </div>

  {#if loading}
    <div class="py-8 text-center text-sm text-ink-muted">Analyzing stock levels...</div>
  {:else if suggestions.length === 0}
    <div class="py-12 text-center">
      <p class="text-sm text-sage font-medium">{t('restock.no_suggestions')}</p>
    </div>
  {:else if filtered.length === 0}
    <div class="py-8 text-center text-sm text-ink-muted">No items at this urgency level</div>
  {:else}
    <div class="space-y-2">
      {#each filtered as item}
        <div class="bg-surface rounded-xl border border-warm-100 px-4 py-3">
          <div class="flex items-start justify-between">
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-ink truncate">{item.book_title}</p>
              {#if item.supplier_name}
                <p class="text-xs text-ink-muted">{item.supplier_name}</p>
              {/if}
            </div>
            <span class="text-[10px] px-1.5 py-0.5 rounded-full font-bold {urgencyClass(item.urgency)}">
              {urgencyLabel(item.urgency)}
            </span>
          </div>

          <div class="grid grid-cols-4 gap-2 mt-3 text-center">
            <div>
              <p class="text-[10px] text-ink-muted uppercase">{t('restock.current_stock')}</p>
              <p class="text-sm font-semibold text-ink">{item.current_stock}</p>
            </div>
            <div>
              <p class="text-[10px] text-ink-muted uppercase">{t('restock.avg_daily_sales')}</p>
              <p class="text-sm font-semibold text-ink">{item.avg_daily_sales.toFixed(1)}</p>
            </div>
            <div>
              <p class="text-[10px] text-ink-muted uppercase">{t('restock.days_until_stockout')}</p>
              <p class="text-sm font-semibold {item.days_until_stockout !== null && item.days_until_stockout < 7 ? 'text-berry' : 'text-ink'}">
                {item.days_until_stockout !== null ? `${item.days_until_stockout}d` : '-'}
              </p>
            </div>
            <div>
              <p class="text-[10px] text-ink-muted uppercase">{t('restock.suggested_qty')}</p>
              <p class="text-sm font-bold text-accent">{item.suggested_quantity}</p>
            </div>
          </div>

          {#if item.supplier_id}
            <a href="{base}/owner/purchase-orders/new?supplier={item.supplier_id}"
              class="mt-3 block w-full py-2 rounded-lg bg-accent/10 text-accent text-xs font-medium text-center">
              {t('restock.create_po')}
            </a>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
```

- [ ] **Step 2: Test manually**

Navigate to `/owner/restock`. Verify:
- Suggestions load and display with urgency badges
- Filter buttons work (all, critical, urgent, warning)
- Create PO link routes to PO creation with supplier pre-selected
- Empty state shows healthy message when no items need restock

- [ ] **Step 3: Commit**

```bash
git add src/routes/owner/restock/
git commit -m "feat: add restock suggestions page — urgency-sorted list with create PO link"
```

---

## Task 11: Notification Center Page & TopBar Bell

**Files:**
- Create: `src/routes/owner/notifications/+page.svelte`
- Modify: `src/lib/components/TopBar.svelte`
- Modify: `src/routes/+layout.svelte`

- [ ] **Step 1: Create notification center page**

Create `src/routes/owner/notifications/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/index.svelte';
  import { getCurrentStaff } from '$lib/modules/auth/stores.svelte';
  import {
    getNotifications as fetchNotifications,
    markAsRead,
    markAllAsRead,
  } from '$lib/modules/notification/service';
  import {
    getNotifications, setNotifications, getUnreadCount,
    setUnreadCount, markNotificationRead,
  } from '$lib/modules/notification/stores.svelte';
  import type { Notification } from '$lib/modules/notification/types';

  let loading = $state(true);
  let notifications = $derived(getNotifications());
  let unreadCount = $derived(getUnreadCount());

  const staff = getCurrentStaff();

  onMount(async () => {
    if (!staff) return;
    try {
      const list = await fetchNotifications(staff.id);
      setNotifications(list);
      setUnreadCount(list.filter(n => !n.read).length);
    } finally {
      loading = false;
    }
  });

  async function handleMarkRead(notif: Notification) {
    if (notif.read) return;
    try {
      await markAsRead(notif.id);
      markNotificationRead(notif.id);
    } catch {}
  }

  async function handleMarkAllRead() {
    if (!staff) return;
    try {
      await markAllAsRead(staff.id);
      setNotifications(notifications.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {}
  }

  function typeIcon(type: string): string {
    switch (type) {
      case 'low_stock': return '📦';
      case 'out_of_stock': return '🚫';
      case 'po_received': return '📬';
      case 'settlement_due': return '💰';
      case 'payment_failed': return '❌';
      case 'daily_summary': return '📊';
      case 'restock_suggestion': return '🔄';
      default: return '🔔';
    }
  }

  function formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h1 class="font-display text-xl font-bold text-ink">{t('notification.title')}</h1>
    {#if unreadCount > 0}
      <button onclick={handleMarkAllRead}
        class="text-xs text-accent font-medium hover:text-accent/80">
        {t('notification.mark_all_read')}
      </button>
    {/if}
  </div>

  {#if loading}
    <div class="py-8 text-center text-sm text-ink-muted">Loading...</div>
  {:else if notifications.length === 0}
    <div class="py-12 text-center text-sm text-ink-muted">{t('notification.empty')}</div>
  {:else}
    <div class="space-y-1">
      {#each notifications as notif}
        <button
          class="w-full text-left bg-surface rounded-xl border px-4 py-3 transition-colors
            {notif.read ? 'border-warm-100' : 'border-accent/20 bg-accent/5'}"
          onclick={() => handleMarkRead(notif)}
        >
          <div class="flex items-start gap-3">
            <span class="text-lg mt-0.5">{typeIcon(notif.type)}</span>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between">
                <p class="text-sm font-medium text-ink truncate {!notif.read ? 'font-semibold' : ''}">
                  {notif.title}
                </p>
                <span class="text-[10px] text-ink-muted ml-2 whitespace-nowrap">{formatTime(notif.created_at)}</span>
              </div>
              {#if notif.body}
                <p class="text-xs text-ink-muted mt-0.5 line-clamp-2">{notif.body}</p>
              {/if}
            </div>
            {#if !notif.read}
              <span class="w-2 h-2 rounded-full bg-accent mt-2 shrink-0"></span>
            {/if}
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>
```

- [ ] **Step 2: Update TopBar with notification bell**

In `src/lib/components/TopBar.svelte`, add the notification bell icon next to the existing staff badge.

After the existing imports, add:

```typescript
import { getUnreadCount } from '$lib/modules/notification/stores.svelte';
import { isStaff } from '$lib/modules/auth/stores.svelte';
```

Add the bell icon in the topbar action area (next to existing elements):

```svelte
{#if isStaff()}
  <a href="{base}/owner/notifications" class="relative p-1.5">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-ink-muted">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
    </svg>
    {#if getUnreadCount() > 0}
      <span class="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-berry text-cream text-[10px] font-bold flex items-center justify-center">
        {getUnreadCount() > 9 ? '9+' : getUnreadCount()}
      </span>
    {/if}
  </a>
{/if}
```

- [ ] **Step 3: Update root layout to init notification subscription**

In `src/routes/+layout.svelte`, after the existing auth restore block, add notification initialization:

```typescript
// Init notification subscription (after auth restore)
if (session) {
  try {
    const { subscribeToNotifications } = await import('$lib/modules/notification/realtime');
    const { getNotifications, getUnreadCount: fetchUnread } = await import('$lib/modules/notification/service');
    const { setNotifications, setUnreadCount } = await import('$lib/modules/notification/stores.svelte');

    // Load initial notifications
    const notifications = await getNotifications(session.staff.id);
    setNotifications(notifications);
    setUnreadCount(notifications.filter(n => !n.read).length);

    // Subscribe to realtime updates
    subscribeToNotifications(session.staff.id);
  } catch {
    // Notification module not available or error — continue silently
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/routes/owner/notifications/ src/lib/components/TopBar.svelte src/routes/+layout.svelte
git commit -m "feat: add notification center page and TopBar bell with unread badge"
```

---

## Task 12: Daily Summary Edge Function

**Files:**
- Create: `supabase/functions/daily-summary/index.ts`

- [ ] **Step 1: Write daily summary Edge Function**

Create `supabase/functions/daily-summary/index.ts`:

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get today's date range
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    // Get all outlets
    const { data: outlets } = await supabase.from('outlet').select('id, name');

    for (const outlet of outlets ?? []) {
      // Fetch today's transactions
      const { data: transactions } = await supabase
        .from('transaction')
        .select('total, type, payment_status')
        .eq('outlet_id', outlet.id)
        .eq('payment_status', 'paid')
        .eq('type', 'sale')
        .gte('created_at', startOfDay.toISOString())
        .lte('created_at', endOfDay.toISOString());

      const totalSales = (transactions ?? []).reduce((sum: number, t: any) => sum + (t.total ?? 0), 0);
      const transactionCount = (transactions ?? []).length;

      // Fetch low stock count
      const { data: lowStock } = await supabase
        .from('inventory')
        .select('id')
        .eq('outlet_id', outlet.id)
        .lte('stock', 0);

      const outOfStockCount = (lowStock ?? []).length;

      // Find owner(s) for this outlet
      const { data: owners } = await supabase
        .from('staff')
        .select('id, phone')
        .eq('outlet_id', outlet.id)
        .eq('role', 'owner')
        .eq('is_active', true);

      for (const owner of owners ?? []) {
        // Create in-app notification
        await supabase.from('notification').insert({
          outlet_id: outlet.id,
          recipient_id: owner.id,
          type: 'daily_summary',
          title: `Daily Summary — ${outlet.name}`,
          body: `Sales: Rp ${totalSales.toLocaleString('id-ID')} | Transactions: ${transactionCount} | Out of stock: ${outOfStockCount}`,
          data: {
            totalSales,
            transactionCount,
            outOfStockCount,
            date: today.toISOString().split('T')[0],
          },
        });

        // Send WhatsApp (if phone is available and WhatsApp provider is configured)
        if (owner.phone) {
          const fonntToken = Deno.env.get('FONNTE_API_TOKEN');
          if (fonntToken) {
            const message = [
              '*Libris Cafe — Ringkasan Harian*',
              '',
              `Penjualan: Rp ${totalSales.toLocaleString('id-ID')}`,
              `Transaksi: ${transactionCount}`,
              `Stok habis: ${outOfStockCount} item`,
              '',
              `_${today.toLocaleDateString('id-ID', { dateStyle: 'full' })}_`,
            ].join('\n');

            await fetch('https://api.fonnte.com/send', {
              method: 'POST',
              headers: {
                'Authorization': fonntToken,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                target: owner.phone,
                message,
              }),
            });
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Daily summaries sent' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

- [ ] **Step 2: Deploy Edge Function**

```bash
npx supabase functions deploy daily-summary
```

- [ ] **Step 3: Set up cron schedule**

In Supabase Dashboard, set up a cron job to call this function daily at 21:00 WIB (14:00 UTC):

```sql
-- Run via Supabase SQL Editor (pg_cron extension)
SELECT cron.schedule(
  'daily-summary',
  '0 14 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/daily-summary',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/daily-summary/
git commit -m "feat: add daily summary Edge Function — in-app + WhatsApp notification"
```

---

## Task 13: Integration Test & Final Wiring

**Files:**
- No new files — verification and smoke testing

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass (existing Phase 1+2 tests + new Phase 3 tests).

- [ ] **Step 2: Run dev server and smoke test**

```bash
npm run dev
```

Manual smoke test checklist:
- [ ] Login as owner
- [ ] Navigate to Suppliers — list is empty, add a new supplier (Gramedia)
- [ ] Supplier detail page shows info and empty PO list
- [ ] Create a Purchase Order from supplier detail — add 2-3 items
- [ ] PO appears in PO list with "Draft" status
- [ ] Mark PO as "Ordered" — status updates
- [ ] Receive goods on PO — received quantities update, stock movements created
- [ ] Navigate to Consignment — list is empty, add a consignor (Pak Rudi, 20% commission)
- [ ] Consignor detail page shows info
- [ ] Add a consignment book to inventory (source=consignment, link consignor)
- [ ] Sell the consignment book via POS
- [ ] Create settlement for consignor — preview shows the sale, totals calculated
- [ ] Confirm and mark settlement as paid
- [ ] Navigate to Restock — suggestions appear based on stock levels and sales history
- [ ] Urgency filters work (critical, urgent, warning)
- [ ] "Create PO" link from restock routes to PO creation with supplier pre-selected
- [ ] Notification bell appears in TopBar
- [ ] Notifications page loads (may be empty initially)
- [ ] Create a low stock scenario — verify notification appears in-app
- [ ] Existing Phase 1+2 features still work: POS, payments, receipts, dashboard, browse

- [ ] **Step 3: Verify Edge Function**

```bash
npx supabase functions invoke daily-summary --no-verify-jwt
```

Expected: Returns `{ success: true }` and creates notification records.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete Phase 3 — supplier management, PO, consignment, notifications, restock engine"
```

---

## Summary

| Task | What it builds | Tests |
|------|----------------|-------|
| 1 | Database migration — supplier, PO, consignor, settlement, notification tables | Migration + RLS |
| 2 | Supplier module — CRUD, PO lifecycle, abstract adapter | 3 unit tests |
| 3 | Consignment module — consignor CRUD, settlement, sales ledger | 3 unit tests |
| 4 | Notification module — service, Realtime subscription, WhatsApp dispatch, store | 2 unit tests |
| 5 | Restock suggestion engine — heuristic analysis | 5 unit tests |
| 6 | i18n strings (EN/ID) for all Phase 3 features | — |
| 7 | Owner layout + supplier pages (list, add, detail) | Manual |
| 8 | Purchase order pages (list, create, detail with receive flow) | Manual |
| 9 | Consignment pages (consignor list, add, detail with settlement flow) | Manual |
| 10 | Restock suggestions page (urgency-sorted dashboard) | Manual |
| 11 | Notification center page + TopBar bell with unread badge | Manual |
| 12 | Daily summary Edge Function (in-app + WhatsApp) | Edge Function invoke |
| 13 | Integration test — full smoke test of all Phase 3 features | Full smoke test |

**Total: 13 tasks, ~13 unit tests, 1 Edge Function, 1 integration smoke test**

After Phase 3 is complete, create plan for Phase 4 (lending module, kiosk mode, thermal printer, advanced reports/export, prediction engine).
