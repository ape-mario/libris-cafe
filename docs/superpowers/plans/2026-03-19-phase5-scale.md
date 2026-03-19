# Phase 5: Scale — Multi-Outlet Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Enable owners to manage multiple cafe outlets — switch between outlets, transfer stock between them, view consolidated cross-outlet reports, and assign staff to specific outlets.

**Architecture:** The `outlet_id` foreign key already exists on all business tables from Phase 1. RLS policies already scope data by outlet. Phase 5 activates these: add outlet CRUD for owners, an outlet picker in TopBar, inter-outlet transfer workflow (request → approve → ship → receive) with stock_movement audit trail, consolidated reporting via Supabase RPC functions, and per-outlet staff assignment management.

**Tech Stack:** SvelteKit 2 + Svelte 5, Tailwind CSS v4, Supabase (Postgres RPC, RLS, Realtime), Vitest, Chart.js (existing from Phase 2/4)

**Spec Reference:** `docs/superpowers/specs/2026-03-19-libris-cafe-design.md`

---

## File Structure

### New Files

```
src/lib/
├── modules/
│   ├── outlet/
│   │   ├── types.ts                    # Outlet, OutletTransfer types
│   │   ├── service.ts                  # Outlet CRUD, switching, transfer workflow
│   │   ├── service.test.ts             # Outlet service tests
│   │   ├── transfer.ts                 # Transfer state machine logic
│   │   ├── transfer.test.ts            # Transfer logic tests
│   │   └── stores.svelte.ts            # activeOutlet, outlets list, transfers
│   │
│   └── reporting/
│       ├── types.ts                    # ConsolidatedReport types
│       ├── consolidated.ts             # Cross-outlet aggregation service
│       └── consolidated.test.ts        # Consolidated reporting tests

src/routes/
├── owner/
│   ├── outlets/
│   │   ├── +page.svelte               # Outlet list + create
│   │   └── [id]/
│   │       ├── +page.svelte            # Outlet detail/edit
│   │       └── staff/
│   │           └── +page.svelte        # Per-outlet staff management
│   ├── transfers/
│   │   ├── +page.svelte               # Transfer list (all outlets)
│   │   └── [id]/
│   │       └── +page.svelte            # Transfer detail / status tracking
│   └── reports/
│       └── consolidated/
│           └── +page.svelte            # Consolidated cross-outlet dashboard

src/lib/components/
├── OutletPicker.svelte                 # Outlet switcher dropdown for TopBar
├── TransferStatusBadge.svelte          # Status badge for transfer workflow
└── ConsolidatedChart.svelte            # Cross-outlet comparison charts

supabase/
├── migrations/
│   └── 00005_multi_outlet.sql          # outlet_transfer table, RPC functions, RLS updates
└── functions/
    └── consolidated-report/
        └── index.ts                    # Edge Function for heavy cross-outlet aggregation
```

### Modified Files

```
src/lib/components/TopBar.svelte            # Add OutletPicker for owner role
src/lib/components/BottomNav.svelte         # Add Outlets tab for owner
src/lib/modules/auth/stores.svelte.ts       # Add activeOutletId to auth state
src/lib/modules/auth/service.ts             # Persist active outlet selection
src/lib/modules/inventory/service.ts        # Filter by activeOutletId
src/lib/modules/pos/checkout.ts             # Use activeOutletId for transactions
src/lib/modules/dashboard/service.ts        # Add consolidated mode toggle
src/lib/i18n/en.ts                          # Add outlet, transfer, consolidated strings
src/lib/i18n/id.ts                          # Add outlet, transfer, consolidated strings
src/routes/owner/+layout.svelte             # Add outlets navigation
```

---

## Task 1: Database Migration — outlet_transfer Table, RPC Functions, RLS Updates

**Files:**
- Create: `supabase/migrations/00005_multi_outlet.sql`

- [ ] **Step 1: Create the multi-outlet migration**

Create `supabase/migrations/00005_multi_outlet.sql`:

```sql
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
```

- [ ] **Step 2: Apply migration locally**

```bash
npx supabase db reset
```

Expected: All tables created, new RPC functions available, no errors.

- [ ] **Step 3: Regenerate TypeScript types**

```bash
npx supabase gen types typescript --local > src/lib/supabase/types.ts
```

- [ ] **Step 4: Verify RPC functions exist**

Test in Supabase SQL Editor:

```sql
-- Should return empty results (no data yet), but no errors
SELECT * FROM rpc_consolidated_sales('2026-01-01', '2026-12-31');
SELECT * FROM rpc_consolidated_inventory();
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00005_multi_outlet.sql src/lib/supabase/types.ts
git commit -m "feat: add multi-outlet migration — transfer table, consolidated RPCs, RLS updates"
```

---

## Task 2: Outlet Module — Types, Service, Stores

**Files:**
- Create: `src/lib/modules/outlet/types.ts`
- Create: `src/lib/modules/outlet/service.ts`
- Create: `src/lib/modules/outlet/service.test.ts`
- Create: `src/lib/modules/outlet/stores.svelte.ts`

- [ ] **Step 1: Define outlet types**

Create `src/lib/modules/outlet/types.ts`:

```typescript
export interface Outlet {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  tax_rate: number;
  created_at: string;
}

export interface OutletTransfer {
  id: string;
  from_outlet_id: string;
  to_outlet_id: string;
  status: TransferStatus;
  requested_by: string;
  approved_by: string | null;
  shipped_by: string | null;
  received_by: string | null;
  notes: string | null;
  requested_at: string;
  approved_at: string | null;
  shipped_at: string | null;
  received_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields (populated by service)
  from_outlet?: Outlet;
  to_outlet?: Outlet;
  items?: OutletTransferItem[];
  requested_by_staff?: { id: string; name: string };
}

export type TransferStatus = 'requested' | 'approved' | 'shipped' | 'received' | 'cancelled';

export interface OutletTransferItem {
  id: string;
  transfer_id: string;
  inventory_id: string;
  book_id: string;
  title: string;
  quantity_requested: number;
  quantity_shipped: number;
  quantity_received: number;
}

export interface CreateTransferRequest {
  from_outlet_id: string;
  to_outlet_id: string;
  items: {
    inventory_id: string;
    book_id: string;
    title: string;
    quantity_requested: number;
  }[];
  notes?: string;
}

export interface ConsolidatedSalesRow {
  outlet_id: string;
  outlet_name: string;
  total_sales: number;
  total_transactions: number;
  total_items_sold: number;
  avg_transaction_value: number;
  total_tax: number;
  total_discount: number;
  net_revenue: number;
}

export interface ConsolidatedInventoryRow {
  outlet_id: string;
  outlet_name: string;
  total_skus: number;
  total_stock: number;
  total_stock_value: number;
  low_stock_count: number;
  out_of_stock_count: number;
}

export interface DailyTrendRow {
  sale_date: string;
  outlet_id: string;
  outlet_name: string;
  daily_total: number;
  daily_transactions: number;
}

export interface TopBookRow {
  book_id: string;
  title: string;
  total_quantity: number;
  total_revenue: number;
  outlet_count: number;
}
```

- [ ] **Step 2: Create outlet stores**

Create `src/lib/modules/outlet/stores.svelte.ts`:

```typescript
import type { Outlet, OutletTransfer } from './types';

let outlets = $state<Outlet[]>([]);
let activeOutletId = $state<string | null>(null);
let pendingTransfers = $state<OutletTransfer[]>([]);

export function getOutlets(): Outlet[] {
  return outlets;
}

export function setOutlets(list: Outlet[]): void {
  outlets = list;
}

export function getActiveOutletId(): string | null {
  return activeOutletId;
}

export function getActiveOutlet(): Outlet | null {
  return outlets.find(o => o.id === activeOutletId) ?? null;
}

export function setActiveOutletId(id: string): void {
  activeOutletId = id;
  // Persist to localStorage so it survives page reload
  try {
    localStorage.setItem('libris_active_outlet', id);
  } catch {
    // localStorage unavailable
  }
}

export function restoreActiveOutlet(): string | null {
  try {
    const stored = localStorage.getItem('libris_active_outlet');
    if (stored) {
      activeOutletId = stored;
      return stored;
    }
  } catch {
    // localStorage unavailable
  }
  return null;
}

export function getPendingTransfers(): OutletTransfer[] {
  return pendingTransfers;
}

export function setPendingTransfers(transfers: OutletTransfer[]): void {
  pendingTransfers = transfers;
}

export function getPendingTransferCount(): number {
  return pendingTransfers.filter(t =>
    t.status === 'requested' || t.status === 'approved' || t.status === 'shipped'
  ).length;
}
```

- [ ] **Step 3: Create outlet service**

Create `src/lib/modules/outlet/service.ts`:

```typescript
import { getSupabase } from '$lib/supabase/client';
import type { Outlet } from './types';

// ── Outlet CRUD ──────────────────────────────────────────────

export async function fetchOutlets(): Promise<Outlet[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('outlet')
    .select('*')
    .order('name');

  if (error) throw new Error(`Failed to fetch outlets: ${error.message}`);
  return data ?? [];
}

export async function fetchOutlet(id: string): Promise<Outlet | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('outlet')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // not found
    throw new Error(`Failed to fetch outlet: ${error.message}`);
  }
  return data;
}

export async function createOutlet(outlet: {
  name: string;
  address?: string;
  phone?: string;
  tax_rate?: number;
}): Promise<Outlet> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('outlet')
    .insert({
      name: outlet.name,
      address: outlet.address ?? null,
      phone: outlet.phone ?? null,
      tax_rate: outlet.tax_rate ?? 11.00,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create outlet: ${error.message}`);
  return data;
}

export async function updateOutlet(
  id: string,
  updates: Partial<Pick<Outlet, 'name' | 'address' | 'phone' | 'tax_rate'>>
): Promise<Outlet> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('outlet')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update outlet: ${error.message}`);
  return data;
}

export async function deleteOutlet(id: string): Promise<void> {
  const supabase = getSupabase();

  // Safety check: ensure no inventory or transactions reference this outlet
  const { count: invCount } = await supabase
    .from('inventory')
    .select('id', { count: 'exact', head: true })
    .eq('outlet_id', id);

  if (invCount && invCount > 0) {
    throw new Error('Cannot delete outlet with existing inventory. Transfer or remove inventory first.');
  }

  const { count: txCount } = await supabase
    .from('transaction')
    .select('id', { count: 'exact', head: true })
    .eq('outlet_id', id);

  if (txCount && txCount > 0) {
    throw new Error('Cannot delete outlet with transaction history. Archive the outlet instead.');
  }

  const { error } = await supabase
    .from('outlet')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Failed to delete outlet: ${error.message}`);
}

// ── Staff Assignment ─────────────────────────────────────────

export async function fetchStaffByOutlet(outletId: string): Promise<any[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('staff')
    .select('*')
    .eq('outlet_id', outletId)
    .eq('is_active', true)
    .order('name');

  if (error) throw new Error(`Failed to fetch staff: ${error.message}`);
  return data ?? [];
}

export async function reassignStaff(staffId: string, newOutletId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('staff')
    .update({ outlet_id: newOutletId })
    .eq('id', staffId);

  if (error) throw new Error(`Failed to reassign staff: ${error.message}`);
}

export async function fetchAllStaffGroupedByOutlet(): Promise<Map<string, any[]>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('staff')
    .select('*, outlet:outlet_id(id, name)')
    .eq('is_active', true)
    .order('name');

  if (error) throw new Error(`Failed to fetch all staff: ${error.message}`);

  const grouped = new Map<string, any[]>();
  for (const s of data ?? []) {
    const outletId = s.outlet_id ?? 'unassigned';
    if (!grouped.has(outletId)) grouped.set(outletId, []);
    grouped.get(outletId)!.push(s);
  }
  return grouped;
}
```

- [ ] **Step 4: Write outlet service tests**

Create `src/lib/modules/outlet/service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase client
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockFrom = vi.fn(() => ({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  delete: mockDelete,
}));

vi.mock('$lib/supabase/client', () => ({
  getSupabase: () => ({ from: mockFrom }),
}));

import { fetchOutlets, createOutlet, deleteOutlet } from './service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Outlet Service', () => {
  it('should fetch all outlets', async () => {
    const mockData = [
      { id: 'o1', name: 'Main Cafe', address: 'Jl. Merdeka 1' },
      { id: 'o2', name: 'Branch Cafe', address: 'Jl. Sudirman 5' },
    ];
    mockSelect.mockReturnValue({
      order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
    });

    const outlets = await fetchOutlets();
    expect(outlets).toHaveLength(2);
    expect(outlets[0].name).toBe('Main Cafe');
    expect(mockFrom).toHaveBeenCalledWith('outlet');
  });

  it('should create an outlet', async () => {
    const newOutlet = { id: 'o3', name: 'New Branch', address: 'Jl. Asia 10', tax_rate: 11 };
    mockInsert.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: newOutlet, error: null }),
      }),
    });

    const result = await createOutlet({ name: 'New Branch', address: 'Jl. Asia 10' });
    expect(result.name).toBe('New Branch');
  });

  it('should reject deleting outlet with inventory', async () => {
    mockSelect.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ count: 5, error: null }),
    });

    // The select chain for inventory check
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ count: 5, error: null }),
      }),
    });

    await expect(deleteOutlet('o1')).rejects.toThrow('Cannot delete outlet with existing inventory');
  });
});
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run src/lib/modules/outlet/service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/modules/outlet/
git commit -m "feat: add outlet module — types, CRUD service, stores, staff assignment"
```

---

## Task 3: Transfer Workflow — State Machine & Service

**Files:**
- Create: `src/lib/modules/outlet/transfer.ts`
- Create: `src/lib/modules/outlet/transfer.test.ts`

- [ ] **Step 1: Implement transfer state machine and service**

Create `src/lib/modules/outlet/transfer.ts`:

```typescript
import { getSupabase } from '$lib/supabase/client';
import type {
  OutletTransfer,
  OutletTransferItem,
  CreateTransferRequest,
  TransferStatus,
} from './types';

// ── State Machine ────────────────────────────────────────────

const VALID_TRANSITIONS: Record<TransferStatus, TransferStatus[]> = {
  requested: ['approved', 'cancelled'],
  approved: ['shipped', 'cancelled'],
  shipped: ['received', 'cancelled'],
  received: [],
  cancelled: [],
};

export function canTransition(from: TransferStatus, to: TransferStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getNextStatuses(current: TransferStatus): TransferStatus[] {
  return VALID_TRANSITIONS[current] ?? [];
}

// ── Transfer CRUD ────────────────────────────────────────────

export async function createTransfer(request: CreateTransferRequest, staffId: string): Promise<OutletTransfer> {
  const supabase = getSupabase();

  // Validate: items must not be empty
  if (!request.items.length) {
    throw new Error('Transfer must include at least one item');
  }

  // Create transfer
  const { data: transfer, error: txError } = await supabase
    .from('outlet_transfer')
    .insert({
      from_outlet_id: request.from_outlet_id,
      to_outlet_id: request.to_outlet_id,
      requested_by: staffId,
      notes: request.notes ?? null,
    })
    .select()
    .single();

  if (txError) throw new Error(`Failed to create transfer: ${txError.message}`);

  // Create transfer items
  const items = request.items.map(item => ({
    transfer_id: transfer.id,
    inventory_id: item.inventory_id,
    book_id: item.book_id,
    title: item.title,
    quantity_requested: item.quantity_requested,
  }));

  const { error: itemError } = await supabase
    .from('outlet_transfer_item')
    .insert(items);

  if (itemError) throw new Error(`Failed to create transfer items: ${itemError.message}`);

  return transfer;
}

export async function fetchTransfers(options?: {
  outletId?: string;
  status?: TransferStatus;
}): Promise<OutletTransfer[]> {
  const supabase = getSupabase();
  let query = supabase
    .from('outlet_transfer')
    .select(`
      *,
      from_outlet:from_outlet_id(id, name),
      to_outlet:to_outlet_id(id, name),
      requested_by_staff:requested_by(id, name),
      items:outlet_transfer_item(*)
    `)
    .order('created_at', { ascending: false });

  if (options?.outletId) {
    query = query.or(`from_outlet_id.eq.${options.outletId},to_outlet_id.eq.${options.outletId}`);
  }

  if (options?.status) {
    query = query.eq('status', options.status);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch transfers: ${error.message}`);
  return data ?? [];
}

export async function fetchTransfer(id: string): Promise<OutletTransfer | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('outlet_transfer')
    .select(`
      *,
      from_outlet:from_outlet_id(id, name),
      to_outlet:to_outlet_id(id, name),
      requested_by_staff:requested_by(id, name),
      items:outlet_transfer_item(*)
    `)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to fetch transfer: ${error.message}`);
  }
  return data;
}

// ── Status Transitions ───────────────────────────────────────

export async function approveTransfer(transferId: string, staffId: string): Promise<void> {
  await transitionTransfer(transferId, 'approved', {
    approved_by: staffId,
    approved_at: new Date().toISOString(),
  });
}

export async function shipTransfer(
  transferId: string,
  staffId: string,
  shippedQuantities: { itemId: string; quantity: number }[]
): Promise<void> {
  const supabase = getSupabase();

  // Update shipped quantities on items
  for (const sq of shippedQuantities) {
    const { error } = await supabase
      .from('outlet_transfer_item')
      .update({ quantity_shipped: sq.quantity })
      .eq('id', sq.itemId);

    if (error) throw new Error(`Failed to update shipped quantity: ${error.message}`);
  }

  // Transition status
  await transitionTransfer(transferId, 'shipped', {
    shipped_by: staffId,
    shipped_at: new Date().toISOString(),
  });

  // Create stock_movement entries (transfer_out from source outlet)
  const transfer = await fetchTransfer(transferId);
  if (!transfer?.items) return;

  for (const item of transfer.items) {
    if (item.quantity_shipped > 0) {
      const { error } = await supabase
        .from('stock_movement')
        .insert({
          inventory_id: item.inventory_id,
          type: 'transfer_out',
          quantity: -item.quantity_shipped,
          reference_id: transferId,
          reason: `Transfer to ${transfer.to_outlet?.name ?? transfer.to_outlet_id}`,
          staff_id: staffId,
        });

      if (error) throw new Error(`Failed to create transfer_out movement: ${error.message}`);
    }
  }
}

export async function receiveTransfer(
  transferId: string,
  staffId: string,
  receivedQuantities: { itemId: string; inventoryId: string; quantity: number }[]
): Promise<void> {
  const supabase = getSupabase();

  // Update received quantities on items
  for (const rq of receivedQuantities) {
    const { error } = await supabase
      .from('outlet_transfer_item')
      .update({ quantity_received: rq.quantity })
      .eq('id', rq.itemId);

    if (error) throw new Error(`Failed to update received quantity: ${error.message}`);
  }

  // Transition status
  await transitionTransfer(transferId, 'received', {
    received_by: staffId,
    received_at: new Date().toISOString(),
  });

  // Create stock_movement entries (transfer_in to destination outlet)
  // We need to find or create inventory records at the destination outlet
  const transfer = await fetchTransfer(transferId);
  if (!transfer?.items) return;

  for (const rq of receivedQuantities) {
    if (rq.quantity > 0) {
      // Find matching item from transfer
      const item = transfer.items.find(i => i.id === rq.itemId);
      if (!item) continue;

      // Find or create inventory at destination outlet
      let destInventoryId = await findOrCreateDestinationInventory(
        item.book_id,
        item.inventory_id,
        transfer.to_outlet_id
      );

      const { error } = await supabase
        .from('stock_movement')
        .insert({
          inventory_id: destInventoryId,
          type: 'transfer_in',
          quantity: rq.quantity,
          reference_id: transferId,
          reason: `Transfer from ${transfer.from_outlet?.name ?? transfer.from_outlet_id}`,
          staff_id: staffId,
        });

      if (error) throw new Error(`Failed to create transfer_in movement: ${error.message}`);
    }
  }
}

export async function cancelTransfer(
  transferId: string,
  staffId: string,
  reason: string
): Promise<void> {
  const transfer = await fetchTransfer(transferId);
  if (!transfer) throw new Error('Transfer not found');

  // If already shipped, we need to reverse the stock_movement entries
  if (transfer.status === 'shipped' && transfer.items) {
    const supabase = getSupabase();
    for (const item of transfer.items) {
      if (item.quantity_shipped > 0) {
        // Restore stock at source outlet
        const { error } = await supabase
          .from('stock_movement')
          .insert({
            inventory_id: item.inventory_id,
            type: 'transfer_in',
            quantity: item.quantity_shipped,
            reference_id: transferId,
            reason: `Transfer cancelled: ${reason}`,
            staff_id: staffId,
          });

        if (error) throw new Error(`Failed to restore stock on cancel: ${error.message}`);
      }
    }
  }

  await transitionTransfer(transferId, 'cancelled', {
    cancelled_at: new Date().toISOString(),
    cancel_reason: reason,
  });
}

// ── Helpers ──────────────────────────────────────────────────

async function transitionTransfer(
  transferId: string,
  newStatus: TransferStatus,
  extraFields: Record<string, any>
): Promise<void> {
  const supabase = getSupabase();

  // Fetch current status
  const { data: current, error: fetchErr } = await supabase
    .from('outlet_transfer')
    .select('status')
    .eq('id', transferId)
    .single();

  if (fetchErr) throw new Error(`Transfer not found: ${fetchErr.message}`);

  if (!canTransition(current.status as TransferStatus, newStatus)) {
    throw new Error(
      `Invalid transition: cannot move from "${current.status}" to "${newStatus}"`
    );
  }

  const { error } = await supabase
    .from('outlet_transfer')
    .update({ status: newStatus, ...extraFields })
    .eq('id', transferId);

  if (error) throw new Error(`Failed to update transfer status: ${error.message}`);
}

async function findOrCreateDestinationInventory(
  bookId: string,
  sourceInventoryId: string,
  destOutletId: string
): Promise<string> {
  const supabase = getSupabase();

  // Check if inventory already exists at destination for this book
  const { data: existing } = await supabase
    .from('inventory')
    .select('id')
    .eq('book_id', bookId)
    .eq('outlet_id', destOutletId)
    .limit(1)
    .single();

  if (existing) return existing.id;

  // Copy inventory record from source (minus stock, which will be set by movement)
  const { data: source } = await supabase
    .from('inventory')
    .select('*')
    .eq('id', sourceInventoryId)
    .single();

  if (!source) throw new Error(`Source inventory not found: ${sourceInventoryId}`);

  const { data: newInv, error } = await supabase
    .from('inventory')
    .insert({
      book_id: source.book_id,
      outlet_id: destOutletId,
      type: source.type,
      source: source.source,
      is_preloved: source.is_preloved,
      price: source.price,
      cost_price: source.cost_price,
      stock: 0,  // Will be updated by stock_movement trigger
      min_stock: source.min_stock,
      location: null,  // Location will differ at destination
      condition: source.condition,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create destination inventory: ${error.message}`);
  return newInv.id;
}
```

- [ ] **Step 2: Write transfer state machine tests**

Create `src/lib/modules/outlet/transfer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { canTransition, getNextStatuses } from './transfer';
import type { TransferStatus } from './types';

describe('Transfer State Machine', () => {
  it('should allow requested → approved', () => {
    expect(canTransition('requested', 'approved')).toBe(true);
  });

  it('should allow requested → cancelled', () => {
    expect(canTransition('requested', 'cancelled')).toBe(true);
  });

  it('should allow approved → shipped', () => {
    expect(canTransition('approved', 'shipped')).toBe(true);
  });

  it('should allow shipped → received', () => {
    expect(canTransition('shipped', 'received')).toBe(true);
  });

  it('should not allow skipping steps (requested → shipped)', () => {
    expect(canTransition('requested', 'shipped')).toBe(false);
  });

  it('should not allow backwards (received → shipped)', () => {
    expect(canTransition('received', 'shipped')).toBe(false);
  });

  it('should not allow transition from received', () => {
    expect(getNextStatuses('received')).toEqual([]);
  });

  it('should not allow transition from cancelled', () => {
    expect(getNextStatuses('cancelled')).toEqual([]);
  });

  it('should allow cancel from any active status', () => {
    const activeStatuses: TransferStatus[] = ['requested', 'approved', 'shipped'];
    for (const status of activeStatuses) {
      expect(canTransition(status, 'cancelled')).toBe(true);
    }
  });

  it('should return correct next statuses', () => {
    expect(getNextStatuses('requested')).toEqual(['approved', 'cancelled']);
    expect(getNextStatuses('approved')).toEqual(['shipped', 'cancelled']);
    expect(getNextStatuses('shipped')).toEqual(['received', 'cancelled']);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/lib/modules/outlet/transfer.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/modules/outlet/transfer.ts src/lib/modules/outlet/transfer.test.ts
git commit -m "feat: add inter-outlet transfer — state machine, CRUD, stock movement integration"
```

---

## Task 4: Consolidated Reporting Service

**Files:**
- Create: `src/lib/modules/reporting/types.ts`
- Create: `src/lib/modules/reporting/consolidated.ts`
- Create: `src/lib/modules/reporting/consolidated.test.ts`

- [ ] **Step 1: Define reporting types**

Create `src/lib/modules/reporting/types.ts`:

```typescript
// Re-export types from outlet module that are used in reporting
export type {
  ConsolidatedSalesRow,
  ConsolidatedInventoryRow,
  DailyTrendRow,
  TopBookRow,
} from '../outlet/types';

export interface DateRange {
  from: string;  // ISO date string (YYYY-MM-DD)
  to: string;
}

export interface ConsolidatedReportFilters {
  dateRange: DateRange;
  outletIds?: string[];  // null = all outlets
}

export interface ConsolidatedDashboard {
  sales: import('../outlet/types').ConsolidatedSalesRow[];
  inventory: import('../outlet/types').ConsolidatedInventoryRow[];
  dailyTrend: import('../outlet/types').DailyTrendRow[];
  topBooks: import('../outlet/types').TopBookRow[];
  totals: {
    totalSales: number;
    totalTransactions: number;
    totalItemsSold: number;
    avgTransactionValue: number;
    totalSkus: number;
    totalStock: number;
    totalStockValue: number;
  };
}
```

- [ ] **Step 2: Create consolidated reporting service**

Create `src/lib/modules/reporting/consolidated.ts`:

```typescript
import { getSupabase } from '$lib/supabase/client';
import type {
  ConsolidatedSalesRow,
  ConsolidatedInventoryRow,
  DailyTrendRow,
  TopBookRow,
  ConsolidatedReportFilters,
  ConsolidatedDashboard,
} from './types';

export async function fetchConsolidatedSales(
  dateFrom: string,
  dateTo: string,
  outletIds?: string[]
): Promise<ConsolidatedSalesRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('rpc_consolidated_sales', {
    p_date_from: dateFrom,
    p_date_to: dateTo,
    p_outlet_ids: outletIds ?? null,
  });

  if (error) throw new Error(`Failed to fetch consolidated sales: ${error.message}`);
  return data ?? [];
}

export async function fetchConsolidatedInventory(
  outletIds?: string[]
): Promise<ConsolidatedInventoryRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('rpc_consolidated_inventory', {
    p_outlet_ids: outletIds ?? null,
  });

  if (error) throw new Error(`Failed to fetch consolidated inventory: ${error.message}`);
  return data ?? [];
}

export async function fetchConsolidatedDailyTrend(
  dateFrom: string,
  dateTo: string,
  outletIds?: string[]
): Promise<DailyTrendRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('rpc_consolidated_daily_trend', {
    p_date_from: dateFrom,
    p_date_to: dateTo,
    p_outlet_ids: outletIds ?? null,
  });

  if (error) throw new Error(`Failed to fetch daily trend: ${error.message}`);
  return data ?? [];
}

export async function fetchConsolidatedTopBooks(
  dateFrom: string,
  dateTo: string,
  limit: number = 10,
  outletIds?: string[]
): Promise<TopBookRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('rpc_consolidated_top_books', {
    p_date_from: dateFrom,
    p_date_to: dateTo,
    p_limit: limit,
    p_outlet_ids: outletIds ?? null,
  });

  if (error) throw new Error(`Failed to fetch top books: ${error.message}`);
  return data ?? [];
}

export async function fetchConsolidatedDashboard(
  filters: ConsolidatedReportFilters
): Promise<ConsolidatedDashboard> {
  const { dateRange, outletIds } = filters;

  // Fetch all reports in parallel
  const [sales, inventory, dailyTrend, topBooks] = await Promise.all([
    fetchConsolidatedSales(dateRange.from, dateRange.to, outletIds),
    fetchConsolidatedInventory(outletIds),
    fetchConsolidatedDailyTrend(dateRange.from, dateRange.to, outletIds),
    fetchConsolidatedTopBooks(dateRange.from, dateRange.to, 10, outletIds),
  ]);

  // Calculate grand totals
  const totals = {
    totalSales: sales.reduce((sum, r) => sum + Number(r.total_sales), 0),
    totalTransactions: sales.reduce((sum, r) => sum + Number(r.total_transactions), 0),
    totalItemsSold: sales.reduce((sum, r) => sum + Number(r.total_items_sold), 0),
    avgTransactionValue: 0,
    totalSkus: inventory.reduce((sum, r) => sum + Number(r.total_skus), 0),
    totalStock: inventory.reduce((sum, r) => sum + Number(r.total_stock), 0),
    totalStockValue: inventory.reduce((sum, r) => sum + Number(r.total_stock_value), 0),
  };
  totals.avgTransactionValue = totals.totalTransactions > 0
    ? totals.totalSales / totals.totalTransactions
    : 0;

  return { sales, inventory, dailyTrend, topBooks, totals };
}

// ── Utility: Format currency for reports ─────────────────────

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ── Utility: Group daily trend by outlet for charting ────────

export function groupTrendByOutlet(
  trend: DailyTrendRow[]
): Map<string, { dates: string[]; totals: number[]; name: string }> {
  const grouped = new Map<string, { dates: string[]; totals: number[]; name: string }>();

  for (const row of trend) {
    if (!grouped.has(row.outlet_id)) {
      grouped.set(row.outlet_id, { dates: [], totals: [], name: row.outlet_name });
    }
    const entry = grouped.get(row.outlet_id)!;
    entry.dates.push(row.sale_date);
    entry.totals.push(Number(row.daily_total));
  }

  return grouped;
}
```

- [ ] **Step 3: Write consolidated reporting tests**

Create `src/lib/modules/reporting/consolidated.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { formatRupiah, groupTrendByOutlet } from './consolidated';
import type { DailyTrendRow, ConsolidatedDashboard } from './types';

describe('Consolidated Reporting Utilities', () => {
  it('should format rupiah correctly', () => {
    expect(formatRupiah(89000)).toBe('Rp89.000');
    expect(formatRupiah(1500000)).toBe('Rp1.500.000');
    expect(formatRupiah(0)).toBe('Rp0');
  });

  it('should group daily trend by outlet', () => {
    const trend: DailyTrendRow[] = [
      { sale_date: '2026-03-01', outlet_id: 'o1', outlet_name: 'Main', daily_total: 500000, daily_transactions: 5 },
      { sale_date: '2026-03-01', outlet_id: 'o2', outlet_name: 'Branch', daily_total: 300000, daily_transactions: 3 },
      { sale_date: '2026-03-02', outlet_id: 'o1', outlet_name: 'Main', daily_total: 600000, daily_transactions: 6 },
      { sale_date: '2026-03-02', outlet_id: 'o2', outlet_name: 'Branch', daily_total: 400000, daily_transactions: 4 },
    ];

    const grouped = groupTrendByOutlet(trend);
    expect(grouped.size).toBe(2);

    const main = grouped.get('o1')!;
    expect(main.name).toBe('Main');
    expect(main.dates).toEqual(['2026-03-01', '2026-03-02']);
    expect(main.totals).toEqual([500000, 600000]);

    const branch = grouped.get('o2')!;
    expect(branch.name).toBe('Branch');
    expect(branch.totals).toEqual([300000, 400000]);
  });

  it('should handle empty trend data', () => {
    const grouped = groupTrendByOutlet([]);
    expect(grouped.size).toBe(0);
  });
});
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/lib/modules/reporting/consolidated.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/reporting/
git commit -m "feat: add consolidated reporting module — cross-outlet sales, inventory, trends"
```

---

## Task 5: i18n Strings for Multi-Outlet

**Files:**
- Modify: `src/lib/i18n/en.ts`
- Modify: `src/lib/i18n/id.ts`

- [ ] **Step 1: Add English strings**

Add to `src/lib/i18n/en.ts`:

```typescript
// Outlets
'outlet.title': 'Outlets',
'outlet.add': 'Add Outlet',
'outlet.edit': 'Edit Outlet',
'outlet.name': 'Outlet Name',
'outlet.address': 'Address',
'outlet.phone': 'Phone',
'outlet.tax_rate': 'Tax Rate (%)',
'outlet.delete': 'Delete Outlet',
'outlet.delete_confirm': 'Are you sure you want to delete this outlet?',
'outlet.switch': 'Switch Outlet',
'outlet.current': 'Current Outlet',
'outlet.all': 'All Outlets',
'outlet.staff_count': '{count} staff',
'outlet.no_outlets': 'No outlets yet',
'outlet.created': 'Outlet created',
'outlet.updated': 'Outlet updated',
'outlet.deleted': 'Outlet deleted',

// Staff Management (per-outlet)
'outlet.staff': 'Staff',
'outlet.staff.title': 'Staff Management',
'outlet.staff.reassign': 'Reassign Staff',
'outlet.staff.reassign_to': 'Move to outlet',
'outlet.staff.reassigned': 'Staff reassigned successfully',
'outlet.staff.no_staff': 'No staff assigned to this outlet',

// Transfers
'transfer.title': 'Transfers',
'transfer.create': 'New Transfer',
'transfer.from': 'From Outlet',
'transfer.to': 'To Outlet',
'transfer.items': 'Items',
'transfer.add_item': 'Add Book',
'transfer.quantity': 'Quantity',
'transfer.notes': 'Notes',
'transfer.status': 'Status',
'transfer.status.requested': 'Requested',
'transfer.status.approved': 'Approved',
'transfer.status.shipped': 'Shipped',
'transfer.status.received': 'Received',
'transfer.status.cancelled': 'Cancelled',
'transfer.approve': 'Approve Transfer',
'transfer.ship': 'Mark as Shipped',
'transfer.receive': 'Confirm Received',
'transfer.cancel': 'Cancel Transfer',
'transfer.cancel_reason': 'Cancellation reason',
'transfer.requested_by': 'Requested by',
'transfer.requested_at': 'Requested at',
'transfer.approved_at': 'Approved at',
'transfer.shipped_at': 'Shipped at',
'transfer.received_at': 'Received at',
'transfer.qty_requested': 'Requested',
'transfer.qty_shipped': 'Shipped',
'transfer.qty_received': 'Received',
'transfer.empty': 'No transfers yet',
'transfer.created': 'Transfer request created',
'transfer.approved': 'Transfer approved',
'transfer.shipped': 'Transfer marked as shipped',
'transfer.received': 'Transfer received — stock updated',
'transfer.cancelled': 'Transfer cancelled',

// Consolidated Reports
'consolidated.title': 'Consolidated Report',
'consolidated.all_outlets': 'All Outlets',
'consolidated.filter_outlets': 'Filter Outlets',
'consolidated.date_range': 'Date Range',
'consolidated.total_sales': 'Total Sales',
'consolidated.total_transactions': 'Transactions',
'consolidated.total_items': 'Items Sold',
'consolidated.avg_transaction': 'Avg Transaction',
'consolidated.net_revenue': 'Net Revenue',
'consolidated.total_skus': 'Total SKUs',
'consolidated.total_stock': 'Total Stock',
'consolidated.stock_value': 'Stock Value',
'consolidated.low_stock': 'Low Stock',
'consolidated.out_of_stock': 'Out of Stock',
'consolidated.top_books': 'Top Selling Books',
'consolidated.daily_trend': 'Daily Sales Trend',
'consolidated.by_outlet': 'By Outlet',
'consolidated.sales_comparison': 'Sales Comparison',
'consolidated.inventory_overview': 'Inventory Overview',

// Nav
'nav.outlets': 'Outlets',
'nav.transfers': 'Transfers',
```

- [ ] **Step 2: Add Indonesian strings**

Add to `src/lib/i18n/id.ts`:

```typescript
// Outlets
'outlet.title': 'Outlet',
'outlet.add': 'Tambah Outlet',
'outlet.edit': 'Edit Outlet',
'outlet.name': 'Nama Outlet',
'outlet.address': 'Alamat',
'outlet.phone': 'Telepon',
'outlet.tax_rate': 'Tarif Pajak (%)',
'outlet.delete': 'Hapus Outlet',
'outlet.delete_confirm': 'Yakin ingin menghapus outlet ini?',
'outlet.switch': 'Ganti Outlet',
'outlet.current': 'Outlet Aktif',
'outlet.all': 'Semua Outlet',
'outlet.staff_count': '{count} staf',
'outlet.no_outlets': 'Belum ada outlet',
'outlet.created': 'Outlet dibuat',
'outlet.updated': 'Outlet diperbarui',
'outlet.deleted': 'Outlet dihapus',

// Staff Management (per-outlet)
'outlet.staff': 'Staf',
'outlet.staff.title': 'Manajemen Staf',
'outlet.staff.reassign': 'Pindahkan Staf',
'outlet.staff.reassign_to': 'Pindah ke outlet',
'outlet.staff.reassigned': 'Staf berhasil dipindahkan',
'outlet.staff.no_staff': 'Belum ada staf di outlet ini',

// Transfers
'transfer.title': 'Transfer',
'transfer.create': 'Transfer Baru',
'transfer.from': 'Dari Outlet',
'transfer.to': 'Ke Outlet',
'transfer.items': 'Item',
'transfer.add_item': 'Tambah Buku',
'transfer.quantity': 'Jumlah',
'transfer.notes': 'Catatan',
'transfer.status': 'Status',
'transfer.status.requested': 'Diminta',
'transfer.status.approved': 'Disetujui',
'transfer.status.shipped': 'Dikirim',
'transfer.status.received': 'Diterima',
'transfer.status.cancelled': 'Dibatalkan',
'transfer.approve': 'Setujui Transfer',
'transfer.ship': 'Tandai Dikirim',
'transfer.receive': 'Konfirmasi Diterima',
'transfer.cancel': 'Batalkan Transfer',
'transfer.cancel_reason': 'Alasan pembatalan',
'transfer.requested_by': 'Diminta oleh',
'transfer.requested_at': 'Waktu permintaan',
'transfer.approved_at': 'Waktu disetujui',
'transfer.shipped_at': 'Waktu dikirim',
'transfer.received_at': 'Waktu diterima',
'transfer.qty_requested': 'Diminta',
'transfer.qty_shipped': 'Dikirim',
'transfer.qty_received': 'Diterima',
'transfer.empty': 'Belum ada transfer',
'transfer.created': 'Permintaan transfer dibuat',
'transfer.approved': 'Transfer disetujui',
'transfer.shipped': 'Transfer ditandai dikirim',
'transfer.received': 'Transfer diterima — stok diperbarui',
'transfer.cancelled': 'Transfer dibatalkan',

// Consolidated Reports
'consolidated.title': 'Laporan Konsolidasi',
'consolidated.all_outlets': 'Semua Outlet',
'consolidated.filter_outlets': 'Filter Outlet',
'consolidated.date_range': 'Rentang Tanggal',
'consolidated.total_sales': 'Total Penjualan',
'consolidated.total_transactions': 'Transaksi',
'consolidated.total_items': 'Item Terjual',
'consolidated.avg_transaction': 'Rata-rata Transaksi',
'consolidated.net_revenue': 'Pendapatan Bersih',
'consolidated.total_skus': 'Total SKU',
'consolidated.total_stock': 'Total Stok',
'consolidated.stock_value': 'Nilai Stok',
'consolidated.low_stock': 'Stok Rendah',
'consolidated.out_of_stock': 'Habis',
'consolidated.top_books': 'Buku Terlaris',
'consolidated.daily_trend': 'Tren Penjualan Harian',
'consolidated.by_outlet': 'Per Outlet',
'consolidated.sales_comparison': 'Perbandingan Penjualan',
'consolidated.inventory_overview': 'Ringkasan Inventaris',

// Nav
'nav.outlets': 'Outlet',
'nav.transfers': 'Transfer',
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/i18n/en.ts src/lib/i18n/id.ts
git commit -m "feat: add i18n strings for multi-outlet, transfers, consolidated reports (EN/ID)"
```

---

## Task 6: OutletPicker Component & TopBar Integration

**Files:**
- Create: `src/lib/components/OutletPicker.svelte`
- Create: `src/lib/components/TransferStatusBadge.svelte`
- Modify: `src/lib/components/TopBar.svelte`

- [ ] **Step 1: Create OutletPicker component**

Create `src/lib/components/OutletPicker.svelte`:

```svelte
<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import {
    getOutlets,
    getActiveOutletId,
    getActiveOutlet,
    setActiveOutletId,
  } from '$lib/modules/outlet/stores.svelte';

  let open = $state(false);
  let outlets = $derived(getOutlets());
  let activeOutlet = $derived(getActiveOutlet());
  let activeOutletId = $derived(getActiveOutletId());

  function selectOutlet(outletId: string) {
    setActiveOutletId(outletId);
    open = false;
    // Dispatch event so other components can react
    window.dispatchEvent(new CustomEvent('outlet-changed', { detail: { outletId } }));
  }

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.outlet-picker')) {
      open = false;
    }
  }
</script>

<svelte:window onclick={handleClickOutside} />

{#if outlets.length > 1}
  <div class="outlet-picker relative">
    <button
      class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg
             bg-warm-100 hover:bg-warm-200 transition-colors
             text-sm font-medium text-warm-700"
      onclick={() => { open = !open; }}
      aria-expanded={open}
      aria-haspopup="listbox"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2" stroke-linecap="round"
           stroke-linejoin="round" class="text-warm-500">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
      <span class="max-w-[120px] truncate">{activeOutlet?.name ?? t('outlet.switch')}</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2" class="text-warm-400"
           class:rotate-180={open}>
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </button>

    {#if open}
      <div
        class="absolute top-full left-0 mt-1 w-56 bg-white rounded-xl
               shadow-lg border border-warm-200 py-1 z-50"
        role="listbox"
        aria-label={t('outlet.switch')}
      >
        <div class="px-3 py-1.5 text-xs font-medium text-warm-400 uppercase tracking-wider">
          {t('outlet.switch')}
        </div>
        {#each outlets as outlet (outlet.id)}
          <button
            class="w-full flex items-center gap-2 px-3 py-2 text-sm text-left
                   hover:bg-warm-50 transition-colors
                   {outlet.id === activeOutletId ? 'text-sage-700 font-medium bg-sage-50' : 'text-warm-600'}"
            role="option"
            aria-selected={outlet.id === activeOutletId}
            onclick={() => selectOutlet(outlet.id)}
          >
            {#if outlet.id === activeOutletId}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2.5" class="text-sage">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            {:else}
              <div class="w-3.5"></div>
            {/if}
            <div>
              <div class="leading-tight">{outlet.name}</div>
              {#if outlet.address}
                <div class="text-xs text-warm-400 truncate max-w-[180px]">{outlet.address}</div>
              {/if}
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </div>
{:else if outlets.length === 1}
  <div class="text-sm font-medium text-warm-500 px-2">
    {outlets[0].name}
  </div>
{/if}
```

- [ ] **Step 2: Create TransferStatusBadge component**

Create `src/lib/components/TransferStatusBadge.svelte`:

```svelte
<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import type { TransferStatus } from '$lib/modules/outlet/types';

  let { status }: { status: TransferStatus } = $props();

  const statusConfig: Record<TransferStatus, { bg: string; text: string }> = {
    requested: { bg: 'bg-gold/20', text: 'text-gold-700' },
    approved: { bg: 'bg-sky-100', text: 'text-sky-700' },
    shipped: { bg: 'bg-violet-100', text: 'text-violet-700' },
    received: { bg: 'bg-sage/20', text: 'text-sage-700' },
    cancelled: { bg: 'bg-warm-100', text: 'text-warm-500' },
  };

  let config = $derived(statusConfig[status]);
</script>

<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium {config.bg} {config.text}">
  {t(`transfer.status.${status}`)}
</span>
```

- [ ] **Step 3: Integrate OutletPicker into TopBar**

In `src/lib/components/TopBar.svelte`, add the outlet picker next to the user/staff info area.

Add import at the top of the `<script>` block:

```typescript
import OutletPicker from './OutletPicker.svelte';
import { isOwner } from '$lib/modules/auth/stores.svelte';
```

Add the component in the template, after the sync status indicator and before the add-book button:

```svelte
{#if isOwner()}
  <OutletPicker />
{/if}
```

- [ ] **Step 4: Modify auth stores to include active outlet**

In `src/lib/modules/auth/stores.svelte.ts`, add outlet initialization to the login flow:

```typescript
import { restoreActiveOutlet, setActiveOutletId, setOutlets } from '../outlet/stores.svelte';
import { fetchOutlets } from '../outlet/service';

// Add to the login/session restore logic:
export async function initOutletContext(): Promise<void> {
  try {
    const outlets = await fetchOutlets();
    setOutlets(outlets);

    // Restore previously selected outlet, or default to first
    const restored = restoreActiveOutlet();
    if (!restored && outlets.length > 0) {
      setActiveOutletId(outlets[0].id);
    }
  } catch {
    // Supabase not configured or fetch failed — single-outlet mode
  }
}
```

- [ ] **Step 5: Update auth service to call initOutletContext on login**

In `src/lib/modules/auth/service.ts`, after successful PIN authentication, call:

```typescript
import { initOutletContext } from './stores.svelte';

// Inside the login function, after setting current staff:
await initOutletContext();
```

And in the session restore logic:

```typescript
// Inside restoreSession, after confirming staff exists:
await initOutletContext();
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/OutletPicker.svelte src/lib/components/TransferStatusBadge.svelte src/lib/components/TopBar.svelte src/lib/modules/auth/
git commit -m "feat: add OutletPicker in TopBar — owner can switch active outlet"
```

---

## Task 7: Outlet Management Pages

**Files:**
- Create: `src/routes/owner/outlets/+page.svelte`
- Create: `src/routes/owner/outlets/[id]/+page.svelte`
- Create: `src/routes/owner/outlets/[id]/staff/+page.svelte`

- [ ] **Step 1: Create outlet list page**

Create `src/routes/owner/outlets/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/index.svelte';
  import { base } from '$app/paths';
  import { showToast } from '$lib/stores/toast.svelte';
  import { showConfirm } from '$lib/stores/dialog.svelte';
  import { fetchOutlets, createOutlet, deleteOutlet } from '$lib/modules/outlet/service';
  import { setOutlets } from '$lib/modules/outlet/stores.svelte';
  import type { Outlet } from '$lib/modules/outlet/types';

  let outlets = $state<Outlet[]>([]);
  let loading = $state(true);
  let showForm = $state(false);
  let newName = $state('');
  let newAddress = $state('');
  let newPhone = $state('');
  let newTaxRate = $state(11);
  let creating = $state(false);

  onMount(async () => {
    await loadOutlets();
  });

  async function loadOutlets() {
    loading = true;
    try {
      outlets = await fetchOutlets();
      setOutlets(outlets);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      loading = false;
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    creating = true;
    try {
      await createOutlet({
        name: newName.trim(),
        address: newAddress.trim() || undefined,
        phone: newPhone.trim() || undefined,
        tax_rate: newTaxRate,
      });
      showToast(t('outlet.created'), 'success');
      showForm = false;
      newName = '';
      newAddress = '';
      newPhone = '';
      newTaxRate = 11;
      await loadOutlets();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      creating = false;
    }
  }

  async function handleDelete(outlet: Outlet) {
    const confirmed = await showConfirm(t('outlet.delete_confirm'));
    if (!confirmed) return;
    try {
      await deleteOutlet(outlet.id);
      showToast(t('outlet.deleted'), 'success');
      await loadOutlets();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  }
</script>

<div class="p-4 max-w-2xl mx-auto">
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold text-warm-800">{t('outlet.title')}</h1>
    <button
      class="px-4 py-2 bg-sage text-white rounded-lg font-medium
             hover:bg-sage-600 transition-colors"
      onclick={() => { showForm = !showForm; }}
    >
      {t('outlet.add')}
    </button>
  </div>

  {#if showForm}
    <form
      class="bg-white rounded-xl border border-warm-200 p-4 mb-6 space-y-3"
      onsubmit={(e) => { e.preventDefault(); handleCreate(); }}
    >
      <div>
        <label class="block text-sm font-medium text-warm-600 mb-1">{t('outlet.name')}</label>
        <input
          type="text"
          bind:value={newName}
          required
          class="w-full px-3 py-2 rounded-lg border border-warm-200 focus:border-sage
                 focus:ring-1 focus:ring-sage outline-none"
          placeholder="Libris Cafe Kemang"
        />
      </div>
      <div>
        <label class="block text-sm font-medium text-warm-600 mb-1">{t('outlet.address')}</label>
        <input
          type="text"
          bind:value={newAddress}
          class="w-full px-3 py-2 rounded-lg border border-warm-200 focus:border-sage
                 focus:ring-1 focus:ring-sage outline-none"
          placeholder="Jl. Kemang Raya No. 10"
        />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-sm font-medium text-warm-600 mb-1">{t('outlet.phone')}</label>
          <input
            type="tel"
            bind:value={newPhone}
            class="w-full px-3 py-2 rounded-lg border border-warm-200 focus:border-sage
                   focus:ring-1 focus:ring-sage outline-none"
            placeholder="021-7654321"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-warm-600 mb-1">{t('outlet.tax_rate')}</label>
          <input
            type="number"
            bind:value={newTaxRate}
            min="0" max="100" step="0.01"
            class="w-full px-3 py-2 rounded-lg border border-warm-200 focus:border-sage
                   focus:ring-1 focus:ring-sage outline-none"
          />
        </div>
      </div>
      <div class="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={creating}
          class="px-4 py-2 bg-sage text-white rounded-lg font-medium
                 hover:bg-sage-600 transition-colors disabled:opacity-50"
        >
          {creating ? t('app.loading') : t('outlet.add')}
        </button>
        <button
          type="button"
          onclick={() => { showForm = false; }}
          class="px-4 py-2 bg-warm-100 text-warm-600 rounded-lg font-medium
                 hover:bg-warm-200 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  {/if}

  {#if loading}
    <div class="text-center py-12 text-warm-400">{t('app.loading')}</div>
  {:else if outlets.length === 0}
    <div class="text-center py-12 text-warm-400">{t('outlet.no_outlets')}</div>
  {:else}
    <div class="space-y-3">
      {#each outlets as outlet (outlet.id)}
        <div class="bg-white rounded-xl border border-warm-200 p-4
                    hover:border-warm-300 transition-colors">
          <div class="flex items-start justify-between">
            <a href="{base}/owner/outlets/{outlet.id}" class="flex-1 min-w-0">
              <h3 class="font-semibold text-warm-800 text-lg">{outlet.name}</h3>
              {#if outlet.address}
                <p class="text-sm text-warm-500 mt-0.5">{outlet.address}</p>
              {/if}
              <div class="flex items-center gap-3 mt-2 text-xs text-warm-400">
                {#if outlet.phone}
                  <span>{outlet.phone}</span>
                {/if}
                <span>PPN {outlet.tax_rate}%</span>
              </div>
            </a>
            <div class="flex gap-1">
              <a
                href="{base}/owner/outlets/{outlet.id}/staff"
                class="p-2 rounded-lg hover:bg-warm-100 text-warm-400
                       hover:text-warm-600 transition-colors"
                title={t('outlet.staff')}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </a>
              <button
                class="p-2 rounded-lg hover:bg-red-50 text-warm-400
                       hover:text-red-500 transition-colors"
                title={t('outlet.delete')}
                onclick={() => handleDelete(outlet)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2">
                  <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
```

- [ ] **Step 2: Create outlet detail/edit page**

Create `src/routes/owner/outlets/[id]/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import { fetchOutlet, updateOutlet } from '$lib/modules/outlet/service';
  import type { Outlet } from '$lib/modules/outlet/types';

  let outlet = $state<Outlet | null>(null);
  let loading = $state(true);
  let saving = $state(false);
  let name = $state('');
  let address = $state('');
  let phone = $state('');
  let taxRate = $state(11);

  const outletId = $derived(page.params.id);

  onMount(async () => {
    try {
      outlet = await fetchOutlet(outletId);
      if (outlet) {
        name = outlet.name;
        address = outlet.address ?? '';
        phone = outlet.phone ?? '';
        taxRate = outlet.tax_rate;
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      loading = false;
    }
  });

  async function handleSave() {
    if (!name.trim()) return;
    saving = true;
    try {
      await updateOutlet(outletId, {
        name: name.trim(),
        address: address.trim() || null,
        phone: phone.trim() || null,
        tax_rate: taxRate,
      });
      showToast(t('outlet.updated'), 'success');
      goto(`${base}/owner/outlets`);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      saving = false;
    }
  }
</script>

<div class="p-4 max-w-2xl mx-auto">
  <a href="{base}/owner/outlets" class="text-sm text-warm-400 hover:text-warm-600 mb-4 inline-block">
    &larr; {t('outlet.title')}
  </a>

  {#if loading}
    <div class="text-center py-12 text-warm-400">{t('app.loading')}</div>
  {:else if !outlet}
    <div class="text-center py-12 text-warm-400">Outlet not found</div>
  {:else}
    <h1 class="text-2xl font-bold text-warm-800 mb-6">{t('outlet.edit')}</h1>

    <form
      class="bg-white rounded-xl border border-warm-200 p-6 space-y-4"
      onsubmit={(e) => { e.preventDefault(); handleSave(); }}
    >
      <div>
        <label class="block text-sm font-medium text-warm-600 mb-1">{t('outlet.name')}</label>
        <input
          type="text" bind:value={name} required
          class="w-full px-3 py-2 rounded-lg border border-warm-200
                 focus:border-sage focus:ring-1 focus:ring-sage outline-none"
        />
      </div>
      <div>
        <label class="block text-sm font-medium text-warm-600 mb-1">{t('outlet.address')}</label>
        <input
          type="text" bind:value={address}
          class="w-full px-3 py-2 rounded-lg border border-warm-200
                 focus:border-sage focus:ring-1 focus:ring-sage outline-none"
        />
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-warm-600 mb-1">{t('outlet.phone')}</label>
          <input
            type="tel" bind:value={phone}
            class="w-full px-3 py-2 rounded-lg border border-warm-200
                   focus:border-sage focus:ring-1 focus:ring-sage outline-none"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-warm-600 mb-1">{t('outlet.tax_rate')}</label>
          <input
            type="number" bind:value={taxRate} min="0" max="100" step="0.01"
            class="w-full px-3 py-2 rounded-lg border border-warm-200
                   focus:border-sage focus:ring-1 focus:ring-sage outline-none"
          />
        </div>
      </div>
      <div class="flex gap-2 pt-4">
        <button
          type="submit"
          disabled={saving}
          class="px-6 py-2 bg-sage text-white rounded-lg font-medium
                 hover:bg-sage-600 transition-colors disabled:opacity-50"
        >
          {saving ? t('app.loading') : t('outlet.updated')}
        </button>
        <a
          href="{base}/owner/outlets"
          class="px-6 py-2 bg-warm-100 text-warm-600 rounded-lg font-medium
                 hover:bg-warm-200 transition-colors"
        >
          Cancel
        </a>
      </div>
    </form>
  {/if}
</div>
```

- [ ] **Step 3: Create per-outlet staff management page**

Create `src/routes/owner/outlets/[id]/staff/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import { showConfirm } from '$lib/stores/dialog.svelte';
  import {
    fetchOutlet,
    fetchStaffByOutlet,
    fetchOutlets,
    reassignStaff,
  } from '$lib/modules/outlet/service';
  import type { Outlet } from '$lib/modules/outlet/types';

  let outlet = $state<Outlet | null>(null);
  let staffList = $state<any[]>([]);
  let allOutlets = $state<Outlet[]>([]);
  let loading = $state(true);
  let reassigning = $state<string | null>(null);  // staff id being reassigned

  const outletId = $derived(page.params.id);

  onMount(async () => {
    try {
      const [o, staff, outlets] = await Promise.all([
        fetchOutlet(outletId),
        fetchStaffByOutlet(outletId),
        fetchOutlets(),
      ]);
      outlet = o;
      staffList = staff;
      allOutlets = outlets;
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      loading = false;
    }
  });

  async function handleReassign(staffId: string, staffName: string, newOutletId: string) {
    const destOutlet = allOutlets.find(o => o.id === newOutletId);
    const confirmed = await showConfirm(
      `Move ${staffName} to ${destOutlet?.name ?? 'another outlet'}?`
    );
    if (!confirmed) return;

    reassigning = staffId;
    try {
      await reassignStaff(staffId, newOutletId);
      showToast(t('outlet.staff.reassigned'), 'success');
      // Reload staff list
      staffList = await fetchStaffByOutlet(outletId);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      reassigning = null;
    }
  }

  let otherOutlets = $derived(allOutlets.filter(o => o.id !== outletId));
</script>

<div class="p-4 max-w-2xl mx-auto">
  <a href="{base}/owner/outlets/{outletId}" class="text-sm text-warm-400 hover:text-warm-600 mb-4 inline-block">
    &larr; {outlet?.name ?? t('outlet.title')}
  </a>

  <h1 class="text-2xl font-bold text-warm-800 mb-2">{t('outlet.staff.title')}</h1>
  {#if outlet}
    <p class="text-warm-500 mb-6">{outlet.name}</p>
  {/if}

  {#if loading}
    <div class="text-center py-12 text-warm-400">{t('app.loading')}</div>
  {:else if staffList.length === 0}
    <div class="text-center py-12">
      <p class="text-warm-400">{t('outlet.staff.no_staff')}</p>
    </div>
  {:else}
    <div class="space-y-3">
      {#each staffList as staff (staff.id)}
        <div class="bg-white rounded-xl border border-warm-200 p-4
                    flex items-center justify-between">
          <div>
            <div class="font-medium text-warm-800">{staff.name}</div>
            <div class="text-sm text-warm-400">{staff.email}</div>
            <span class="inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-xs font-medium
                         {staff.role === 'owner' ? 'bg-gold/20 text-gold-700' : 'bg-warm-100 text-warm-500'}">
              {staff.role}
            </span>
          </div>

          {#if staff.role !== 'owner' && otherOutlets.length > 0}
            <div class="flex items-center gap-2">
              <label class="text-xs text-warm-400" for="reassign-{staff.id}">
                {t('outlet.staff.reassign_to')}:
              </label>
              <select
                id="reassign-{staff.id}"
                class="text-sm px-2 py-1.5 rounded-lg border border-warm-200
                       focus:border-sage outline-none"
                disabled={reassigning === staff.id}
                onchange={(e) => {
                  const target = e.target as HTMLSelectElement;
                  if (target.value) {
                    handleReassign(staff.id, staff.name, target.value);
                    target.value = '';
                  }
                }}
              >
                <option value="">{t('outlet.staff.reassign')}</option>
                {#each otherOutlets as dest (dest.id)}
                  <option value={dest.id}>{dest.name}</option>
                {/each}
              </select>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
```

- [ ] **Step 4: Update owner layout navigation**

In `src/routes/owner/+layout.svelte`, add outlets to the navigation tabs available to the owner:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { requireRole } from '$lib/modules/auth/guard';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';

  let { children } = $props();
  let authorized = $state(false);

  onMount(() => {
    authorized = requireRole('owner');
  });

  const ownerTabs = [
    { href: `${base}/owner/outlets`, label: 'nav.outlets' },
    { href: `${base}/owner/transfers`, label: 'nav.transfers' },
    { href: `${base}/owner/reports/consolidated`, label: 'consolidated.title' },
  ];
</script>

{#if authorized}
  <nav class="flex gap-1 px-4 py-2 border-b border-warm-200 bg-warm-50 overflow-x-auto">
    {#each ownerTabs as tab (tab.href)}
      <a
        href={tab.href}
        class="px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap
               hover:bg-warm-200 transition-colors text-warm-600"
      >
        {t(tab.label)}
      </a>
    {/each}
  </nav>
  {@render children()}
{/if}
```

- [ ] **Step 5: Test manually — navigate to /owner/outlets**

```bash
npm run dev
```

Navigate to `http://localhost:5173/owner/outlets`. Verify:
- Outlet list renders
- Create form opens and works
- Staff management link navigates correctly

- [ ] **Step 6: Commit**

```bash
git add src/routes/owner/outlets/ src/routes/owner/+layout.svelte
git commit -m "feat: add outlet management pages — list, edit, per-outlet staff"
```

---

## Task 8: Transfer Management Pages

**Files:**
- Create: `src/routes/owner/transfers/+page.svelte`
- Create: `src/routes/owner/transfers/[id]/+page.svelte`

- [ ] **Step 1: Create transfer list page**

Create `src/routes/owner/transfers/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import TransferStatusBadge from '$lib/components/TransferStatusBadge.svelte';
  import { fetchTransfers, createTransfer } from '$lib/modules/outlet/transfer';
  import { fetchOutlets } from '$lib/modules/outlet/service';
  import { getInventoryList } from '$lib/modules/inventory/service';
  import { getCurrentStaff } from '$lib/modules/auth/stores.svelte';
  import { getActiveOutletId } from '$lib/modules/outlet/stores.svelte';
  import type { OutletTransfer, Outlet } from '$lib/modules/outlet/types';
  import type { TransferStatus } from '$lib/modules/outlet/types';

  let transfers = $state<OutletTransfer[]>([]);
  let outlets = $state<Outlet[]>([]);
  let loading = $state(true);
  let statusFilter = $state<TransferStatus | ''>('');

  // New transfer form state
  let showForm = $state(false);
  let fromOutletId = $state('');
  let toOutletId = $state('');
  let transferNotes = $state('');
  let transferItems = $state<{ inventory_id: string; book_id: string; title: string; quantity_requested: number }[]>([]);
  let inventoryList = $state<any[]>([]);
  let creating = $state(false);

  onMount(async () => {
    try {
      const [t, o] = await Promise.all([fetchTransfers(), fetchOutlets()]);
      transfers = t;
      outlets = o;
      fromOutletId = getActiveOutletId() ?? '';
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      loading = false;
    }
  });

  let filteredTransfers = $derived(
    statusFilter
      ? transfers.filter(tx => tx.status === statusFilter)
      : transfers
  );

  async function loadInventoryForOutlet(outletId: string) {
    try {
      inventoryList = await getInventoryList(outletId);
    } catch {
      inventoryList = [];
    }
  }

  function addItem(inv: any) {
    if (transferItems.find(i => i.inventory_id === inv.id)) return;
    transferItems = [...transferItems, {
      inventory_id: inv.id,
      book_id: inv.book_id,
      title: inv.book?.title ?? inv.book_id,
      quantity_requested: 1,
    }];
  }

  function removeItem(inventoryId: string) {
    transferItems = transferItems.filter(i => i.inventory_id !== inventoryId);
  }

  function updateItemQuantity(inventoryId: string, qty: number) {
    transferItems = transferItems.map(i =>
      i.inventory_id === inventoryId ? { ...i, quantity_requested: Math.max(1, qty) } : i
    );
  }

  async function handleCreateTransfer() {
    if (!fromOutletId || !toOutletId || transferItems.length === 0) return;
    const staff = getCurrentStaff();
    if (!staff) return;

    creating = true;
    try {
      await createTransfer({
        from_outlet_id: fromOutletId,
        to_outlet_id: toOutletId,
        items: transferItems,
        notes: transferNotes.trim() || undefined,
      }, staff.id);
      showToast(t('transfer.created'), 'success');
      showForm = false;
      transferItems = [];
      transferNotes = '';
      transfers = await fetchTransfers();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      creating = false;
    }
  }

  $effect(() => {
    if (fromOutletId) loadInventoryForOutlet(fromOutletId);
  });

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  }
</script>

<div class="p-4 max-w-3xl mx-auto">
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold text-warm-800">{t('transfer.title')}</h1>
    <button
      class="px-4 py-2 bg-sage text-white rounded-lg font-medium
             hover:bg-sage-600 transition-colors"
      onclick={() => { showForm = !showForm; }}
    >
      {t('transfer.create')}
    </button>
  </div>

  {#if showForm}
    <form
      class="bg-white rounded-xl border border-warm-200 p-4 mb-6 space-y-4"
      onsubmit={(e) => { e.preventDefault(); handleCreateTransfer(); }}
    >
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-warm-600 mb-1">{t('transfer.from')}</label>
          <select
            bind:value={fromOutletId}
            class="w-full px-3 py-2 rounded-lg border border-warm-200
                   focus:border-sage outline-none"
          >
            {#each outlets as o (o.id)}
              <option value={o.id}>{o.name}</option>
            {/each}
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-warm-600 mb-1">{t('transfer.to')}</label>
          <select
            bind:value={toOutletId}
            class="w-full px-3 py-2 rounded-lg border border-warm-200
                   focus:border-sage outline-none"
          >
            <option value="">-- Select --</option>
            {#each outlets.filter(o => o.id !== fromOutletId) as o (o.id)}
              <option value={o.id}>{o.name}</option>
            {/each}
          </select>
        </div>
      </div>

      <!-- Inventory picker -->
      <div>
        <label class="block text-sm font-medium text-warm-600 mb-1">{t('transfer.items')}</label>
        {#if inventoryList.length > 0}
          <div class="max-h-40 overflow-y-auto border border-warm-100 rounded-lg p-2 space-y-1">
            {#each inventoryList as inv (inv.id)}
              <button
                type="button"
                class="w-full text-left px-2 py-1 text-sm rounded hover:bg-warm-50
                       transition-colors flex justify-between items-center"
                onclick={() => addItem(inv)}
              >
                <span class="truncate">{inv.book?.title ?? inv.book_id}</span>
                <span class="text-xs text-warm-400 ml-2">stok: {inv.stock}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Selected items -->
      {#if transferItems.length > 0}
        <div class="space-y-2">
          {#each transferItems as item (item.inventory_id)}
            <div class="flex items-center gap-2 bg-warm-50 rounded-lg px-3 py-2">
              <span class="flex-1 text-sm truncate">{item.title}</span>
              <input
                type="number"
                value={item.quantity_requested}
                min="1"
                class="w-20 px-2 py-1 text-sm rounded border border-warm-200 text-center"
                onchange={(e) => updateItemQuantity(item.inventory_id, parseInt((e.target as HTMLInputElement).value) || 1)}
              />
              <button
                type="button"
                class="text-warm-400 hover:text-red-500 transition-colors"
                onclick={() => removeItem(item.inventory_id)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2">
                  <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                </svg>
              </button>
            </div>
          {/each}
        </div>
      {/if}

      <div>
        <label class="block text-sm font-medium text-warm-600 mb-1">{t('transfer.notes')}</label>
        <textarea
          bind:value={transferNotes}
          rows="2"
          class="w-full px-3 py-2 rounded-lg border border-warm-200
                 focus:border-sage outline-none resize-none"
        ></textarea>
      </div>

      <div class="flex gap-2">
        <button
          type="submit"
          disabled={creating || !toOutletId || transferItems.length === 0}
          class="px-4 py-2 bg-sage text-white rounded-lg font-medium
                 hover:bg-sage-600 transition-colors disabled:opacity-50"
        >
          {creating ? t('app.loading') : t('transfer.create')}
        </button>
        <button
          type="button"
          onclick={() => { showForm = false; }}
          class="px-4 py-2 bg-warm-100 text-warm-600 rounded-lg font-medium
                 hover:bg-warm-200 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  {/if}

  <!-- Status filter -->
  <div class="flex gap-2 mb-4 overflow-x-auto">
    <button
      class="px-3 py-1 rounded-full text-sm font-medium transition-colors
             {statusFilter === '' ? 'bg-warm-800 text-white' : 'bg-warm-100 text-warm-600'}"
      onclick={() => { statusFilter = ''; }}
    >
      All
    </button>
    {#each ['requested', 'approved', 'shipped', 'received', 'cancelled'] as s}
      <button
        class="px-3 py-1 rounded-full text-sm font-medium transition-colors
               {statusFilter === s ? 'bg-warm-800 text-white' : 'bg-warm-100 text-warm-600'}"
        onclick={() => { statusFilter = s as TransferStatus; }}
      >
        {t(`transfer.status.${s}`)}
      </button>
    {/each}
  </div>

  <!-- Transfer list -->
  {#if loading}
    <div class="text-center py-12 text-warm-400">{t('app.loading')}</div>
  {:else if filteredTransfers.length === 0}
    <div class="text-center py-12 text-warm-400">{t('transfer.empty')}</div>
  {:else}
    <div class="space-y-3">
      {#each filteredTransfers as tx (tx.id)}
        <a
          href="{base}/owner/transfers/{tx.id}"
          class="block bg-white rounded-xl border border-warm-200 p-4
                 hover:border-warm-300 transition-colors"
        >
          <div class="flex items-center justify-between mb-2">
            <TransferStatusBadge status={tx.status} />
            <span class="text-xs text-warm-400">{formatDate(tx.requested_at)}</span>
          </div>
          <div class="flex items-center gap-2 text-sm">
            <span class="font-medium text-warm-700">{tx.from_outlet?.name ?? '—'}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2" class="text-warm-400">
              <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
            </svg>
            <span class="font-medium text-warm-700">{tx.to_outlet?.name ?? '—'}</span>
          </div>
          {#if tx.items}
            <div class="text-xs text-warm-400 mt-1">
              {tx.items.length} item{tx.items.length !== 1 ? 's' : ''},
              {tx.items.reduce((sum, i) => sum + i.quantity_requested, 0)} total qty
            </div>
          {/if}
        </a>
      {/each}
    </div>
  {/if}
</div>
```

- [ ] **Step 2: Create transfer detail page with status actions**

Create `src/routes/owner/transfers/[id]/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import { showConfirm } from '$lib/stores/dialog.svelte';
  import TransferStatusBadge from '$lib/components/TransferStatusBadge.svelte';
  import {
    fetchTransfer,
    approveTransfer,
    shipTransfer,
    receiveTransfer,
    cancelTransfer,
    getNextStatuses,
  } from '$lib/modules/outlet/transfer';
  import { getCurrentStaff } from '$lib/modules/auth/stores.svelte';
  import type { OutletTransfer, TransferStatus } from '$lib/modules/outlet/types';

  let transfer = $state<OutletTransfer | null>(null);
  let loading = $state(true);
  let acting = $state(false);
  let cancelReason = $state('');
  let showCancelForm = $state(false);

  // Editable shipped/received quantities
  let shippedQtys = $state<Record<string, number>>({});
  let receivedQtys = $state<Record<string, number>>({});

  const transferId = $derived(page.params.id);

  onMount(async () => {
    await loadTransfer();
  });

  async function loadTransfer() {
    loading = true;
    try {
      transfer = await fetchTransfer(transferId);
      if (transfer?.items) {
        // Init quantity editors
        for (const item of transfer.items) {
          shippedQtys[item.id] = item.quantity_shipped || item.quantity_requested;
          receivedQtys[item.id] = item.quantity_received || item.quantity_shipped || item.quantity_requested;
        }
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      loading = false;
    }
  }

  let nextStatuses = $derived(
    transfer ? getNextStatuses(transfer.status) : []
  );

  async function handleApprove() {
    const staff = getCurrentStaff();
    if (!staff) return;
    acting = true;
    try {
      await approveTransfer(transferId, staff.id);
      showToast(t('transfer.approved'), 'success');
      await loadTransfer();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      acting = false;
    }
  }

  async function handleShip() {
    const staff = getCurrentStaff();
    if (!staff || !transfer?.items) return;
    acting = true;
    try {
      const quantities = transfer.items.map(item => ({
        itemId: item.id,
        quantity: shippedQtys[item.id] ?? item.quantity_requested,
      }));
      await shipTransfer(transferId, staff.id, quantities);
      showToast(t('transfer.shipped'), 'success');
      await loadTransfer();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      acting = false;
    }
  }

  async function handleReceive() {
    const staff = getCurrentStaff();
    if (!staff || !transfer?.items) return;
    acting = true;
    try {
      const quantities = transfer.items.map(item => ({
        itemId: item.id,
        inventoryId: item.inventory_id,
        quantity: receivedQtys[item.id] ?? item.quantity_shipped,
      }));
      await receiveTransfer(transferId, staff.id, quantities);
      showToast(t('transfer.received'), 'success');
      await loadTransfer();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      acting = false;
    }
  }

  async function handleCancel() {
    if (!cancelReason.trim()) return;
    const staff = getCurrentStaff();
    if (!staff) return;
    acting = true;
    try {
      await cancelTransfer(transferId, staff.id, cancelReason.trim());
      showToast(t('transfer.cancelled'), 'success');
      showCancelForm = false;
      cancelReason = '';
      await loadTransfer();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      acting = false;
    }
  }

  function formatDateTime(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }
</script>

<div class="p-4 max-w-3xl mx-auto">
  <a href="{base}/owner/transfers" class="text-sm text-warm-400 hover:text-warm-600 mb-4 inline-block">
    &larr; {t('transfer.title')}
  </a>

  {#if loading}
    <div class="text-center py-12 text-warm-400">{t('app.loading')}</div>
  {:else if !transfer}
    <div class="text-center py-12 text-warm-400">Transfer not found</div>
  {:else}
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <div class="flex items-center gap-3 mb-1">
          <h1 class="text-2xl font-bold text-warm-800">Transfer</h1>
          <TransferStatusBadge status={transfer.status} />
        </div>
        <div class="text-sm text-warm-500">
          {transfer.from_outlet?.name ?? '—'}
          &rarr;
          {transfer.to_outlet?.name ?? '—'}
        </div>
      </div>
    </div>

    <!-- Timeline -->
    <div class="bg-white rounded-xl border border-warm-200 p-4 mb-4">
      <div class="space-y-3 text-sm">
        <div class="flex justify-between">
          <span class="text-warm-500">{t('transfer.requested_at')}</span>
          <span class="text-warm-700">{formatDateTime(transfer.requested_at)}</span>
        </div>
        {#if transfer.approved_at}
          <div class="flex justify-between">
            <span class="text-warm-500">{t('transfer.approved_at')}</span>
            <span class="text-warm-700">{formatDateTime(transfer.approved_at)}</span>
          </div>
        {/if}
        {#if transfer.shipped_at}
          <div class="flex justify-between">
            <span class="text-warm-500">{t('transfer.shipped_at')}</span>
            <span class="text-warm-700">{formatDateTime(transfer.shipped_at)}</span>
          </div>
        {/if}
        {#if transfer.received_at}
          <div class="flex justify-between">
            <span class="text-warm-500">{t('transfer.received_at')}</span>
            <span class="text-warm-700">{formatDateTime(transfer.received_at)}</span>
          </div>
        {/if}
        {#if transfer.cancel_reason}
          <div class="flex justify-between text-red-600">
            <span>Cancellation reason</span>
            <span>{transfer.cancel_reason}</span>
          </div>
        {/if}
        {#if transfer.notes}
          <div class="flex justify-between">
            <span class="text-warm-500">{t('transfer.notes')}</span>
            <span class="text-warm-700">{transfer.notes}</span>
          </div>
        {/if}
      </div>
    </div>

    <!-- Items -->
    <div class="bg-white rounded-xl border border-warm-200 p-4 mb-4">
      <h2 class="font-semibold text-warm-800 mb-3">{t('transfer.items')}</h2>
      <div class="space-y-2">
        {#each transfer.items ?? [] as item (item.id)}
          <div class="flex items-center gap-3 py-2 border-b border-warm-100 last:border-0">
            <div class="flex-1 min-w-0">
              <div class="font-medium text-warm-700 truncate">{item.title}</div>
              <div class="text-xs text-warm-400">{item.book_id}</div>
            </div>
            <div class="grid grid-cols-3 gap-3 text-center text-sm">
              <div>
                <div class="text-xs text-warm-400">{t('transfer.qty_requested')}</div>
                <div class="font-medium">{item.quantity_requested}</div>
              </div>
              <div>
                <div class="text-xs text-warm-400">{t('transfer.qty_shipped')}</div>
                {#if transfer.status === 'approved'}
                  <input
                    type="number"
                    bind:value={shippedQtys[item.id]}
                    min="0" max={item.quantity_requested}
                    class="w-16 px-1 py-0.5 text-center text-sm rounded border
                           border-warm-200 focus:border-sage outline-none"
                  />
                {:else}
                  <div class="font-medium">{item.quantity_shipped}</div>
                {/if}
              </div>
              <div>
                <div class="text-xs text-warm-400">{t('transfer.qty_received')}</div>
                {#if transfer.status === 'shipped'}
                  <input
                    type="number"
                    bind:value={receivedQtys[item.id]}
                    min="0" max={item.quantity_shipped}
                    class="w-16 px-1 py-0.5 text-center text-sm rounded border
                           border-warm-200 focus:border-sage outline-none"
                  />
                {:else}
                  <div class="font-medium">{item.quantity_received}</div>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>

    <!-- Actions -->
    {#if nextStatuses.length > 0}
      <div class="flex flex-wrap gap-2">
        {#if nextStatuses.includes('approved')}
          <button
            disabled={acting}
            class="px-4 py-2 bg-sky-500 text-white rounded-lg font-medium
                   hover:bg-sky-600 transition-colors disabled:opacity-50"
            onclick={handleApprove}
          >
            {t('transfer.approve')}
          </button>
        {/if}
        {#if nextStatuses.includes('shipped')}
          <button
            disabled={acting}
            class="px-4 py-2 bg-violet-500 text-white rounded-lg font-medium
                   hover:bg-violet-600 transition-colors disabled:opacity-50"
            onclick={handleShip}
          >
            {t('transfer.ship')}
          </button>
        {/if}
        {#if nextStatuses.includes('received')}
          <button
            disabled={acting}
            class="px-4 py-2 bg-sage text-white rounded-lg font-medium
                   hover:bg-sage-600 transition-colors disabled:opacity-50"
            onclick={handleReceive}
          >
            {t('transfer.receive')}
          </button>
        {/if}
        {#if nextStatuses.includes('cancelled')}
          {#if showCancelForm}
            <div class="flex gap-2 items-center">
              <input
                type="text"
                bind:value={cancelReason}
                placeholder={t('transfer.cancel_reason')}
                class="px-3 py-2 rounded-lg border border-warm-200
                       focus:border-red-300 outline-none text-sm"
              />
              <button
                disabled={acting || !cancelReason.trim()}
                class="px-4 py-2 bg-red-500 text-white rounded-lg font-medium
                       hover:bg-red-600 transition-colors disabled:opacity-50"
                onclick={handleCancel}
              >
                {t('transfer.cancel')}
              </button>
            </div>
          {:else}
            <button
              class="px-4 py-2 bg-warm-100 text-warm-600 rounded-lg font-medium
                     hover:bg-warm-200 transition-colors"
              onclick={() => { showCancelForm = true; }}
            >
              {t('transfer.cancel')}
            </button>
          {/if}
        {/if}
      </div>
    {/if}
  {/if}
</div>
```

- [ ] **Step 3: Test manually**

Navigate to `/owner/transfers`. Verify:
- Transfer list renders with status badges
- Create form allows selecting outlets, picking inventory items, setting quantities
- Transfer detail page shows timeline and action buttons based on current status

- [ ] **Step 4: Commit**

```bash
git add src/routes/owner/transfers/
git commit -m "feat: add transfer management pages — create, list, detail with status workflow"
```

---

## Task 9: Consolidated Reporting Dashboard Page

**Files:**
- Create: `src/lib/components/ConsolidatedChart.svelte`
- Create: `src/routes/owner/reports/consolidated/+page.svelte`

- [ ] **Step 1: Create ConsolidatedChart component**

Create `src/lib/components/ConsolidatedChart.svelte`:

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { DailyTrendRow } from '$lib/modules/outlet/types';
  import { groupTrendByOutlet, formatRupiah } from '$lib/modules/reporting/consolidated';

  let {
    trendData,
    chartType = 'line',
  }: {
    trendData: DailyTrendRow[];
    chartType?: 'line' | 'bar';
  } = $props();

  let canvas: HTMLCanvasElement;
  let chart: any = null;

  // Color palette for outlets
  const COLORS = [
    'rgb(107, 142, 35)',   // sage
    'rgb(70, 130, 180)',   // steel blue
    'rgb(218, 165, 32)',   // golden rod
    'rgb(178, 102, 178)',  // plum
    'rgb(205, 92, 92)',    // indian red
    'rgb(60, 179, 113)',   // medium sea green
  ];

  onMount(async () => {
    // Dynamic import to avoid SSR issues
    const { Chart, registerables } = await import('chart.js');
    Chart.register(...registerables);

    renderChart(Chart);
  });

  onDestroy(() => {
    chart?.destroy();
  });

  function renderChart(Chart: any) {
    if (!canvas || !trendData.length) return;

    chart?.destroy();

    const grouped = groupTrendByOutlet(trendData);
    const datasets: any[] = [];
    let colorIndex = 0;

    for (const [, entry] of grouped) {
      datasets.push({
        label: entry.name,
        data: entry.totals,
        borderColor: COLORS[colorIndex % COLORS.length],
        backgroundColor: COLORS[colorIndex % COLORS.length] + '33',
        fill: chartType === 'line',
        tension: 0.3,
      });
      colorIndex++;
    }

    // Get dates from first outlet (they should all be the same)
    const firstEntry = grouped.values().next().value;
    const labels = firstEntry?.dates.map((d: string) =>
      new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
    ) ?? [];

    chart = new Chart(canvas, {
      type: chartType,
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx: any) => `${ctx.dataset.label}: ${formatRupiah(ctx.raw)}`,
            },
          },
          legend: {
            position: 'bottom',
            labels: { usePointStyle: true, padding: 16 },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value: any) => formatRupiah(value),
            },
          },
        },
      },
    });
  }

  // Re-render when data changes
  $effect(() => {
    if (trendData && canvas && chart) {
      import('chart.js').then(({ Chart }) => renderChart(Chart));
    }
  });
</script>

<div class="w-full h-64">
  <canvas bind:this={canvas}></canvas>
</div>
```

- [ ] **Step 2: Create consolidated dashboard page**

Create `src/routes/owner/reports/consolidated/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/index.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import ConsolidatedChart from '$lib/components/ConsolidatedChart.svelte';
  import { fetchConsolidatedDashboard, formatRupiah } from '$lib/modules/reporting/consolidated';
  import { getOutlets } from '$lib/modules/outlet/stores.svelte';
  import type { ConsolidatedDashboard } from '$lib/modules/reporting/types';
  import type { Outlet } from '$lib/modules/outlet/types';

  let dashboard = $state<ConsolidatedDashboard | null>(null);
  let loading = $state(true);
  let outlets = $derived(getOutlets());

  // Date range defaults to last 30 days
  let dateTo = $state(new Date().toISOString().split('T')[0]);
  let dateFrom = $state(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  let selectedOutletIds = $state<string[]>([]);  // empty = all

  onMount(async () => {
    await loadDashboard();
  });

  async function loadDashboard() {
    loading = true;
    try {
      dashboard = await fetchConsolidatedDashboard({
        dateRange: { from: dateFrom, to: dateTo },
        outletIds: selectedOutletIds.length > 0 ? selectedOutletIds : undefined,
      });
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      loading = false;
    }
  }

  function toggleOutletFilter(outletId: string) {
    if (selectedOutletIds.includes(outletId)) {
      selectedOutletIds = selectedOutletIds.filter(id => id !== outletId);
    } else {
      selectedOutletIds = [...selectedOutletIds, outletId];
    }
  }
</script>

<div class="p-4 max-w-4xl mx-auto">
  <h1 class="text-2xl font-bold text-warm-800 mb-6">{t('consolidated.title')}</h1>

  <!-- Filters -->
  <div class="bg-white rounded-xl border border-warm-200 p-4 mb-6">
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div>
        <label class="block text-sm font-medium text-warm-600 mb-1">{t('consolidated.date_range')}</label>
        <div class="flex gap-2">
          <input type="date" bind:value={dateFrom}
                 class="flex-1 px-2 py-1.5 rounded-lg border border-warm-200 text-sm
                        focus:border-sage outline-none" />
          <input type="date" bind:value={dateTo}
                 class="flex-1 px-2 py-1.5 rounded-lg border border-warm-200 text-sm
                        focus:border-sage outline-none" />
        </div>
      </div>
      <div>
        <label class="block text-sm font-medium text-warm-600 mb-1">{t('consolidated.filter_outlets')}</label>
        <div class="flex flex-wrap gap-1">
          {#each outlets as outlet (outlet.id)}
            <button
              class="px-2 py-1 rounded-full text-xs font-medium transition-colors
                     {selectedOutletIds.includes(outlet.id)
                       ? 'bg-sage text-white'
                       : 'bg-warm-100 text-warm-600 hover:bg-warm-200'}"
              onclick={() => toggleOutletFilter(outlet.id)}
            >
              {outlet.name}
            </button>
          {/each}
        </div>
      </div>
      <div class="flex items-end">
        <button
          class="px-4 py-2 bg-sage text-white rounded-lg font-medium
                 hover:bg-sage-600 transition-colors w-full"
          onclick={loadDashboard}
        >
          {loading ? t('app.loading') : t('app.reload')}
        </button>
      </div>
    </div>
  </div>

  {#if loading}
    <div class="text-center py-12 text-warm-400">{t('app.loading')}</div>
  {:else if dashboard}
    <!-- Grand Totals -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <div class="bg-white rounded-xl border border-warm-200 p-4">
        <div class="text-sm text-warm-500">{t('consolidated.total_sales')}</div>
        <div class="text-xl font-bold text-warm-800">{formatRupiah(dashboard.totals.totalSales)}</div>
      </div>
      <div class="bg-white rounded-xl border border-warm-200 p-4">
        <div class="text-sm text-warm-500">{t('consolidated.total_transactions')}</div>
        <div class="text-xl font-bold text-warm-800">{dashboard.totals.totalTransactions}</div>
      </div>
      <div class="bg-white rounded-xl border border-warm-200 p-4">
        <div class="text-sm text-warm-500">{t('consolidated.avg_transaction')}</div>
        <div class="text-xl font-bold text-warm-800">{formatRupiah(dashboard.totals.avgTransactionValue)}</div>
      </div>
      <div class="bg-white rounded-xl border border-warm-200 p-4">
        <div class="text-sm text-warm-500">{t('consolidated.stock_value')}</div>
        <div class="text-xl font-bold text-warm-800">{formatRupiah(dashboard.totals.totalStockValue)}</div>
      </div>
    </div>

    <!-- Daily Trend Chart -->
    {#if dashboard.dailyTrend.length > 0}
      <div class="bg-white rounded-xl border border-warm-200 p-4 mb-6">
        <h2 class="font-semibold text-warm-800 mb-3">{t('consolidated.daily_trend')}</h2>
        <ConsolidatedChart trendData={dashboard.dailyTrend} />
      </div>
    {/if}

    <!-- Sales by Outlet -->
    <div class="bg-white rounded-xl border border-warm-200 p-4 mb-6">
      <h2 class="font-semibold text-warm-800 mb-3">{t('consolidated.sales_comparison')}</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-warm-200">
              <th class="text-left py-2 px-2 text-warm-500 font-medium">Outlet</th>
              <th class="text-right py-2 px-2 text-warm-500 font-medium">{t('consolidated.total_sales')}</th>
              <th class="text-right py-2 px-2 text-warm-500 font-medium">{t('consolidated.total_transactions')}</th>
              <th class="text-right py-2 px-2 text-warm-500 font-medium">{t('consolidated.total_items')}</th>
              <th class="text-right py-2 px-2 text-warm-500 font-medium">{t('consolidated.net_revenue')}</th>
            </tr>
          </thead>
          <tbody>
            {#each dashboard.sales as row (row.outlet_id)}
              <tr class="border-b border-warm-100">
                <td class="py-2 px-2 font-medium text-warm-700">{row.outlet_name}</td>
                <td class="py-2 px-2 text-right">{formatRupiah(row.total_sales)}</td>
                <td class="py-2 px-2 text-right">{row.total_transactions}</td>
                <td class="py-2 px-2 text-right">{row.total_items_sold}</td>
                <td class="py-2 px-2 text-right">{formatRupiah(row.net_revenue)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Inventory by Outlet -->
    <div class="bg-white rounded-xl border border-warm-200 p-4 mb-6">
      <h2 class="font-semibold text-warm-800 mb-3">{t('consolidated.inventory_overview')}</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-warm-200">
              <th class="text-left py-2 px-2 text-warm-500 font-medium">Outlet</th>
              <th class="text-right py-2 px-2 text-warm-500 font-medium">{t('consolidated.total_skus')}</th>
              <th class="text-right py-2 px-2 text-warm-500 font-medium">{t('consolidated.total_stock')}</th>
              <th class="text-right py-2 px-2 text-warm-500 font-medium">{t('consolidated.stock_value')}</th>
              <th class="text-right py-2 px-2 text-warm-500 font-medium">{t('consolidated.low_stock')}</th>
              <th class="text-right py-2 px-2 text-warm-500 font-medium">{t('consolidated.out_of_stock')}</th>
            </tr>
          </thead>
          <tbody>
            {#each dashboard.inventory as row (row.outlet_id)}
              <tr class="border-b border-warm-100">
                <td class="py-2 px-2 font-medium text-warm-700">{row.outlet_name}</td>
                <td class="py-2 px-2 text-right">{row.total_skus}</td>
                <td class="py-2 px-2 text-right">{row.total_stock}</td>
                <td class="py-2 px-2 text-right">{formatRupiah(row.total_stock_value)}</td>
                <td class="py-2 px-2 text-right">
                  {#if row.low_stock_count > 0}
                    <span class="text-gold-600">{row.low_stock_count}</span>
                  {:else}
                    0
                  {/if}
                </td>
                <td class="py-2 px-2 text-right">
                  {#if row.out_of_stock_count > 0}
                    <span class="text-red-500">{row.out_of_stock_count}</span>
                  {:else}
                    0
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Top Books across Outlets -->
    {#if dashboard.topBooks.length > 0}
      <div class="bg-white rounded-xl border border-warm-200 p-4 mb-6">
        <h2 class="font-semibold text-warm-800 mb-3">{t('consolidated.top_books')}</h2>
        <div class="space-y-2">
          {#each dashboard.topBooks as book, i (book.book_id)}
            <div class="flex items-center gap-3 py-2 border-b border-warm-100 last:border-0">
              <span class="text-sm text-warm-400 w-6 text-right">#{i + 1}</span>
              <div class="flex-1 min-w-0">
                <div class="font-medium text-warm-700 truncate">{book.title}</div>
                <div class="text-xs text-warm-400">
                  {book.total_quantity} sold across {book.outlet_count} outlet{book.outlet_count !== 1 ? 's' : ''}
                </div>
              </div>
              <span class="text-sm font-medium text-warm-600">{formatRupiah(book.total_revenue)}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>
```

- [ ] **Step 3: Test manually**

Navigate to `/owner/reports/consolidated`. Verify:
- Date range filter works
- Outlet filter pills toggle
- Grand totals card shows correct aggregation
- Daily trend chart renders with per-outlet lines
- Sales and inventory tables populate
- Top books list shows cross-outlet data

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/ConsolidatedChart.svelte src/routes/owner/reports/consolidated/
git commit -m "feat: add consolidated reporting dashboard — cross-outlet sales, inventory, trends"
```

---

## Task 10: Update Existing Modules for Active Outlet Context

**Files:**
- Modify: `src/lib/modules/inventory/service.ts`
- Modify: `src/lib/modules/pos/checkout.ts`
- Modify: `src/lib/modules/dashboard/service.ts`
- Modify: `src/lib/components/BottomNav.svelte`

- [ ] **Step 1: Update inventory service to use active outlet**

In `src/lib/modules/inventory/service.ts`, update `getInventoryList` to accept and default to the active outlet:

```typescript
import { getActiveOutletId } from '../outlet/stores.svelte';

// Update getInventoryList to default to active outlet
export async function getInventoryList(outletId?: string): Promise<Inventory[]> {
  const supabase = getSupabase();
  const targetOutlet = outletId ?? getActiveOutletId();

  let query = supabase.from('inventory').select('*');

  if (targetOutlet) {
    query = query.eq('outlet_id', targetOutlet);
  }

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to fetch inventory: ${error.message}`);
  return data ?? [];
}
```

- [ ] **Step 2: Update POS checkout to use active outlet**

In `src/lib/modules/pos/checkout.ts`, ensure checkout uses the active outlet:

```typescript
import { getActiveOutletId } from '../outlet/stores.svelte';

// Inside the checkout function, replace the hardcoded outlet ID:
export async function checkout(request: CheckoutRequest): Promise<Transaction> {
  // Use active outlet if not explicitly provided
  const outletId = request.outletId || getActiveOutletId();
  if (!outletId) throw new Error('No active outlet. Select an outlet first.');

  // ... rest of checkout logic uses outletId ...
}
```

- [ ] **Step 3: Update dashboard service with consolidated mode**

In `src/lib/modules/dashboard/service.ts`, add a toggle for consolidated vs single-outlet mode:

```typescript
import { getActiveOutletId } from '../outlet/stores.svelte';
import { isOwner } from '../auth/stores.svelte';

export async function getDashboardData(options?: { consolidated?: boolean }) {
  const consolidated = options?.consolidated && isOwner();

  if (consolidated) {
    // Redirect to consolidated reporting
    const { fetchConsolidatedDashboard } = await import('../reporting/consolidated');
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    return fetchConsolidatedDashboard({
      dateRange: { from: thirtyDaysAgo, to: today },
    });
  }

  // Single outlet mode — existing logic with active outlet
  const outletId = getActiveOutletId();
  // ... existing dashboard logic scoped to outletId ...
}
```

- [ ] **Step 4: Add owner tabs to BottomNav**

In `src/lib/components/BottomNav.svelte`, add an owner-specific tab set:

```typescript
// Add outlet icon
const icons = {
  // ... existing icons ...
  outlets: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
};

// Owner tabs (adds Outlets to staff tabs)
const ownerTabs = $derived([
  { href: `${base}/`, label: t('nav.library'), icon: icons.book },
  { href: `${base}/staff/pos`, label: t('nav.pos'), icon: icons.pos },
  { href: `${base}/staff/inventory`, label: t('nav.inventory'), icon: icons.inventory },
  { href: `${base}/owner/outlets`, label: t('nav.outlets'), icon: icons.outlets },
  { href: `${base}/stats`, label: t('nav.stats'), icon: icons.chart },
]);

let tabs = $derived(
  isOwner() ? ownerTabs :
  isStaff() ? staffTabs :
  guestTabs
);
```

- [ ] **Step 5: Listen for outlet-changed event to reload data**

In the main layout or relevant pages, add a listener for the `outlet-changed` custom event so data is refreshed when the owner switches outlets:

In `src/routes/+layout.svelte`, add inside `onMount`:

```typescript
// Listen for outlet changes (from OutletPicker)
const onOutletChanged = () => {
  // Force re-fetch of outlet-scoped data
  window.dispatchEvent(new Event('reload-outlet-data'));
};
window.addEventListener('outlet-changed', onOutletChanged);

// Cleanup
return () => {
  window.removeEventListener('outlet-changed', onOutletChanged);
};
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/modules/inventory/service.ts src/lib/modules/pos/checkout.ts src/lib/modules/dashboard/service.ts src/lib/components/BottomNav.svelte src/routes/+layout.svelte
git commit -m "feat: wire active outlet context into inventory, POS, dashboard, and navigation"
```

---

## Task 11: Integration Testing & Smoke Test

**Files:**
- No new files — testing across all Phase 5 features

- [ ] **Step 1: Run all unit tests**

```bash
npx vitest run
```

Expected: All tests pass (existing + Phase 5 new tests).

- [ ] **Step 2: Verify migration applies cleanly**

```bash
npx supabase db reset
```

Expected: All migrations apply without error.

- [ ] **Step 3: Regenerate types one final time**

```bash
npx supabase gen types typescript --local > src/lib/supabase/types.ts
```

- [ ] **Step 4: Run dev server and smoke test**

```bash
npm run dev
```

Create test data:
1. In Supabase SQL Editor, create a second outlet:
```sql
INSERT INTO outlet (name, address) VALUES ('Libris Cafe Kemang', 'Jl. Kemang Raya No. 10');
```
2. Create a staff member assigned to the new outlet.

Manual smoke test checklist:
- [ ] Login as owner — OutletPicker visible in TopBar with 2 outlets
- [ ] Switch outlet — inventory list updates to show only that outlet's items
- [ ] Navigate to /owner/outlets — both outlets visible, can edit each
- [ ] Navigate to /owner/outlets/{id}/staff — shows assigned staff, can reassign
- [ ] Navigate to /owner/transfers — create a new transfer between outlets
- [ ] Walk transfer through: requested → approved → shipped → received
- [ ] Verify stock decremented at source outlet, incremented at destination
- [ ] Navigate to /owner/reports/consolidated — dashboard loads with both outlets
- [ ] Filter by outlet — tables and chart update
- [ ] BottomNav shows Outlets tab when logged in as owner
- [ ] Staff login (not owner) — no OutletPicker, no Outlets tab, no /owner/ routes
- [ ] Guest mode — everything unchanged from Phase 4
- [ ] Existing features still work: POS, inventory, dashboard, browse, search

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete Phase 5 — multi-outlet support, transfers, consolidated reporting"
```

---

## Summary

| Task | What it builds | Tests |
|------|----------------|-------|
| 1 | Database migration — outlet_transfer table, RPCs, RLS updates | Migration verification |
| 2 | Outlet module — types, CRUD service, stores, staff assignment | 3 unit tests |
| 3 | Transfer workflow — state machine, CRUD, stock movements | 10 unit tests |
| 4 | Consolidated reporting service — cross-outlet aggregation | 3 unit tests |
| 5 | i18n strings for outlets, transfers, consolidated reports (EN/ID) | — |
| 6 | OutletPicker component, TransferStatusBadge, TopBar integration | Manual |
| 7 | Outlet management pages — list, edit, per-outlet staff | Manual |
| 8 | Transfer management pages — create, list, detail with actions | Manual |
| 9 | Consolidated reporting dashboard — charts, tables, filters | Manual |
| 10 | Wire active outlet into inventory, POS, dashboard, BottomNav | Manual |
| 11 | Integration testing — full smoke test across all Phase 5 features | Full smoke test |

**Total: 11 tasks, ~16 unit tests, 1 integration smoke test**

After Phase 5 is complete, Libris Cafe supports full multi-outlet operations with inter-outlet stock transfers and consolidated cross-outlet reporting for owners.
