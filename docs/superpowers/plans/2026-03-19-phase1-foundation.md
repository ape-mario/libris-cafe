# Phase 1: Foundation (MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Libris into Libris Cafe MVP — staff can login, manage inventory, and sell books via cash POS with offline queue.

**Architecture:** Hybrid data layer — existing Yjs for book catalog (unchanged), new Supabase for business data (inventory, transactions, auth). Bridge via shared Book UUID. Offline queue in IndexedDB for POS transactions.

**Tech Stack:** SvelteKit 2 + Svelte 5, Yjs + y-indexeddb (existing), Supabase (Postgres + Auth + Edge Functions + Realtime), Vitest for testing.

**Spec Reference:** `docs/superpowers/specs/2026-03-19-libris-cafe-design.md`

---

## File Structure

### New Files

```
src/lib/
├── supabase/
│   ├── client.ts                    # Supabase client init (singleton)
│   └── types.ts                     # Generated DB types (from supabase gen types)
│
├── modules/
│   ├── auth/
│   │   ├── types.ts                 # Staff, Role, AuthSession types
│   │   ├── service.ts               # PIN login, logout, session management
│   │   ├── service.test.ts          # Auth service tests
│   │   ├── guard.ts                 # Role-based route protection helper
│   │   └── stores.svelte.ts         # currentStaff, isOwner, isGuest reactive state
│   │
│   ├── inventory/
│   │   ├── types.ts                 # Inventory, StockMovement types
│   │   ├── service.ts               # Inventory CRUD, stock adjustments
│   │   ├── service.test.ts          # Inventory service tests
│   │   └── bridge.ts               # Yjs Book.id ↔ Supabase inventory sync
│   │
│   ├── pos/
│   │   ├── types.ts                 # Cart, Transaction, CartItem types
│   │   ├── cart.ts                  # Cart logic (add, remove, totals)
│   │   ├── cart.test.ts             # Cart logic tests
│   │   ├── checkout.ts              # Checkout flow (create transaction, decrement stock)
│   │   ├── checkout.test.ts         # Checkout tests
│   │   └── stores.svelte.ts         # cart state, current transaction
│   │
│   └── sync/
│       ├── queue.ts                 # IndexedDB offline queue (enqueue, dequeue, process)
│       ├── queue.test.ts            # Queue tests
│       └── manager.ts              # Online/offline detection, auto-sync on reconnect
│
├── shared/
│   └── book-id.ts                   # Book ID utilities for bridge

src/routes/
├── login/
│   └── +page.svelte                 # Staff PIN entry screen
├── staff/
│   ├── +layout.svelte               # Auth guard layout (redirects if not staff)
│   ├── pos/
│   │   └── +page.svelte             # POS screen (scan, search, cart, checkout)
│   └── inventory/
│       ├── +page.svelte             # Inventory list (all books with stock info)
│       └── [id]/
│           └── +page.svelte         # Single inventory item detail/edit

supabase/
├── config.toml                      # Supabase project config
└── migrations/
    └── 00001_foundation.sql         # Phase 1 tables: outlet, staff, inventory,
                                     # stock_movement, transaction, transaction_item
```

### Modified Files

```
src/lib/components/BottomNav.svelte      # Conditional tabs based on role
src/lib/components/TopBar.svelte         # Show staff name + role badge
src/lib/i18n/en.ts                       # Add POS, inventory, auth strings
src/lib/i18n/id.ts                       # Add POS, inventory, auth strings
src/routes/+layout.svelte                # Add Supabase init + auth state restore
package.json                             # Add @supabase/supabase-js dependency
```

---

## Task 1: Supabase Project Setup & Database Migration

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/00001_foundation.sql`
- Modify: `package.json` (add @supabase/supabase-js)
- Create: `src/lib/supabase/client.ts`

- [ ] **Step 1: Install Supabase dependencies**

```bash
npm install @supabase/supabase-js
npm install -D supabase fake-indexeddb
```

> Note: `fake-indexeddb` is needed for offline queue tests in Task 4.

- [ ] **Step 2: Initialize Supabase project**

```bash
npx supabase init
```

This creates `supabase/config.toml`. Keep defaults.

- [ ] **Step 3: Write the foundation migration**

Create `supabase/migrations/00001_foundation.sql`:

```sql
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
CREATE TABLE staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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
  stock integer DEFAULT 0,
  min_stock integer DEFAULT 1,
  location text,
  condition text CHECK (condition IN ('new', 'good', 'fair')) DEFAULT 'new',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
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
  quantity integer NOT NULL,
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
-- Note: "transaction" is a PostgreSQL reserved word but works unquoted as table name.
-- If you encounter issues in raw SQL, use double quotes: "transaction"
CREATE TABLE transaction (
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

CREATE INDEX idx_transaction_outlet ON transaction(outlet_id);
CREATE INDEX idx_transaction_created ON transaction(created_at);
CREATE INDEX idx_transaction_offline_id ON transaction(offline_id);

-- Transaction Items
CREATE TABLE transaction_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES transaction(id) ON DELETE CASCADE,
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
ALTER TABLE transaction ENABLE ROW LEVEL SECURITY;
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

CREATE POLICY "Staff can manage own outlet transactions" ON transaction
  FOR ALL USING (
    outlet_id IN (SELECT outlet_id FROM staff WHERE id = auth.uid())
  );

CREATE POLICY "Staff can manage own outlet transaction items" ON transaction_item
  FOR ALL USING (
    transaction_id IN (
      SELECT t.id FROM transaction t
      JOIN staff s ON s.outlet_id = t.outlet_id
      WHERE s.id = auth.uid()
    )
  );

-- Seed: default outlet
INSERT INTO outlet (name, address)
VALUES ('Libris Cafe', 'Alamat cafe di sini');
```

- [ ] **Step 4: Create Supabase client**

Create `src/lib/supabase/client.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Libris Cafe] Supabase not configured. Business features disabled.');
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export function getSupabase() {
  if (!supabase) throw new Error('Supabase not configured');
  return supabase;
}
```

- [ ] **Step 5: Create `.env.example`**

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

- [ ] **Step 6: Verify — start local Supabase and apply migration**

```bash
npx supabase start
npx supabase db reset
```

Expected: tables created, seed data inserted, no errors.

- [ ] **Step 7: Generate TypeScript types**

```bash
npx supabase gen types typescript --local > src/lib/supabase/types.ts
```

- [ ] **Step 8: Commit**

```bash
git add supabase/ src/lib/supabase/ .env.example package.json package-lock.json
git commit -m "feat: add Supabase foundation — tables, RLS, client setup"
```

---

## Task 2: Auth Module — Types, Service & Store

**Files:**
- Create: `src/lib/modules/auth/types.ts`
- Create: `src/lib/modules/auth/service.ts`
- Create: `src/lib/modules/auth/service.test.ts`
- Create: `src/lib/modules/auth/stores.svelte.ts`
- Create: `src/lib/modules/auth/guard.ts`

- [ ] **Step 1: Write auth types**

Create `src/lib/modules/auth/types.ts`:

```typescript
export interface Staff {
  id: string;
  name: string;
  email: string | null;
  role: 'owner' | 'staff';
  outlet_id: string;
  is_active: boolean;
  created_at: string;
}

export interface AuthSession {
  staff: Staff;
  token: string;  // Supabase JWT
}

export type AppRole = 'owner' | 'staff' | 'guest';
```

- [ ] **Step 2: Write failing test for auth service**

Create `src/lib/modules/auth/service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase
const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();
const mockFrom = vi.fn();

vi.mock('$lib/supabase/client', () => ({
  getSupabase: () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
    from: mockFrom,
  }),
}));

import { loginWithPin, logout, getStaffByAuthId } from './service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Auth service', () => {
  it('should login with valid PIN and return staff data', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: 'auth-123' }, session: { access_token: 'jwt-xyz' } },
      error: null,
    });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'staff-1',
              name: 'Andi',
              email: 'andi@cafe.com',
              role: 'staff',
              outlet_id: 'outlet-1',
              is_active: true,
              created_at: '2026-01-01T00:00:00Z',
            },
            error: null,
          }),
        }),
      }),
    });

    const result = await loginWithPin('andi@cafe.com', '1234');
    expect(result.staff.name).toBe('Andi');
    expect(result.staff.role).toBe('staff');
    expect(result.token).toBe('jwt-xyz');
  });

  it('should throw on invalid credentials', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    });

    await expect(loginWithPin('andi@cafe.com', '0000')).rejects.toThrow(
      'Invalid login credentials'
    );
  });

  it('should logout', async () => {
    mockSignOut.mockResolvedValue({ error: null });
    await logout();
    expect(mockSignOut).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run src/lib/modules/auth/service.test.ts
```

Expected: FAIL — `loginWithPin` not found.

- [ ] **Step 4: Implement auth service**

Create `src/lib/modules/auth/service.ts`:

```typescript
import { getSupabase } from '$lib/supabase/client';
import type { Staff, AuthSession } from './types';

/**
 * Login with email + PIN (PIN is used as password in Supabase Auth).
 * Staff accounts are pre-created by owner — no self-registration.
 */
export async function loginWithPin(email: string, pin: string): Promise<AuthSession> {
  const supabase = getSupabase();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: pin,
  });

  if (error) throw new Error(error.message);
  if (!data.user || !data.session) throw new Error('Login failed');

  const staff = await getStaffByAuthId(data.user.id);
  if (!staff) throw new Error('Staff record not found');
  if (!staff.is_active) throw new Error('Account is deactivated');

  return {
    staff,
    token: data.session.access_token,
  };
}

export async function getStaffByAuthId(authId: string): Promise<Staff | null> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('staff')
    .select('*')
    .eq('id', authId)
    .single();

  if (error || !data) return null;
  return data as Staff;
}

export async function logout(): Promise<void> {
  const supabase = getSupabase();
  await supabase.auth.signOut();
}

export async function restoreSession(): Promise<AuthSession | null> {
  const supabase = getSupabase();

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;

  const staff = await getStaffByAuthId(session.user.id);
  if (!staff || !staff.is_active) return null;

  return { staff, token: session.access_token };
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run src/lib/modules/auth/service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Write auth store**

Create `src/lib/modules/auth/stores.svelte.ts`:

```typescript
import type { Staff, AppRole } from './types';

let currentStaff = $state<Staff | null>(null);

export function getCurrentStaff(): Staff | null {
  return currentStaff;
}

export function setCurrentStaff(staff: Staff | null): void {
  currentStaff = staff;
}

export function getAppRole(): AppRole {
  if (!currentStaff) return 'guest';
  return currentStaff.role;
}

export function isOwner(): boolean {
  return currentStaff?.role === 'owner';
}

export function isStaff(): boolean {
  return currentStaff !== null;
}

export function isGuest(): boolean {
  return currentStaff === null;
}
```

- [ ] **Step 7: Write auth guard**

Create `src/lib/modules/auth/guard.ts`:

```typescript
import { goto } from '$app/navigation';
import { base } from '$app/paths';
import { getCurrentStaff } from './stores.svelte';
import type { AppRole } from './types';

/**
 * Check if current user has required role. Redirect to login if not.
 * Call in onMount() of protected layouts.
 */
export function requireRole(requiredRole: AppRole): boolean {
  const staff = getCurrentStaff();

  if (requiredRole === 'guest') return true;

  if (!staff) {
    goto(`${base}/login`);
    return false;
  }

  if (requiredRole === 'owner' && staff.role !== 'owner') {
    goto(`${base}/`);
    return false;
  }

  return true;
}
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/modules/auth/
git commit -m "feat: add auth module — PIN login, role store, route guard"
```

---

## Task 3: Inventory Module — Types, Service & Bridge

**Files:**
- Create: `src/lib/modules/inventory/types.ts`
- Create: `src/lib/modules/inventory/service.ts`
- Create: `src/lib/modules/inventory/service.test.ts`
- Create: `src/lib/modules/inventory/bridge.ts`
- Create: `src/lib/shared/book-id.ts`

- [ ] **Step 1: Write shared book-id utility**

Create `src/lib/shared/book-id.ts`:

```typescript
/**
 * Book ID is a UUID generated by Yjs when a book is added.
 * This same ID is used as inventory.book_id in Supabase.
 * This module provides validation/formatting utilities.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidBookId(id: string): boolean {
  return UUID_RE.test(id);
}
```

- [ ] **Step 2: Write inventory types**

Create `src/lib/modules/inventory/types.ts`:

```typescript
export type InventoryType = 'for_sale' | 'read_in_store' | 'both';
export type BookSource = 'supplier' | 'owner' | 'consignment' | 'buyback';
export type BookCondition = 'new' | 'good' | 'fair';
export type StockMovementType =
  | 'purchase_in' | 'sale_out' | 'return_in' | 'return_out'
  | 'adjustment' | 'void_restore' | 'consignment_in'
  | 'consignment_return' | 'buyback_in';

export interface Inventory {
  id: string;
  book_id: string;
  outlet_id: string;
  type: InventoryType;
  source: BookSource;
  is_preloved: boolean;
  price: number | null;
  cost_price: number | null;
  stock: number;
  min_stock: number;
  location: string | null;
  condition: BookCondition;
  created_at: string;
  updated_at: string;
}

export interface StockMovement {
  id: string;
  inventory_id: string;
  type: StockMovementType;
  quantity: number;
  reference_id: string | null;
  reason: string | null;
  staff_id: string;
  created_at: string;
}

export interface NewInventoryItem {
  book_id: string;
  outlet_id: string;
  type: InventoryType;
  source: BookSource;
  is_preloved: boolean;
  price: number | null;
  cost_price: number | null;
  stock: number;
  min_stock?: number;
  location?: string;
  condition: BookCondition;
}
```

- [ ] **Step 3: Write failing test for inventory service**

Create `src/lib/modules/inventory/service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

const chainable = (terminal: any) => ({
  select: vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue(terminal),
      order: vi.fn().mockResolvedValue(terminal),
    }),
    order: vi.fn().mockResolvedValue(terminal),
  }),
  insert: mockInsert.mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue(terminal),
    }),
  }),
  update: mockUpdate.mockReturnValue({
    eq: vi.fn().mockResolvedValue(terminal),
  }),
  delete: mockDelete.mockReturnValue({
    eq: vi.fn().mockResolvedValue(terminal),
  }),
});

vi.mock('$lib/supabase/client', () => ({
  getSupabase: () => ({
    from: vi.fn((table: string) => chainable({
      data: table === 'inventory'
        ? { id: 'inv-1', book_id: 'book-1', stock: 5, price: 89000 }
        : { id: 'sm-1' },
      error: null,
    })),
  }),
}));

import {
  getInventoryByBookId,
  addInventoryItem,
  adjustStock,
} from './service';

beforeEach(() => vi.clearAllMocks());

describe('Inventory service', () => {
  it('should add an inventory item', async () => {
    const item = await addInventoryItem({
      book_id: 'book-1',
      outlet_id: 'outlet-1',
      type: 'for_sale',
      source: 'supplier',
      is_preloved: false,
      price: 89000,
      cost_price: 60000,
      stock: 10,
      condition: 'new',
    });

    expect(mockInsert).toHaveBeenCalled();
    expect(item.book_id).toBe('book-1');
  });

  it('should adjust stock with a movement record', async () => {
    await adjustStock('inv-1', 5, 'purchase_in', 'staff-1', 'Initial stock');
    expect(mockInsert).toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
npx vitest run src/lib/modules/inventory/service.test.ts
```

Expected: FAIL — functions not found.

- [ ] **Step 5: Implement inventory service**

Create `src/lib/modules/inventory/service.ts`:

```typescript
import { getSupabase } from '$lib/supabase/client';
import type { Inventory, NewInventoryItem, StockMovementType } from './types';

export async function addInventoryItem(item: NewInventoryItem): Promise<Inventory> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('inventory')
    .insert(item)
    .select()
    .single();

  if (error) throw new Error(`Failed to add inventory: ${error.message}`);
  return data as Inventory;
}

export async function getInventoryByBookId(bookId: string, outletId: string): Promise<Inventory | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('inventory')
    .select()
    .eq('book_id', bookId)
    .eq('outlet_id', outletId)
    .single();

  if (error) return null;
  return data as Inventory;
}

export async function getInventoryByOutlet(outletId: string): Promise<Inventory[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('inventory')
    .select()
    .eq('outlet_id', outletId)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch inventory: ${error.message}`);
  return (data ?? []) as Inventory[];
}

export async function updateInventoryItem(id: string, updates: Partial<Inventory>): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('inventory')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(`Failed to update inventory: ${error.message}`);
}

export async function adjustStock(
  inventoryId: string,
  quantity: number,
  type: StockMovementType,
  staffId: string,
  reason?: string,
  referenceId?: string
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('stock_movement')
    .insert({
      inventory_id: inventoryId,
      type,
      quantity,
      staff_id: staffId,
      reason: reason ?? null,
      reference_id: referenceId ?? null,
    });

  if (error) throw new Error(`Failed to record stock movement: ${error.message}`);
  // Note: inventory.stock is auto-updated by the DB trigger
}

export async function getStockMovements(inventoryId: string): Promise<any[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('stock_movement')
    .select()
    .eq('inventory_id', inventoryId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch movements: ${error.message}`);
  return data ?? [];
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
npx vitest run src/lib/modules/inventory/service.test.ts
```

Expected: PASS.

- [ ] **Step 7: Write inventory bridge**

Create `src/lib/modules/inventory/bridge.ts`:

```typescript
import { getBookById } from '$lib/services/books';
import type { Book } from '$lib/db';
import type { Inventory } from './types';

/**
 * Enrich inventory items with book metadata from Yjs.
 * This is the bridge between Supabase inventory and Yjs catalog.
 */
export interface EnrichedInventory extends Inventory {
  book: Book | null;
}

export function enrichInventory(items: Inventory[]): EnrichedInventory[] {
  return items.map(item => ({
    ...item,
    book: getBookById(item.book_id) ?? null,
  }));
}

export function enrichSingle(item: Inventory): EnrichedInventory {
  return {
    ...item,
    book: getBookById(item.book_id) ?? null,
  };
}
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/modules/inventory/ src/lib/shared/
git commit -m "feat: add inventory module — CRUD, stock movements, Yjs bridge"
```

---

## Task 4: Offline Queue

**Files:**
- Create: `src/lib/modules/sync/queue.ts`
- Create: `src/lib/modules/sync/queue.test.ts`
- Create: `src/lib/modules/sync/manager.ts`

- [ ] **Step 1: Write offline queue types and test**

Create `src/lib/modules/sync/queue.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { OfflineQueue } from './queue';

let queue: OfflineQueue;

beforeEach(async () => {
  // Fresh DB per test
  const dbName = `test-queue-${crypto.randomUUID()}`;
  queue = new OfflineQueue(dbName);
});

describe('OfflineQueue', () => {
  it('should enqueue an entry', async () => {
    const id = await queue.enqueue('transaction', { total: 89000 });
    expect(id).toBeDefined();

    const pending = await queue.getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].type).toBe('transaction');
    expect(pending[0].payload.total).toBe(89000);
  });

  it('should dequeue entries in FIFO order', async () => {
    await queue.enqueue('transaction', { total: 1 });
    await queue.enqueue('transaction', { total: 2 });

    const pending = await queue.getPending();
    expect(pending[0].payload.total).toBe(1);
    expect(pending[1].payload.total).toBe(2);
  });

  it('should mark entry as synced', async () => {
    const id = await queue.enqueue('transaction', { total: 89000 });
    await queue.markSynced(id);

    const pending = await queue.getPending();
    expect(pending).toHaveLength(0);
  });

  it('should mark entry as failed with error', async () => {
    const id = await queue.enqueue('transaction', { total: 89000 });
    await queue.markFailed(id, 'Network error');

    const pending = await queue.getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].status).toBe('failed');
    expect(pending[0].retries).toBe(1);
  });

  it('should return queue count', async () => {
    await queue.enqueue('transaction', { total: 1 });
    await queue.enqueue('stock_adjustment', { quantity: 5 });

    const count = await queue.getCount();
    expect(count).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/modules/sync/queue.test.ts
```

Expected: FAIL — `OfflineQueue` not found.

- [ ] **Step 3: Implement offline queue**

Create `src/lib/modules/sync/queue.ts`:

```typescript
export interface QueueEntry {
  id: string;
  type: 'transaction' | 'stock_adjustment';
  payload: any;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  retries: number;
  error: string | null;
  created_at: string;
  synced_at: string | null;
}

/**
 * IndexedDB-backed offline queue for business operations.
 * Entries are processed FIFO when the app comes back online.
 */
export class OfflineQueue {
  private dbName: string;
  private db: IDBDatabase | null = null;
  private static STORE = 'queue';

  constructor(dbName = 'libris-cafe-queue') {
    this.dbName = dbName;
  }

  private open(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db);

    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(OfflineQueue.STORE)) {
          const store = db.createObjectStore(OfflineQueue.STORE, { keyPath: 'id' });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('created_at', 'created_at', { unique: false });
        }
      };
      req.onsuccess = () => {
        this.db = req.result;
        resolve(this.db);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async enqueue(type: QueueEntry['type'], payload: any): Promise<string> {
    const db = await this.open();
    const entry: QueueEntry = {
      id: crypto.randomUUID(),
      type,
      payload,
      status: 'pending',
      retries: 0,
      error: null,
      created_at: new Date().toISOString(),
      synced_at: null,
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(OfflineQueue.STORE, 'readwrite');
      tx.objectStore(OfflineQueue.STORE).put(entry);
      tx.oncomplete = () => resolve(entry.id);
      tx.onerror = () => reject(tx.error);
    });
  }

  async getPending(): Promise<QueueEntry[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OfflineQueue.STORE, 'readonly');
      const store = tx.objectStore(OfflineQueue.STORE);
      const req = store.index('created_at').getAll();
      req.onsuccess = () => {
        const entries = (req.result as QueueEntry[])
          .filter(e => e.status === 'pending' || e.status === 'failed');
        resolve(entries);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async markSynced(id: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OfflineQueue.STORE, 'readwrite');
      const store = tx.objectStore(OfflineQueue.STORE);
      const req = store.get(id);
      req.onsuccess = () => {
        const entry = req.result as QueueEntry;
        if (entry) {
          entry.status = 'synced';
          entry.synced_at = new Date().toISOString();
          store.put(entry);
        }
        tx.oncomplete = () => resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  async markFailed(id: string, error: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OfflineQueue.STORE, 'readwrite');
      const store = tx.objectStore(OfflineQueue.STORE);
      const req = store.get(id);
      req.onsuccess = () => {
        const entry = req.result as QueueEntry;
        if (entry) {
          entry.status = 'failed';
          entry.retries += 1;
          entry.error = error;
          store.put(entry);
        }
        tx.oncomplete = () => resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  async getCount(): Promise<number> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OfflineQueue.STORE, 'readonly');
      const index = tx.objectStore(OfflineQueue.STORE).index('status');
      let count = 0;
      const r1 = index.count(IDBKeyRange.only('pending'));
      r1.onsuccess = () => {
        count += r1.result;
        const r2 = index.count(IDBKeyRange.only('failed'));
        r2.onsuccess = () => resolve(count + r2.result);
        r2.onerror = () => reject(r2.error);
      };
      r1.onerror = () => reject(r1.error);
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/modules/sync/queue.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write sync manager**

Create `src/lib/modules/sync/manager.ts`:

```typescript
import { OfflineQueue } from './queue';
import { getSupabase } from '$lib/supabase/client';

const queue = new OfflineQueue();
let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
let processing = false;

export function getQueue(): OfflineQueue {
  return queue;
}

export function getIsOnline(): boolean {
  return isOnline;
}

export function initSyncManager(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('online', () => {
    isOnline = true;
    processQueue();
  });

  window.addEventListener('offline', () => {
    isOnline = false;
  });

  // Process any pending items on startup
  if (isOnline) processQueue();
}

async function processQueue(): Promise<void> {
  if (processing || !isOnline) return;
  processing = true;

  try {
    const supabase = getSupabase();
    const pending = await queue.getPending();

    for (const entry of pending) {
      if (!isOnline) break;

      try {
        if (entry.type === 'transaction') {
          await syncTransaction(supabase, entry.payload);
        } else if (entry.type === 'stock_adjustment') {
          await syncStockAdjustment(supabase, entry.payload);
        }
        await queue.markSynced(entry.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await queue.markFailed(entry.id, message);

        // If it's a conflict (already synced), mark as synced
        if (message.includes('duplicate') || message.includes('unique')) {
          await queue.markSynced(entry.id);
        }
      }
    }
  } finally {
    processing = false;
  }
}

async function syncTransaction(supabase: any, payload: any): Promise<void> {
  const { items, ...transaction } = payload;

  // Insert transaction with offline_id for deduplication
  const { data: txData, error: txError } = await supabase
    .from('transaction')
    .insert(transaction)
    .select()
    .single();

  if (txError) throw new Error(txError.message);

  // Insert transaction items
  const itemsWithTxId = items.map((item: any) => ({
    ...item,
    transaction_id: txData.id,
  }));

  const { error: itemsError } = await supabase
    .from('transaction_item')
    .insert(itemsWithTxId);

  if (itemsError) throw new Error(itemsError.message);

  // Decrement stock for each item
  for (const item of items) {
    await supabase.from('stock_movement').insert({
      inventory_id: item.inventory_id,
      type: 'sale_out',
      quantity: -item.quantity,
      reference_id: txData.id,
      staff_id: transaction.staff_id,
    });
  }
}

async function syncStockAdjustment(supabase: any, payload: any): Promise<void> {
  const { error } = await supabase
    .from('stock_movement')
    .insert(payload);

  if (error) throw new Error(error.message);
}

export { processQueue };
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/modules/sync/
git commit -m "feat: add offline queue — IndexedDB-backed sync for POS transactions"
```

---

## Task 5: POS Module — Cart Logic & Checkout

**Files:**
- Create: `src/lib/modules/pos/types.ts`
- Create: `src/lib/modules/pos/cart.ts`
- Create: `src/lib/modules/pos/cart.test.ts`
- Create: `src/lib/modules/pos/checkout.ts`
- Create: `src/lib/modules/pos/checkout.test.ts`
- Create: `src/lib/modules/pos/stores.svelte.ts`

- [ ] **Step 1: Write POS types**

Create `src/lib/modules/pos/types.ts`:

```typescript
import type { Inventory } from '../inventory/types';
import type { Book } from '$lib/db';

export interface CartItem {
  inventory: Inventory;
  book: Book;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
}

export interface Cart {
  items: CartItem[];
  subtotal: number;
  discount: number;
  tax: number;
  taxRate: number;
  total: number;
}

export interface CheckoutRequest {
  cart: Cart;
  paymentMethod: 'cash';  // Phase 1: cash only
  staffId: string;
  outletId: string;
  customerName?: string;
  customerContact?: string;
  notes?: string;
}
```

- [ ] **Step 2: Write failing test for cart**

Create `src/lib/modules/pos/cart.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createCart, addToCart, removeFromCart, updateQuantity, clearCart } from './cart';
import type { Inventory } from '../inventory/types';
import type { Book } from '$lib/db';

const mockBook: Book = {
  id: 'book-1', title: 'Atomic Habits', authors: ['James Clear'],
  categories: ['self-help'], dateAdded: '', dateModified: '',
};

const mockInventory: Inventory = {
  id: 'inv-1', book_id: 'book-1', outlet_id: 'outlet-1',
  type: 'for_sale', source: 'supplier', is_preloved: false,
  price: 89000, cost_price: 60000, stock: 10, min_stock: 1,
  location: 'Rak A1', condition: 'new',
  created_at: '', updated_at: '',
};

describe('Cart', () => {
  it('should create an empty cart', () => {
    const cart = createCart(11);
    expect(cart.items).toHaveLength(0);
    expect(cart.total).toBe(0);
    expect(cart.taxRate).toBe(11);
  });

  it('should add item and calculate totals', () => {
    let cart = createCart(11);
    cart = addToCart(cart, mockInventory, mockBook);

    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].quantity).toBe(1);
    expect(cart.items[0].unitPrice).toBe(89000);
    expect(cart.subtotal).toBe(89000);
    expect(cart.tax).toBe(9790);  // 89000 * 0.11
    expect(cart.total).toBe(98790);  // 89000 + 9790
  });

  it('should increment quantity when adding same item', () => {
    let cart = createCart(0);  // no tax for simpler test
    cart = addToCart(cart, mockInventory, mockBook);
    cart = addToCart(cart, mockInventory, mockBook);

    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].quantity).toBe(2);
    expect(cart.subtotal).toBe(178000);
  });

  it('should remove item', () => {
    let cart = createCart(0);
    cart = addToCart(cart, mockInventory, mockBook);
    cart = removeFromCart(cart, 'inv-1');

    expect(cart.items).toHaveLength(0);
    expect(cart.total).toBe(0);
  });

  it('should update quantity', () => {
    let cart = createCart(0);
    cart = addToCart(cart, mockInventory, mockBook);
    cart = updateQuantity(cart, 'inv-1', 5);

    expect(cart.items[0].quantity).toBe(5);
    expect(cart.subtotal).toBe(445000);
  });

  it('should clear cart', () => {
    let cart = createCart(0);
    cart = addToCart(cart, mockInventory, mockBook);
    cart = clearCart(cart);

    expect(cart.items).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run src/lib/modules/pos/cart.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement cart logic**

Create `src/lib/modules/pos/cart.ts`:

```typescript
import type { Cart, CartItem } from './types';
import type { Inventory } from '../inventory/types';
import type { Book } from '$lib/db';

export function createCart(taxRate: number = 11): Cart {
  return { items: [], subtotal: 0, discount: 0, tax: 0, taxRate, total: 0 };
}

function recalculate(cart: Cart): Cart {
  const subtotal = cart.items.reduce((sum, item) => sum + item.total, 0);
  const discount = cart.discount;
  const taxable = subtotal - discount;
  const tax = Math.round(taxable * (cart.taxRate / 100));
  const total = taxable + tax;

  return { ...cart, subtotal, tax, total };
}

export function addToCart(cart: Cart, inventory: Inventory, book: Book): Cart {
  const existing = cart.items.find(i => i.inventory.id === inventory.id);

  if (existing) {
    const items = cart.items.map(item =>
      item.inventory.id === inventory.id
        ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.unitPrice - item.discount }
        : item
    );
    return recalculate({ ...cart, items });
  }

  const price = inventory.price ?? 0;
  const newItem: CartItem = {
    inventory,
    book,
    quantity: 1,
    unitPrice: price,
    discount: 0,
    total: price,
  };

  return recalculate({ ...cart, items: [...cart.items, newItem] });
}

export function removeFromCart(cart: Cart, inventoryId: string): Cart {
  const items = cart.items.filter(i => i.inventory.id !== inventoryId);
  return recalculate({ ...cart, items });
}

export function updateQuantity(cart: Cart, inventoryId: string, quantity: number): Cart {
  if (quantity <= 0) return removeFromCart(cart, inventoryId);

  const items = cart.items.map(item =>
    item.inventory.id === inventoryId
      ? { ...item, quantity, total: quantity * item.unitPrice - item.discount }
      : item
  );
  return recalculate({ ...cart, items });
}

export function clearCart(cart: Cart): Cart {
  return recalculate({ ...cart, items: [], discount: 0 });
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run src/lib/modules/pos/cart.test.ts
```

Expected: PASS.

- [ ] **Step 6: Implement checkout**

Create `src/lib/modules/pos/checkout.ts`:

```typescript
import { getSupabase } from '$lib/supabase/client';
import { getQueue, getIsOnline } from '../sync/manager';
import type { CheckoutRequest } from './types';

export interface CheckoutResult {
  transactionId: string | null;  // null if queued offline
  offlineId: string;
  synced: boolean;
}

export async function checkout(request: CheckoutRequest): Promise<CheckoutResult> {
  const offlineId = crypto.randomUUID();
  const { cart, paymentMethod, staffId, outletId, customerName, customerContact, notes } = request;

  const transactionPayload = {
    outlet_id: outletId,
    staff_id: staffId,
    type: 'sale' as const,
    subtotal: cart.subtotal,
    discount: cart.discount,
    tax: cart.tax,
    total: cart.total,
    payment_method: paymentMethod,
    payment_status: 'paid' as const,  // cash = instantly paid
    customer_name: customerName ?? null,
    customer_contact: customerContact ?? null,
    notes: notes ?? null,
    offline_id: offlineId,
  };

  const itemsPayload = cart.items.map(item => ({
    inventory_id: item.inventory.id,
    book_id: item.book.id,
    title: item.book.title,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    discount: item.discount,
    total: item.total,
  }));

  // Try online first
  if (getIsOnline()) {
    try {
      const supabase = getSupabase();

      const { data: txData, error: txError } = await supabase
        .from('transaction')
        .insert(transactionPayload)
        .select()
        .single();

      if (txError) throw txError;

      const itemsWithTxId = itemsPayload.map(item => ({
        ...item,
        transaction_id: txData.id,
      }));

      await supabase.from('transaction_item').insert(itemsWithTxId);

      // Record stock movements
      for (const item of cart.items) {
        await supabase.from('stock_movement').insert({
          inventory_id: item.inventory.id,
          type: 'sale_out',
          quantity: -item.quantity,
          reference_id: txData.id,
          staff_id: staffId,
        });
      }

      return { transactionId: txData.id, offlineId, synced: true };
    } catch {
      // Fall through to offline queue
    }
  }

  // Queue offline
  const queue = getQueue();
  await queue.enqueue('transaction', {
    ...transactionPayload,
    items: itemsPayload,
  });

  return { transactionId: null, offlineId, synced: false };
}
```

- [ ] **Step 7: Write POS store**

Create `src/lib/modules/pos/stores.svelte.ts`:

```typescript
import type { Cart } from './types';
import { createCart } from './cart';

let currentCart = $state<Cart>(createCart());

export function getCart(): Cart {
  return currentCart;
}

export function setCart(cart: Cart): void {
  currentCart = cart;
}

export function resetCart(taxRate: number = 11): void {
  currentCart = createCart(taxRate);
}
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/modules/pos/
git commit -m "feat: add POS module — cart logic, checkout with offline fallback"
```

---

## Task 6: i18n — Add Business Strings

**Files:**
- Modify: `src/lib/i18n/en.ts`
- Modify: `src/lib/i18n/id.ts`

- [ ] **Step 1: Add English strings**

Add to `src/lib/i18n/en.ts` (append to the existing object):

```typescript
// Auth
'auth.login': 'Staff Login',
'auth.email': 'Email',
'auth.pin': 'PIN',
'auth.pin_placeholder': 'Enter 4-6 digit PIN',
'auth.login_button': 'Login',
'auth.login_error': 'Invalid email or PIN',
'auth.logout': 'Logout',
'auth.guest_mode': 'Continue as Guest',

// POS
'pos.title': 'Point of Sale',
'pos.scan': 'Scan Barcode',
'pos.search': 'Search books...',
'pos.cart': 'Cart',
'pos.cart_empty': 'Cart is empty',
'pos.subtotal': 'Subtotal',
'pos.tax': 'Tax ({rate}%)',
'pos.discount': 'Discount',
'pos.total': 'Total',
'pos.pay_cash': 'Pay Cash',
'pos.checkout_success': 'Transaction complete!',
'pos.checkout_offline': 'Saved offline. Will sync when online.',
'pos.quantity': 'Qty',

// Inventory
'inventory.title': 'Inventory',
'inventory.add': 'Add to Inventory',
'inventory.stock': 'Stock',
'inventory.price': 'Price',
'inventory.cost_price': 'Cost Price',
'inventory.location': 'Location',
'inventory.type': 'Type',
'inventory.type_sale': 'For Sale',
'inventory.type_read': 'Read in Store',
'inventory.type_both': 'Sale + Read',
'inventory.source': 'Source',
'inventory.source_supplier': 'Supplier',
'inventory.source_owner': 'Owner',
'inventory.source_consignment': 'Consignment',
'inventory.source_buyback': 'Buyback',
'inventory.condition': 'Condition',
'inventory.condition_new': 'New',
'inventory.condition_good': 'Good',
'inventory.condition_fair': 'Fair',
'inventory.preloved': 'Preloved',
'inventory.low_stock': 'Low Stock',
'inventory.out_of_stock': 'Out of Stock',
'inventory.in_stock': 'In Stock',
'inventory.adjust_stock': 'Adjust Stock',
'inventory.movement_history': 'Stock History',

// Navigation (staff)
'nav.pos': 'POS',
'nav.inventory': 'Inventory',
'nav.dashboard': 'Dashboard',

// Offline
'offline.status': 'Offline',
'offline.pending': '{count} pending sync',
'offline.syncing': 'Syncing...',
```

- [ ] **Step 2: Add Indonesian strings**

Add matching keys to `src/lib/i18n/id.ts`:

```typescript
// Auth
'auth.login': 'Login Staff',
'auth.email': 'Email',
'auth.pin': 'PIN',
'auth.pin_placeholder': 'Masukkan PIN 4-6 digit',
'auth.login_button': 'Masuk',
'auth.login_error': 'Email atau PIN salah',
'auth.logout': 'Keluar',
'auth.guest_mode': 'Lanjut sebagai Tamu',

// POS
'pos.title': 'Kasir',
'pos.scan': 'Scan Barcode',
'pos.search': 'Cari buku...',
'pos.cart': 'Keranjang',
'pos.cart_empty': 'Keranjang kosong',
'pos.subtotal': 'Subtotal',
'pos.tax': 'Pajak ({rate}%)',
'pos.discount': 'Diskon',
'pos.total': 'Total',
'pos.pay_cash': 'Bayar Tunai',
'pos.checkout_success': 'Transaksi berhasil!',
'pos.checkout_offline': 'Disimpan offline. Akan disinkronkan saat online.',
'pos.quantity': 'Jml',

// Inventory
'inventory.title': 'Inventori',
'inventory.add': 'Tambah ke Inventori',
'inventory.stock': 'Stok',
'inventory.price': 'Harga',
'inventory.cost_price': 'Harga Beli',
'inventory.location': 'Lokasi',
'inventory.type': 'Tipe',
'inventory.type_sale': 'Dijual',
'inventory.type_read': 'Baca di Tempat',
'inventory.type_both': 'Jual + Baca',
'inventory.source': 'Sumber',
'inventory.source_supplier': 'Supplier',
'inventory.source_owner': 'Pemilik',
'inventory.source_consignment': 'Konsinyasi',
'inventory.source_buyback': 'Beli Preloved',
'inventory.condition': 'Kondisi',
'inventory.condition_new': 'Baru',
'inventory.condition_good': 'Bagus',
'inventory.condition_fair': 'Cukup',
'inventory.preloved': 'Preloved',
'inventory.low_stock': 'Stok Rendah',
'inventory.out_of_stock': 'Habis',
'inventory.in_stock': 'Tersedia',
'inventory.adjust_stock': 'Sesuaikan Stok',
'inventory.movement_history': 'Riwayat Stok',

// Navigation (staff)
'nav.pos': 'Kasir',
'nav.inventory': 'Inventori',
'nav.dashboard': 'Dashboard',

// Offline
'offline.status': 'Offline',
'offline.pending': '{count} menunggu sinkronisasi',
'offline.syncing': 'Menyinkronkan...',
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/i18n/
git commit -m "feat: add i18n strings for auth, POS, inventory, offline status"
```

---

## Task 7: Login Page

**Files:**
- Create: `src/routes/login/+page.svelte`

- [ ] **Step 1: Create login page**

Create `src/routes/login/+page.svelte`:

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { loginWithPin } from '$lib/modules/auth/service';
  import { setCurrentStaff } from '$lib/modules/auth/stores.svelte';
  import { showToast } from '$lib/stores/toast.svelte';

  let email = $state('');
  let pin = $state('');
  let loading = $state(false);
  let error = $state('');
  let attempts = $state(0);
  let lockedUntil = $state<number | null>(null);

  const MAX_ATTEMPTS = 5;
  const LOCKOUT_MS = 5 * 60 * 1000;

  let isLocked = $derived(
    lockedUntil !== null && Date.now() < lockedUntil
  );

  async function handleLogin() {
    if (isLocked || loading) return;

    error = '';
    loading = true;

    try {
      const session = await loginWithPin(email, pin);
      setCurrentStaff(session.staff);
      showToast(`Welcome, ${session.staff.name}!`, 'success');
      goto(`${base}/staff/pos`);
    } catch (e) {
      attempts++;
      if (attempts >= MAX_ATTEMPTS) {
        lockedUntil = Date.now() + LOCKOUT_MS;
        error = `Too many attempts. Try again in 5 minutes.`;
        setTimeout(() => { lockedUntil = null; attempts = 0; }, LOCKOUT_MS);
      } else {
        error = t('auth.login_error');
      }
    } finally {
      loading = false;
    }
  }

  function continueAsGuest() {
    goto(`${base}/`);
  }
</script>

<div class="min-h-screen bg-cream flex items-center justify-center p-6">
  <div class="w-full max-w-sm">
    <div class="text-center mb-8">
      <h1 class="font-display text-3xl text-ink font-bold">Libris Cafe</h1>
      <p class="text-sm text-ink-muted mt-2">{t('auth.login')}</p>
    </div>

    <form onsubmit={(e) => { e.preventDefault(); handleLogin(); }} class="space-y-4">
      <div>
        <label for="email" class="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
          {t('auth.email')}
        </label>
        <input
          id="email"
          type="email"
          bind:value={email}
          class="w-full px-4 py-3 rounded-xl bg-surface border border-warm-100 text-ink text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
          required
          disabled={isLocked}
        />
      </div>

      <div>
        <label for="pin" class="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
          {t('auth.pin')}
        </label>
        <input
          id="pin"
          type="password"
          inputmode="numeric"
          pattern="[0-9]*"
          minlength="4"
          maxlength="6"
          bind:value={pin}
          placeholder={t('auth.pin_placeholder')}
          class="w-full px-4 py-3 rounded-xl bg-surface border border-warm-100 text-ink text-sm tracking-[0.5em] text-center focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
          required
          disabled={isLocked}
        />
      </div>

      {#if error}
        <p class="text-sm text-berry text-center">{error}</p>
      {/if}

      <button
        type="submit"
        class="w-full py-3 rounded-xl bg-accent text-cream font-semibold text-sm hover:bg-accent/90 transition-colors disabled:opacity-50"
        disabled={loading || isLocked}
      >
        {loading ? '...' : t('auth.login_button')}
      </button>
    </form>

    <div class="mt-6 text-center">
      <button
        class="text-sm text-ink-muted hover:text-accent transition-colors"
        onclick={continueAsGuest}
      >
        {t('auth.guest_mode')}
      </button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Test manually — navigate to /login**

```bash
npm run dev
```

Navigate to `http://localhost:5173/login`. Verify:
- Form renders with email, PIN fields
- "Continue as Guest" link works
- Form validation works (required fields, PIN pattern)

- [ ] **Step 3: Commit**

```bash
git add src/routes/login/
git commit -m "feat: add staff login page with PIN auth and lockout"
```

---

## Task 8: Staff Layout & Route Guard

**Files:**
- Create: `src/routes/staff/+layout.svelte`
- Modify: `src/routes/+layout.svelte`

- [ ] **Step 1: Create staff layout with auth guard**

Create `src/routes/staff/+layout.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { requireRole } from '$lib/modules/auth/guard';

  let { children } = $props();
  let authorized = $state(false);

  onMount(() => {
    authorized = requireRole('staff');
  });
</script>

{#if authorized}
  {@render children()}
{/if}
```

- [ ] **Step 2: Modify root layout — add Supabase auth restore**

In `src/routes/+layout.svelte`, add auth session restore to the `onMount` block.

After the `restoreUser();` line (around line 113), add:

```typescript
// Restore staff session from Supabase (if previously logged in)
try {
  const { restoreSession } = await import('$lib/modules/auth/service');
  const { setCurrentStaff } = await import('$lib/modules/auth/stores.svelte');
  const session = await restoreSession();
  if (session) {
    setCurrentStaff(session.staff);
  }
} catch {
  // Supabase not configured or session expired — continue as guest
}

// Init sync manager for offline queue
try {
  const { initSyncManager } = await import('$lib/modules/sync/manager');
  initSyncManager();
} catch {}
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/staff/ src/routes/+layout.svelte
git commit -m "feat: add staff route guard and auth session restore"
```

---

## Task 9: Conditional BottomNav

**Files:**
- Modify: `src/lib/components/BottomNav.svelte`

- [ ] **Step 1: Update BottomNav to show different tabs based on role**

Replace the `tabs` derived in `src/lib/components/BottomNav.svelte`:

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/state';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { getBooks } from '$lib/services/books';
  import { q } from '$lib/db';
  import { isStaff, isOwner } from '$lib/modules/auth/stores.svelte';

  let bookCount = $state(0);
  let unsubBooks: (() => void) | null = null;

  onMount(() => {
    bookCount = getBooks().length;
    unsubBooks = q.observe('books', () => {
      bookCount = getBooks().length;
    });
  });

  onDestroy(() => {
    unsubBooks?.();
  });

  // SVG icons
  const icons = {
    book: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>`,
    heart: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
    grid: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>`,
    list: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 6H3"/><path d="M21 12H8"/><path d="M21 18H8"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>`,
    chart: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>`,
    pos: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01"/><path d="M10 8h.01"/><path d="M14 8h.01"/><path d="M18 8h.01"/><path d="M6 12h.01"/><path d="M10 12h.01"/><path d="M14 12h.01"/><path d="M18 12h.01"/><path d="M6 16h12"/></svg>`,
    inventory: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`,
  };

  // Guest tabs (browse-only)
  const guestTabs = $derived([
    { href: `${base}/`, label: t('nav.library'), icon: icons.book },
    { href: `${base}/mine`, label: t('nav.mine'), icon: icons.heart },
    { href: `${base}/browse`, label: t('nav.browse'), icon: icons.grid },
    { href: `${base}/shelves`, label: t('nav.shelves'), icon: icons.list },
    { href: `${base}/stats`, label: t('nav.stats'), icon: icons.chart },
  ]);

  // Staff tabs
  const staffTabs = $derived([
    { href: `${base}/`, label: t('nav.library'), icon: icons.book },
    { href: `${base}/staff/pos`, label: t('nav.pos'), icon: icons.pos },
    { href: `${base}/staff/inventory`, label: t('nav.inventory'), icon: icons.inventory },
    { href: `${base}/browse`, label: t('nav.browse'), icon: icons.grid },
    { href: `${base}/stats`, label: t('nav.stats'), icon: icons.chart },
  ]);

  let tabs = $derived(isStaff() ? staffTabs : guestTabs);

  function isActive(href: string) {
    const path = href.replace(base, '') || '/';
    if (path === '/') return page.url.pathname === `${base}/`;
    return page.url.pathname.startsWith(href);
  }
</script>
```

Keep the existing `<nav>` template and `<style>` block unchanged.

- [ ] **Step 2: Test manually**

- Without login: should see guest tabs (Library, Mine, Browse, Shelves, Stats)
- After staff login: should see staff tabs (Library, POS, Inventory, Browse, Stats)

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/BottomNav.svelte
git commit -m "feat: conditional BottomNav — guest vs staff tabs"
```

---

## Task 10: POS Page

**Files:**
- Create: `src/routes/staff/pos/+page.svelte`

- [ ] **Step 1: Create POS page**

Create `src/routes/staff/pos/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/index.svelte';
  import { searchBooks, getBookById } from '$lib/services/books';
  import BarcodeScanner from '$lib/components/BarcodeScanner.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import { showConfirm } from '$lib/stores/dialog.svelte';
  import { getCurrentStaff } from '$lib/modules/auth/stores.svelte';
  import { getInventoryByBookId } from '$lib/modules/inventory/service';
  import { addToCart, removeFromCart, updateQuantity, clearCart } from '$lib/modules/pos/cart';
  import { getCart, setCart, resetCart } from '$lib/modules/pos/stores.svelte';
  import { checkout } from '$lib/modules/pos/checkout';
  import type { Book } from '$lib/db';

  let searchQuery = $state('');
  let searchResults = $state<Book[]>([]);
  let showScanner = $state(false);
  let processing = $state(false);
  let cart = $derived(getCart());
  let staff = $derived(getCurrentStaff());

  let searchTimeout: ReturnType<typeof setTimeout>;

  function handleSearch() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchResults = searchQuery.length >= 2
        ? searchBooks(searchQuery).slice(0, 20)
        : [];
    }, 300);
  }

  async function handleBarcodeDetected(code: string) {
    showScanner = false;
    searchQuery = code;
    searchResults = searchBooks(code);

    if (searchResults.length === 1) {
      await addBookToCart(searchResults[0]);
    }
  }

  async function addBookToCart(book: Book) {
    if (!staff) return;

    const inventory = await getInventoryByBookId(book.id, staff.outlet_id);
    if (!inventory) {
      showToast('Book not in inventory', 'error');
      return;
    }
    if (inventory.type === 'read_in_store') {
      showToast('This book is for reading in store only', 'error');
      return;
    }
    if (inventory.stock <= 0) {
      showToast('Out of stock', 'error');
      return;
    }

    setCart(addToCart(cart, inventory, book));
    searchQuery = '';
    searchResults = [];
    showToast(`${book.title} added`, 'success');
  }

  function handleRemove(inventoryId: string) {
    setCart(removeFromCart(cart, inventoryId));
  }

  function handleQuantityChange(inventoryId: string, qty: number) {
    setCart(updateQuantity(cart, inventoryId, qty));
  }

  async function handleCheckout() {
    if (!staff || cart.items.length === 0 || processing) return;

    const confirmed = await showConfirm({
      title: `${t('pos.pay_cash')} — Rp ${cart.total.toLocaleString('id-ID')}`,
      message: `${cart.items.length} item(s)`,
    });

    if (!confirmed) return;

    processing = true;
    try {
      const result = await checkout({
        cart,
        paymentMethod: 'cash',
        staffId: staff.id,
        outletId: staff.outlet_id,
      });

      if (result.synced) {
        showToast(t('pos.checkout_success'), 'success');
      } else {
        showToast(t('pos.checkout_offline'), 'info');
      }

      resetCart();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Checkout failed', 'error');
    } finally {
      processing = false;
    }
  }

  function formatPrice(amount: number): string {
    return `Rp ${amount.toLocaleString('id-ID')}`;
  }
</script>

<div class="space-y-4">
  <!-- Search Bar -->
  <div class="flex gap-2">
    <div class="flex-1 relative">
      <input
        type="text"
        bind:value={searchQuery}
        oninput={handleSearch}
        placeholder={t('pos.search')}
        class="w-full pl-10 pr-4 py-3 rounded-xl bg-surface border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
      />
      <svg class="absolute left-3 top-3.5 text-ink-muted" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
    </div>
    <button
      class="px-4 py-3 rounded-xl bg-accent text-cream text-sm font-medium"
      onclick={() => showScanner = !showScanner}
    >
      {t('pos.scan')}
    </button>
  </div>

  <!-- Barcode Scanner -->
  {#if showScanner}
    <div class="rounded-xl overflow-hidden border border-warm-100">
      <BarcodeScanner onDetected={handleBarcodeDetected} />
    </div>
  {/if}

  <!-- Search Results -->
  {#if searchResults.length > 0}
    <div class="bg-surface rounded-xl border border-warm-100 divide-y divide-warm-50 max-h-60 overflow-y-auto">
      {#each searchResults as book}
        <button
          class="w-full px-4 py-3 text-left hover:bg-warm-50 transition-colors flex justify-between items-center"
          onclick={() => addBookToCart(book)}
        >
          <div>
            <p class="text-sm font-medium text-ink">{book.title}</p>
            <p class="text-xs text-ink-muted">{book.authors.join(', ')}</p>
          </div>
          <span class="text-accent text-lg">+</span>
        </button>
      {/each}
    </div>
  {/if}

  <!-- Cart -->
  <div class="bg-surface rounded-xl border border-warm-100">
    <div class="px-4 py-3 border-b border-warm-50">
      <h2 class="text-sm font-semibold text-ink uppercase tracking-wide">{t('pos.cart')}</h2>
    </div>

    {#if cart.items.length === 0}
      <div class="px-4 py-8 text-center text-sm text-ink-muted">
        {t('pos.cart_empty')}
      </div>
    {:else}
      <div class="divide-y divide-warm-50">
        {#each cart.items as item}
          <div class="px-4 py-3 flex items-center gap-3">
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-ink truncate">{item.book.title}</p>
              <p class="text-xs text-ink-muted">{formatPrice(item.unitPrice)}</p>
            </div>
            <div class="flex items-center gap-2">
              <button
                class="w-7 h-7 rounded-lg bg-warm-50 text-ink-muted hover:bg-warm-100 text-sm font-bold"
                onclick={() => handleQuantityChange(item.inventory.id, item.quantity - 1)}
              >-</button>
              <span class="text-sm font-semibold w-6 text-center">{item.quantity}</span>
              <button
                class="w-7 h-7 rounded-lg bg-warm-50 text-ink-muted hover:bg-warm-100 text-sm font-bold"
                onclick={() => handleQuantityChange(item.inventory.id, item.quantity + 1)}
              >+</button>
            </div>
            <p class="text-sm font-semibold text-ink w-24 text-right">{formatPrice(item.total)}</p>
            <button
              class="text-berry/60 hover:text-berry text-sm"
              onclick={() => handleRemove(item.inventory.id)}
            >&#215;</button>
          </div>
        {/each}
      </div>

      <!-- Totals -->
      <div class="px-4 py-3 border-t border-warm-100 space-y-1">
        <div class="flex justify-between text-sm text-ink-muted">
          <span>{t('pos.subtotal')}</span>
          <span>{formatPrice(cart.subtotal)}</span>
        </div>
        {#if cart.tax > 0}
          <div class="flex justify-between text-sm text-ink-muted">
            <span>{t('pos.tax', { rate: String(cart.taxRate) })}</span>
            <span>{formatPrice(cart.tax)}</span>
          </div>
        {/if}
        <div class="flex justify-between text-base font-bold text-ink pt-1">
          <span>{t('pos.total')}</span>
          <span>{formatPrice(cart.total)}</span>
        </div>
      </div>

      <!-- Checkout Button -->
      <div class="px-4 py-3 border-t border-warm-100">
        <button
          class="w-full py-3 rounded-xl bg-accent text-cream font-semibold text-sm hover:bg-accent/90 transition-colors disabled:opacity-50"
          onclick={handleCheckout}
          disabled={processing}
        >
          {processing ? '...' : `${t('pos.pay_cash')} — ${formatPrice(cart.total)}`}
        </button>
      </div>
    {/if}
  </div>
</div>
```

- [ ] **Step 2: Test manually**

Navigate to `/staff/pos` (after login). Verify:
- Search shows results from Yjs catalog
- Barcode scanner opens/closes
- Cart add/remove/quantity works
- Totals calculate correctly
- Checkout button shows confirm dialog

- [ ] **Step 3: Commit**

```bash
git add src/routes/staff/pos/
git commit -m "feat: add POS page — search, scan, cart, cash checkout"
```

---

## Task 11: Inventory Management Pages

**Files:**
- Create: `src/routes/staff/inventory/+page.svelte`
- Create: `src/routes/staff/inventory/[id]/+page.svelte`

- [ ] **Step 1: Create inventory list page**

Create `src/routes/staff/inventory/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { getCurrentStaff } from '$lib/modules/auth/stores.svelte';
  import { getInventoryByOutlet } from '$lib/modules/inventory/service';
  import { enrichInventory, type EnrichedInventory } from '$lib/modules/inventory/bridge';

  let items = $state<EnrichedInventory[]>([]);
  let loading = $state(true);
  let filter = $state<'all' | 'low_stock' | 'out_of_stock'>('all');
  let staff = $derived(getCurrentStaff());

  onMount(async () => {
    if (!staff) return;
    try {
      const raw = await getInventoryByOutlet(staff.outlet_id);
      items = enrichInventory(raw);
    } catch (err) {
      console.error('Failed to load inventory:', err);
    } finally {
      loading = false;
    }
  });

  let filtered = $derived(
    filter === 'all' ? items
    : filter === 'low_stock' ? items.filter(i => i.stock > 0 && i.stock <= i.min_stock)
    : items.filter(i => i.stock <= 0)
  );

  function stockBadge(item: EnrichedInventory): { label: string; class: string } {
    if (item.stock <= 0) return { label: t('inventory.out_of_stock'), class: 'bg-berry/10 text-berry' };
    if (item.stock <= item.min_stock) return { label: t('inventory.low_stock'), class: 'bg-gold/10 text-gold' };
    return { label: t('inventory.in_stock'), class: 'bg-sage/10 text-sage' };
  }

  function formatPrice(amount: number | null): string {
    if (amount === null) return '-';
    return `Rp ${amount.toLocaleString('id-ID')}`;
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h1 class="font-display text-xl font-bold text-ink">{t('inventory.title')}</h1>
    <a
      href="{base}/add"
      class="px-4 py-2 rounded-xl bg-accent text-cream text-sm font-medium"
    >
      + {t('inventory.add')}
    </a>
  </div>

  <!-- Filter -->
  <div class="flex gap-2">
    {#each ['all', 'low_stock', 'out_of_stock'] as f}
      <button
        class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors {filter === f ? 'bg-accent text-cream' : 'bg-surface text-ink-muted border border-warm-100'}"
        onclick={() => filter = f as any}
      >
        {f === 'all' ? 'All' : f === 'low_stock' ? t('inventory.low_stock') : t('inventory.out_of_stock')}
        {#if f === 'low_stock'}
          ({items.filter(i => i.stock > 0 && i.stock <= i.min_stock).length})
        {:else if f === 'out_of_stock'}
          ({items.filter(i => i.stock <= 0).length})
        {/if}
      </button>
    {/each}
  </div>

  <!-- List -->
  {#if loading}
    <div class="py-8 text-center text-sm text-ink-muted">Loading...</div>
  {:else if filtered.length === 0}
    <div class="py-8 text-center text-sm text-ink-muted">No items</div>
  {:else}
    <div class="space-y-2">
      {#each filtered as item}
        <a
          href="{base}/staff/inventory/{item.id}"
          class="block bg-surface rounded-xl border border-warm-100 px-4 py-3 hover:border-accent/30 transition-colors"
        >
          <div class="flex items-center gap-3">
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-ink truncate">
                {item.book?.title ?? `Book: ${item.book_id.slice(0, 8)}...`}
              </p>
              <p class="text-xs text-ink-muted">
                {item.book?.authors?.join(', ') ?? ''}
                {item.is_preloved ? ' · Preloved' : ''}
              </p>
            </div>
            <div class="text-right">
              <p class="text-sm font-semibold text-ink">{formatPrice(item.price)}</p>
              <div class="flex items-center gap-2 mt-0.5">
                <span class="text-xs text-ink-muted">{t('inventory.stock')}: {item.stock}</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded-full font-medium {stockBadge(item).class}">
                  {stockBadge(item).label}
                </span>
              </div>
            </div>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
```

- [ ] **Step 2: Create inventory detail page**

Create `src/routes/staff/inventory/[id]/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import { showPrompt, showConfirm } from '$lib/stores/dialog.svelte';
  import { getCurrentStaff } from '$lib/modules/auth/stores.svelte';
  import { updateInventoryItem, adjustStock, getStockMovements } from '$lib/modules/inventory/service';
  import { getBookById } from '$lib/services/books';
  import { getSupabase } from '$lib/supabase/client';
  import type { Inventory } from '$lib/modules/inventory/types';
  import type { Book } from '$lib/db';

  let item = $state<Inventory | null>(null);
  let book = $state<Book | null>(null);
  let movements = $state<any[]>([]);
  let loading = $state(true);
  let staff = $derived(getCurrentStaff());

  const inventoryId = page.params.id;

  onMount(async () => {
    try {
      const supabase = getSupabase();
      const { data } = await supabase
        .from('inventory')
        .select()
        .eq('id', inventoryId)
        .single();

      if (data) {
        item = data as Inventory;
        book = getBookById(item.book_id) ?? null;
        movements = await getStockMovements(inventoryId);
      }
    } finally {
      loading = false;
    }
  });

  async function handleAdjustStock() {
    if (!item || !staff) return;

    const input = await showPrompt({
      title: t('inventory.adjust_stock'),
      message: 'Enter quantity (+/- number)',
      placeholder: 'e.g. +5 or -2',
    });

    if (!input) return;

    const qty = parseInt(input, 10);
    if (isNaN(qty) || qty === 0) {
      showToast('Invalid quantity', 'error');
      return;
    }

    try {
      await adjustStock(
        item.id,
        qty,
        'adjustment',
        staff.id,
        `Manual adjustment: ${qty > 0 ? '+' : ''}${qty}`
      );

      // Refresh
      item = { ...item, stock: item.stock + qty };
      movements = await getStockMovements(inventoryId);
      showToast('Stock adjusted', 'success');
    } catch (err) {
      showToast('Failed to adjust stock', 'error');
    }
  }

  function formatPrice(amount: number | null): string {
    if (amount === null) return '-';
    return `Rp ${amount.toLocaleString('id-ID')}`;
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }
</script>

{#if loading}
  <div class="py-8 text-center text-sm text-ink-muted">Loading...</div>
{:else if !item}
  <div class="py-8 text-center text-sm text-ink-muted">Item not found</div>
{:else}
  <div class="space-y-4">
    <button class="text-sm text-ink-muted hover:text-accent" onclick={() => goto(`${base}/staff/inventory`)}>
      &larr; Back
    </button>

    <!-- Book Info -->
    <div class="bg-surface rounded-xl border border-warm-100 p-4">
      <h1 class="font-display text-lg font-bold text-ink">{book?.title ?? 'Unknown Book'}</h1>
      <p class="text-sm text-ink-muted">{book?.authors?.join(', ') ?? ''}</p>
      {#if book?.isbn}
        <p class="text-xs text-ink-muted mt-1">ISBN: {book.isbn}</p>
      {/if}
    </div>

    <!-- Inventory Details -->
    <div class="bg-surface rounded-xl border border-warm-100 p-4 space-y-3">
      <div class="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span class="text-xs text-ink-muted uppercase">{t('inventory.price')}</span>
          <p class="font-semibold text-ink">{formatPrice(item.price)}</p>
        </div>
        <div>
          <span class="text-xs text-ink-muted uppercase">{t('inventory.cost_price')}</span>
          <p class="font-semibold text-ink">{formatPrice(item.cost_price)}</p>
        </div>
        <div>
          <span class="text-xs text-ink-muted uppercase">{t('inventory.stock')}</span>
          <p class="font-semibold text-ink">{item.stock}</p>
        </div>
        <div>
          <span class="text-xs text-ink-muted uppercase">{t('inventory.location')}</span>
          <p class="font-semibold text-ink">{item.location ?? '-'}</p>
        </div>
        <div>
          <span class="text-xs text-ink-muted uppercase">{t('inventory.type')}</span>
          <p class="font-semibold text-ink">
            {item.type === 'for_sale' ? t('inventory.type_sale')
              : item.type === 'read_in_store' ? t('inventory.type_read')
              : t('inventory.type_both')}
          </p>
        </div>
        <div>
          <span class="text-xs text-ink-muted uppercase">{t('inventory.condition')}</span>
          <p class="font-semibold text-ink">
            {item.condition === 'new' ? t('inventory.condition_new')
              : item.condition === 'good' ? t('inventory.condition_good')
              : t('inventory.condition_fair')}
            {item.is_preloved ? ` · ${t('inventory.preloved')}` : ''}
          </p>
        </div>
      </div>

      <button
        class="w-full py-2.5 rounded-xl bg-accent/10 text-accent font-medium text-sm hover:bg-accent/20 transition-colors"
        onclick={handleAdjustStock}
      >
        {t('inventory.adjust_stock')}
      </button>
    </div>

    <!-- Stock Movement History -->
    <div class="bg-surface rounded-xl border border-warm-100">
      <div class="px-4 py-3 border-b border-warm-50">
        <h2 class="text-sm font-semibold text-ink uppercase tracking-wide">{t('inventory.movement_history')}</h2>
      </div>
      {#if movements.length === 0}
        <div class="px-4 py-6 text-center text-sm text-ink-muted">No movements yet</div>
      {:else}
        <div class="divide-y divide-warm-50 max-h-80 overflow-y-auto">
          {#each movements as m}
            <div class="px-4 py-2.5 flex items-center justify-between">
              <div>
                <p class="text-xs font-medium text-ink">{m.type.replace(/_/g, ' ')}</p>
                {#if m.reason}
                  <p class="text-[11px] text-ink-muted">{m.reason}</p>
                {/if}
              </div>
              <div class="text-right">
                <p class="text-sm font-semibold {m.quantity > 0 ? 'text-sage' : 'text-berry'}">
                  {m.quantity > 0 ? '+' : ''}{m.quantity}
                </p>
                <p class="text-[10px] text-ink-muted">{formatDate(m.created_at)}</p>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}
```

- [ ] **Step 3: Test manually**

Navigate to `/staff/inventory`. Verify:
- Inventory list loads from Supabase
- Books are enriched with Yjs metadata (title, authors)
- Filter buttons work (all, low stock, out of stock)
- Clicking an item navigates to detail page
- Stock adjust dialog works

- [ ] **Step 4: Commit**

```bash
git add src/routes/staff/inventory/
git commit -m "feat: add inventory management pages — list, detail, stock adjust"
```

---

## Task 12: Integration Test & Final Wiring

**Files:**
- Modify: `src/lib/components/TopBar.svelte` (show staff name + offline indicator)
- Create: `.gitignore` entries for `.superpowers/` and `.env`

- [ ] **Step 1: Update TopBar with staff info and offline status**

Add to TopBar.svelte — show current staff name and role badge when logged in, and offline queue indicator:

After existing imports, add:

```typescript
import { getCurrentStaff, isStaff } from '$lib/modules/auth/stores.svelte';
import { getIsOnline } from '$lib/modules/sync/manager';
```

Add to the topbar display area (next to the existing profile button), a staff badge:

```svelte
{#if isStaff()}
  <span class="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full font-medium">
    {getCurrentStaff()?.name} · {getCurrentStaff()?.role}
  </span>
{/if}
{#if !getIsOnline()}
  <span class="text-xs bg-berry/10 text-berry px-2 py-0.5 rounded-full font-medium">
    Offline
  </span>
{/if}
```

- [ ] **Step 2: Add `.superpowers/` to `.gitignore`**

```bash
echo ".superpowers/" >> .gitignore
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
```

- [ ] **Step 3: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass (existing + new).

- [ ] **Step 4: Run dev server and smoke test**

```bash
npm run dev
```

Before testing, create a test staff account:
1. In Supabase Dashboard → Authentication → Users → Add User: email `owner@test.com`, password `1234`
2. Copy the user's UUID
3. In SQL Editor, run:
```sql
INSERT INTO staff (id, name, email, role, pin_hash, outlet_id)
VALUES ('<uuid-from-step-2>', 'Test Owner', 'owner@test.com', 'owner', '', (SELECT id FROM outlet LIMIT 1));
```

Manual smoke test checklist:
- [ ] App loads, guest mode shows existing catalog (unchanged)
- [ ] Navigate to `/login`, enter credentials
- [ ] After login, BottomNav shows POS + Inventory tabs
- [ ] POS: search a book, add to cart, adjust quantity, checkout cash
- [ ] Inventory: list loads, filter works, detail page shows stock history
- [ ] Go offline (DevTools Network → Offline), make a cash sale → queued
- [ ] Go online → queue processes
- [ ] Existing features still work: browse, search, shelves, stats, barcode scan

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete Phase 1 MVP — auth, inventory, POS, offline queue"
```

---

## Summary

| Task | What it builds | Tests |
|------|----------------|-------|
| 1 | Supabase DB schema + client | Migration + types |
| 2 | Auth module (PIN login, roles, guard) | 3 unit tests |
| 3 | Inventory module (CRUD, stock, bridge) | 2 unit tests |
| 4 | Offline queue (IndexedDB) | 5 unit tests |
| 5 | POS cart + checkout | 6 unit tests |
| 6 | i18n strings | — |
| 7 | Login page | Manual |
| 8 | Staff layout + auth restore | Manual |
| 9 | Conditional BottomNav | Manual |
| 10 | POS page | Manual |
| 11 | Inventory pages | Manual |
| 12 | TopBar updates + integration test | Full smoke test |

**Total: 12 tasks, ~16 unit tests, 1 integration smoke test**

After Phase 1 is complete, create plan for Phase 2 (Midtrans integration, digital receipts, dashboard, pelanggan browse).
