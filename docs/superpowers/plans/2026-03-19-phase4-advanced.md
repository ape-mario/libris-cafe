# Phase 4: Advanced Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add lending/read-in-store tracking, kiosk mode for cafe tablets, thermal printer receipts, advanced report exports (CSV/PDF/Excel), and a demand prediction engine to Libris Cafe.

**Architecture:** Lending uses a new `reading_session` table (FK to inventory) with two levels: semi-formal (staff logs check-in/out) and formal (deposit, duration, notification). Kiosk mode is a PWA fullscreen locked to guest browse with auto-reset idle timer. Thermal printing uses an abstract `PrinterProvider` with ESC/POS commands over Web Bluetooth or Web USB. Report export generates CSV client-side, PDF and Excel via Supabase Edge Functions. Prediction engine computes moving-average sales velocity and days-until-stockout for restock scoring.

**Tech Stack:** SvelteKit 2 + Svelte 5, Tailwind CSS v4, Supabase (Postgres + Edge Functions + Realtime), Yjs (catalog), jsPDF (PDF generation), ExcelJS (Excel generation), Web Bluetooth API / Web USB API (thermal printer), Vitest for testing.

**Spec Reference:** `docs/superpowers/specs/2026-03-19-libris-cafe-design.md`

---

## File Structure

### New Files

```
src/lib/
├── modules/
│   ├── lending/
│   │   ├── types.ts                    # ReadingSession, LendingLevel, DepositInfo types
│   │   ├── service.ts                  # Check-in, check-out, deposit, overdue logic
│   │   ├── service.test.ts             # Lending service tests
│   │   └── stores.svelte.ts            # Active sessions, overdue alerts
│   │
│   ├── kiosk/
│   │   ├── types.ts                    # KioskConfig, KioskState types
│   │   ├── idle-timer.ts               # Idle detection + auto-reset logic
│   │   ├── idle-timer.test.ts          # Idle timer tests
│   │   └── stores.svelte.ts            # Kiosk mode state, idle countdown
│   │
│   ├── printer/
│   │   ├── types.ts                    # PrinterProvider interface, ESC/POS types
│   │   ├── escpos.ts                   # ESC/POS command builder (receipt format)
│   │   ├── escpos.test.ts              # ESC/POS builder tests
│   │   ├── bluetooth-provider.ts       # Web Bluetooth printer provider
│   │   ├── usb-provider.ts             # Web USB printer provider
│   │   ├── service.ts                  # Printer manager (connect, print, disconnect)
│   │   └── stores.svelte.ts            # Printer connection state
│   │
│   ├── reports/
│   │   ├── types.ts                    # ReportConfig, ExportFormat, ReportData types
│   │   ├── csv-export.ts               # Client-side CSV generation
│   │   ├── csv-export.test.ts          # CSV export tests
│   │   ├── service.ts                  # Report orchestration (fetch data, trigger export)
│   │   └── stores.svelte.ts            # Export progress state
│   │
│   └── prediction/
│       ├── types.ts                    # SalesVelocity, StockoutPrediction, RestockScore
│       ├── engine.ts                   # Moving average, days_until_stockout, scoring
│       ├── engine.test.ts              # Prediction engine tests
│       └── stores.svelte.ts            # Prediction results, dashboard data

src/routes/
├── staff/
│   ├── lending/
│   │   └── +page.svelte               # Lending dashboard (active sessions, check-in/out)
│   └── reports/
│       └── +page.svelte               # Advanced reports with export buttons
├── owner/
│   └── prediction/
│       └── +page.svelte               # Demand forecast + restock scoring dashboard
├── kiosk/
│   ├── +layout.svelte                 # Kiosk layout (fullscreen, no nav, idle timer)
│   └── +page.svelte                   # Kiosk browse (catalog only, auto-reset)

src/lib/components/
├── lending/
│   ├── CheckInDialog.svelte            # Check-in form (book scan/search, level selection)
│   ├── CheckOutDialog.svelte           # Check-out form (return book, deposit refund)
│   ├── SessionCard.svelte              # Active session card (timer, book info)
│   └── OverdueAlert.svelte             # Overdue session alert banner
├── printer/
│   ├── PrinterSetup.svelte             # Printer pairing/connection UI
│   └── PrintButton.svelte              # Print receipt button (used on POS checkout)
├── reports/
│   ├── ReportBuilder.svelte            # Report config form (date range, type, format)
│   └── ExportButton.svelte             # Export trigger with progress indicator
├── prediction/
│   ├── StockoutChart.svelte            # Days-until-stockout chart per book
│   ├── RestockTable.svelte             # Restock recommendations table
│   └── VelocityBadge.svelte            # Sales velocity indicator badge
└── kiosk/
    ├── KioskHeader.svelte              # Cafe branding header for kiosk
    ├── IdleOverlay.svelte              # "Touch to browse" overlay on idle reset
    └── QrBookCard.svelte               # Book card with optional QR code

supabase/
├── migrations/
│   └── 00004_phase4_advanced.sql       # reading_session table, prediction views
└── functions/
    ├── export-pdf/
    │   └── index.ts                    # Edge Function: generate PDF report
    └── export-excel/
        └── index.ts                    # Edge Function: generate Excel report
```

### Modified Files

```
src/lib/i18n/en.ts                       # Add lending, kiosk, printer, reports, prediction strings
src/lib/i18n/id.ts                       # Add lending, kiosk, printer, reports, prediction strings
src/lib/components/BottomNav.svelte      # Add Lending tab for staff, hide in kiosk mode
src/lib/components/TopBar.svelte         # Add printer status icon, kiosk mode indicator
src/lib/modules/pos/checkout.ts          # Hook thermal printer after successful checkout
src/lib/modules/notification/service.ts  # Add overdue session + stockout prediction alerts
src/routes/staff/+layout.svelte          # Add lending + reports links to staff nav
src/routes/owner/+layout.svelte          # Add prediction link to owner nav
```

---

## Task 1: Database Migration — Reading Sessions & Prediction Views

**Files:**
- Create: `supabase/migrations/00004_phase4_advanced.sql`

- [ ] **Step 1: Create the reading_session table**

```sql
-- supabase/migrations/00004_phase4_advanced.sql

-- Phase 4: Advanced Features — Lending & Prediction

-- Reading Session (lending / read-in-store tracking)
CREATE TABLE reading_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id uuid NOT NULL REFERENCES inventory(id),
  book_id text NOT NULL,
  outlet_id uuid NOT NULL REFERENCES outlet(id),
  staff_id uuid NOT NULL REFERENCES staff(id),

  -- Session lifecycle
  status text NOT NULL CHECK (status IN ('active', 'returned', 'overdue')) DEFAULT 'active',
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  expected_return_at timestamptz,       -- NULL for semi-formal (level B)
  checked_out_at timestamptz,           -- NULL until returned
  checked_out_by uuid REFERENCES staff(id),

  -- Lending level
  level text NOT NULL CHECK (level IN ('semi_formal', 'formal')) DEFAULT 'semi_formal',

  -- Formal lending fields (level C)
  customer_name text,
  customer_contact text,
  deposit_amount decimal(12,2) DEFAULT 0,
  deposit_status text CHECK (deposit_status IN ('held', 'refunded', 'forfeited')),
  deposit_refunded_at timestamptz,

  -- Metadata
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_reading_session_outlet ON reading_session(outlet_id);
CREATE INDEX idx_reading_session_status ON reading_session(status);
CREATE INDEX idx_reading_session_inventory ON reading_session(inventory_id);
CREATE INDEX idx_reading_session_active ON reading_session(outlet_id, status) WHERE status = 'active';
```

- [ ] **Step 2: Create trigger for overdue detection**

```sql
-- Auto-mark sessions as overdue when expected_return_at has passed
-- This runs via a pg_cron job or can be called manually via RPC
CREATE OR REPLACE FUNCTION mark_overdue_sessions()
RETURNS integer AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE reading_session
  SET status = 'overdue',
      updated_at = now()
  WHERE status = 'active'
    AND expected_return_at IS NOT NULL
    AND expected_return_at < now();

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Auto-update updated_at on reading_session changes
CREATE OR REPLACE FUNCTION update_reading_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reading_session_timestamp
  BEFORE UPDATE ON reading_session
  FOR EACH ROW EXECUTE FUNCTION update_reading_session_timestamp();
```

- [ ] **Step 3: Create materialized view for sales velocity (prediction engine)**

```sql
-- Sales velocity: rolling 30-day average sales per inventory item
CREATE MATERIALIZED VIEW mv_sales_velocity AS
SELECT
  i.id AS inventory_id,
  i.book_id,
  i.outlet_id,
  i.stock AS current_stock,
  i.min_stock,
  COALESCE(
    SUM(CASE
      WHEN sm.type = 'sale_out' AND sm.created_at >= now() - interval '30 days'
      THEN ABS(sm.quantity)
      ELSE 0
    END), 0
  ) AS units_sold_30d,
  COALESCE(
    SUM(CASE
      WHEN sm.type = 'sale_out' AND sm.created_at >= now() - interval '7 days'
      THEN ABS(sm.quantity)
      ELSE 0
    END), 0
  ) AS units_sold_7d,
  CASE
    WHEN SUM(CASE
      WHEN sm.type = 'sale_out' AND sm.created_at >= now() - interval '30 days'
      THEN ABS(sm.quantity) ELSE 0
    END) > 0
    THEN ROUND(
      i.stock::decimal / (
        SUM(CASE
          WHEN sm.type = 'sale_out' AND sm.created_at >= now() - interval '30 days'
          THEN ABS(sm.quantity) ELSE 0
        END)::decimal / 30.0
      ), 1
    )
    ELSE NULL  -- No sales → cannot predict
  END AS days_until_stockout,
  ROUND(
    COALESCE(
      SUM(CASE
        WHEN sm.type = 'sale_out' AND sm.created_at >= now() - interval '30 days'
        THEN ABS(sm.quantity) ELSE 0
      END)::decimal / 30.0
    , 0), 2
  ) AS avg_daily_sales
FROM inventory i
LEFT JOIN stock_movement sm ON sm.inventory_id = i.id
GROUP BY i.id, i.book_id, i.outlet_id, i.stock, i.min_stock;

CREATE UNIQUE INDEX idx_mv_sales_velocity_inventory ON mv_sales_velocity(inventory_id);

-- RPC to refresh the materialized view (called by cron or on-demand)
CREATE OR REPLACE FUNCTION refresh_sales_velocity()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_sales_velocity;
END;
$$ LANGUAGE plpgsql;
```

- [ ] **Step 4: Create RPC function for restock recommendations**

```sql
-- Restock scoring RPC
-- Returns inventory items sorted by urgency (highest score first)
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
$$ LANGUAGE plpgsql;
```

- [ ] **Step 5: Add RLS policies for reading_session**

```sql
-- RLS for reading_session
ALTER TABLE reading_session ENABLE ROW LEVEL SECURITY;

-- Staff can view sessions for their outlet
CREATE POLICY "Staff can view outlet sessions"
  ON reading_session FOR SELECT
  USING (
    outlet_id IN (
      SELECT s.outlet_id FROM staff s
      WHERE s.id = auth.uid() AND s.is_active = true
    )
  );

-- Staff can insert sessions for their outlet
CREATE POLICY "Staff can create sessions"
  ON reading_session FOR INSERT
  WITH CHECK (
    outlet_id IN (
      SELECT s.outlet_id FROM staff s
      WHERE s.id = auth.uid() AND s.is_active = true
    )
  );

-- Staff can update sessions for their outlet
CREATE POLICY "Staff can update sessions"
  ON reading_session FOR UPDATE
  USING (
    outlet_id IN (
      SELECT s.outlet_id FROM staff s
      WHERE s.id = auth.uid() AND s.is_active = true
    )
  );

-- Only owner can delete sessions
CREATE POLICY "Owner can delete sessions"
  ON reading_session FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM staff s
      WHERE s.id = auth.uid() AND s.role = 'owner' AND s.is_active = true
    )
  );
```

- [ ] **Step 6: Apply migration**

```bash
npx supabase db push
```

Verify in Supabase Dashboard: `reading_session` table exists, `mv_sales_velocity` view exists, `get_restock_recommendations` RPC is callable.

---

## Task 2: Lending Module — Types, Service & Tests

**Files:**
- Create: `src/lib/modules/lending/types.ts`
- Create: `src/lib/modules/lending/service.ts`
- Create: `src/lib/modules/lending/service.test.ts`
- Create: `src/lib/modules/lending/stores.svelte.ts`

- [ ] **Step 1: Define lending types**

Create `src/lib/modules/lending/types.ts`:

```typescript
export type LendingLevel = 'semi_formal' | 'formal';

export type SessionStatus = 'active' | 'returned' | 'overdue';

export type DepositStatus = 'held' | 'refunded' | 'forfeited';

export interface ReadingSession {
  id: string;
  inventory_id: string;
  book_id: string;
  outlet_id: string;
  staff_id: string;
  status: SessionStatus;
  checked_in_at: string;
  expected_return_at: string | null;
  checked_out_at: string | null;
  checked_out_by: string | null;
  level: LendingLevel;
  customer_name: string | null;
  customer_contact: string | null;
  deposit_amount: number;
  deposit_status: DepositStatus | null;
  deposit_refunded_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CheckInParams {
  inventory_id: string;
  book_id: string;
  outlet_id: string;
  staff_id: string;
  level: LendingLevel;
  /** Duration in minutes for formal lending. Null for semi-formal. */
  duration_minutes?: number;
  customer_name?: string;
  customer_contact?: string;
  deposit_amount?: number;
  notes?: string;
}

export interface CheckOutParams {
  session_id: string;
  staff_id: string;
  refund_deposit: boolean;
  notes?: string;
}

export interface SessionWithBook extends ReadingSession {
  /** Denormalized book title from Yjs for display */
  book_title?: string;
  /** Denormalized book cover URL from Yjs */
  book_cover_url?: string;
}

export interface LendingStats {
  active_count: number;
  overdue_count: number;
  today_checkins: number;
  today_checkouts: number;
  avg_duration_minutes: number;
}
```

- [ ] **Step 2: Implement lending service**

Create `src/lib/modules/lending/service.ts`:

```typescript
import { getSupabase } from '$lib/supabase/client';
import type {
  ReadingSession,
  CheckInParams,
  CheckOutParams,
  LendingStats,
  SessionStatus,
} from './types';

/**
 * Check in a book for read-in-store.
 * Semi-formal: staff logs it, no deposit or timer.
 * Formal: customer info, deposit, timed return.
 */
export async function checkIn(params: CheckInParams): Promise<ReadingSession> {
  const supabase = getSupabase();

  const expected_return_at =
    params.level === 'formal' && params.duration_minutes
      ? new Date(Date.now() + params.duration_minutes * 60 * 1000).toISOString()
      : null;

  const deposit_status =
    params.level === 'formal' && params.deposit_amount && params.deposit_amount > 0
      ? 'held'
      : null;

  const { data, error } = await supabase
    .from('reading_session')
    .insert({
      inventory_id: params.inventory_id,
      book_id: params.book_id,
      outlet_id: params.outlet_id,
      staff_id: params.staff_id,
      level: params.level,
      status: 'active',
      expected_return_at,
      customer_name: params.customer_name ?? null,
      customer_contact: params.customer_contact ?? null,
      deposit_amount: params.deposit_amount ?? 0,
      deposit_status,
      notes: params.notes ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`Check-in failed: ${error.message}`);
  return data as ReadingSession;
}

/**
 * Check out (return) a book from a reading session.
 */
export async function checkOut(params: CheckOutParams): Promise<ReadingSession> {
  const supabase = getSupabase();

  const updates: Record<string, unknown> = {
    status: 'returned',
    checked_out_at: new Date().toISOString(),
    checked_out_by: params.staff_id,
  };

  if (params.notes) {
    updates.notes = params.notes;
  }

  // Handle deposit refund for formal sessions
  if (params.refund_deposit) {
    updates.deposit_status = 'refunded';
    updates.deposit_refunded_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('reading_session')
    .update(updates)
    .eq('id', params.session_id)
    .select()
    .single();

  if (error) throw new Error(`Check-out failed: ${error.message}`);
  return data as ReadingSession;
}

/**
 * Forfeit deposit for a session (e.g., book damaged or not returned).
 */
export async function forfeitDeposit(sessionId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('reading_session')
    .update({ deposit_status: 'forfeited' })
    .eq('id', sessionId);

  if (error) throw new Error(`Forfeit deposit failed: ${error.message}`);
}

/**
 * Get active reading sessions for an outlet.
 */
export async function getActiveSessions(outletId: string): Promise<ReadingSession[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('reading_session')
    .select()
    .eq('outlet_id', outletId)
    .in('status', ['active', 'overdue'])
    .order('checked_in_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch sessions: ${error.message}`);
  return (data ?? []) as ReadingSession[];
}

/**
 * Get all sessions with optional filters.
 */
export async function getSessions(
  outletId: string,
  options: {
    status?: SessionStatus;
    from?: string;
    to?: string;
    limit?: number;
  } = {}
): Promise<ReadingSession[]> {
  const supabase = getSupabase();
  let query = supabase
    .from('reading_session')
    .select()
    .eq('outlet_id', outletId)
    .order('checked_in_at', { ascending: false });

  if (options.status) {
    query = query.eq('status', options.status);
  }
  if (options.from) {
    query = query.gte('checked_in_at', options.from);
  }
  if (options.to) {
    query = query.lte('checked_in_at', options.to);
  }
  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch sessions: ${error.message}`);
  return (data ?? []) as ReadingSession[];
}

/**
 * Get lending stats for today.
 */
export async function getLendingStats(outletId: string): Promise<LendingStats> {
  const supabase = getSupabase();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Active and overdue counts
  const { count: activeCount } = await supabase
    .from('reading_session')
    .select('*', { count: 'exact', head: true })
    .eq('outlet_id', outletId)
    .eq('status', 'active');

  const { count: overdueCount } = await supabase
    .from('reading_session')
    .select('*', { count: 'exact', head: true })
    .eq('outlet_id', outletId)
    .eq('status', 'overdue');

  // Today's check-ins
  const { count: todayCheckins } = await supabase
    .from('reading_session')
    .select('*', { count: 'exact', head: true })
    .eq('outlet_id', outletId)
    .gte('checked_in_at', todayStart.toISOString());

  // Today's check-outs
  const { count: todayCheckouts } = await supabase
    .from('reading_session')
    .select('*', { count: 'exact', head: true })
    .eq('outlet_id', outletId)
    .eq('status', 'returned')
    .gte('checked_out_at', todayStart.toISOString());

  // Average duration of completed sessions (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: completedSessions } = await supabase
    .from('reading_session')
    .select('checked_in_at, checked_out_at')
    .eq('outlet_id', outletId)
    .eq('status', 'returned')
    .gte('checked_out_at', thirtyDaysAgo)
    .not('checked_out_at', 'is', null);

  let avgDuration = 0;
  if (completedSessions && completedSessions.length > 0) {
    const totalMinutes = completedSessions.reduce((sum, s) => {
      const inTime = new Date(s.checked_in_at).getTime();
      const outTime = new Date(s.checked_out_at!).getTime();
      return sum + (outTime - inTime) / (1000 * 60);
    }, 0);
    avgDuration = Math.round(totalMinutes / completedSessions.length);
  }

  return {
    active_count: activeCount ?? 0,
    overdue_count: overdueCount ?? 0,
    today_checkins: todayCheckins ?? 0,
    today_checkouts: todayCheckouts ?? 0,
    avg_duration_minutes: avgDuration,
  };
}

/**
 * Trigger the server-side overdue detection.
 * Calls the mark_overdue_sessions() RPC function.
 */
export async function triggerOverdueCheck(): Promise<number> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('mark_overdue_sessions');

  if (error) throw new Error(`Overdue check failed: ${error.message}`);
  return data as number;
}

/**
 * Check if a specific inventory item currently has an active session.
 */
export async function hasActiveSession(inventoryId: string): Promise<boolean> {
  const supabase = getSupabase();
  const { count } = await supabase
    .from('reading_session')
    .select('*', { count: 'exact', head: true })
    .eq('inventory_id', inventoryId)
    .in('status', ['active', 'overdue']);

  return (count ?? 0) > 0;
}
```

- [ ] **Step 3: Write lending service tests**

Create `src/lib/modules/lending/service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CheckInParams, CheckOutParams } from './types';

// Mock Supabase
const mockSelect = vi.fn();
const mockSingle = vi.fn();
const mockInsert = vi.fn(() => ({ select: mockSelect }));
const mockUpdate = vi.fn(() => ({ eq: vi.fn(() => ({ select: mockSelect })) }));
const mockEq = vi.fn();
const mockIn = vi.fn();
const mockOrder = vi.fn();
const mockGte = vi.fn();
const mockRpc = vi.fn();

vi.mock('$lib/supabase/client', () => ({
  getSupabase: () => ({
    from: vi.fn((table: string) => ({
      insert: mockInsert,
      update: mockUpdate,
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          in: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
      })),
    })),
    rpc: mockRpc,
  }),
}));

describe('Lending Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should prepare check-in params for semi-formal level', async () => {
    const params: CheckInParams = {
      inventory_id: 'inv-1',
      book_id: 'book-1',
      outlet_id: 'outlet-1',
      staff_id: 'staff-1',
      level: 'semi_formal',
    };

    // Semi-formal: no expected_return_at, no deposit
    expect(params.level).toBe('semi_formal');
    expect(params.duration_minutes).toBeUndefined();
    expect(params.deposit_amount).toBeUndefined();
  });

  it('should prepare check-in params for formal level with deposit and duration', () => {
    const params: CheckInParams = {
      inventory_id: 'inv-1',
      book_id: 'book-1',
      outlet_id: 'outlet-1',
      staff_id: 'staff-1',
      level: 'formal',
      duration_minutes: 120,
      customer_name: 'John Doe',
      customer_contact: '08123456789',
      deposit_amount: 50000,
    };

    expect(params.level).toBe('formal');
    expect(params.duration_minutes).toBe(120);
    expect(params.deposit_amount).toBe(50000);
    expect(params.customer_name).toBe('John Doe');
  });

  it('should prepare check-out params with deposit refund', () => {
    const params: CheckOutParams = {
      session_id: 'session-1',
      staff_id: 'staff-1',
      refund_deposit: true,
      notes: 'Book returned in good condition',
    };

    expect(params.refund_deposit).toBe(true);
    expect(params.notes).toBe('Book returned in good condition');
  });

  it('should calculate expected_return_at for formal sessions', () => {
    const durationMinutes = 120;
    const now = Date.now();
    const expectedReturn = new Date(now + durationMinutes * 60 * 1000);

    // Expected return should be ~2 hours from now
    const diffMs = expectedReturn.getTime() - now;
    const diffMinutes = diffMs / (1000 * 60);
    expect(diffMinutes).toBeCloseTo(120, 0);
  });

  it('should calculate average duration from completed sessions', () => {
    const sessions = [
      {
        checked_in_at: '2026-03-19T10:00:00Z',
        checked_out_at: '2026-03-19T11:30:00Z', // 90 min
      },
      {
        checked_in_at: '2026-03-19T12:00:00Z',
        checked_out_at: '2026-03-19T13:00:00Z', // 60 min
      },
      {
        checked_in_at: '2026-03-19T14:00:00Z',
        checked_out_at: '2026-03-19T16:30:00Z', // 150 min
      },
    ];

    const totalMinutes = sessions.reduce((sum, s) => {
      const inTime = new Date(s.checked_in_at).getTime();
      const outTime = new Date(s.checked_out_at).getTime();
      return sum + (outTime - inTime) / (1000 * 60);
    }, 0);
    const avg = Math.round(totalMinutes / sessions.length);

    expect(avg).toBe(100); // (90 + 60 + 150) / 3 = 100
  });
});
```

- [ ] **Step 4: Create lending stores**

Create `src/lib/modules/lending/stores.svelte.ts`:

```typescript
import { getActiveSessions, getLendingStats, triggerOverdueCheck } from './service';
import type { ReadingSession, LendingStats, SessionWithBook } from './types';

let activeSessions = $state<SessionWithBook[]>([]);
let lendingStats = $state<LendingStats>({
  active_count: 0,
  overdue_count: 0,
  today_checkins: 0,
  today_checkouts: 0,
  avg_duration_minutes: 0,
});
let isLoading = $state(false);
let error = $state<string | null>(null);

/** Refresh active sessions from the server. */
export async function refreshSessions(outletId: string): Promise<void> {
  isLoading = true;
  error = null;
  try {
    activeSessions = await getActiveSessions(outletId);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load sessions';
  } finally {
    isLoading = false;
  }
}

/** Refresh lending stats. */
export async function refreshStats(outletId: string): Promise<void> {
  try {
    lendingStats = await getLendingStats(outletId);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load stats';
  }
}

/** Run overdue check and refresh data. */
export async function checkOverdue(outletId: string): Promise<number> {
  const count = await triggerOverdueCheck();
  if (count > 0) {
    await refreshSessions(outletId);
    await refreshStats(outletId);
  }
  return count;
}

export function getLendingStore() {
  return {
    get activeSessions() { return activeSessions; },
    get overdueSessions() { return activeSessions.filter(s => s.status === 'overdue'); },
    get stats() { return lendingStats; },
    get isLoading() { return isLoading; },
    get error() { return error; },
    refreshSessions,
    refreshStats,
    checkOverdue,
  };
}
```

---

## Task 3: Thermal Printer Module — ESC/POS, Providers & Service

**Files:**
- Create: `src/lib/modules/printer/types.ts`
- Create: `src/lib/modules/printer/escpos.ts`
- Create: `src/lib/modules/printer/escpos.test.ts`
- Create: `src/lib/modules/printer/bluetooth-provider.ts`
- Create: `src/lib/modules/printer/usb-provider.ts`
- Create: `src/lib/modules/printer/service.ts`
- Create: `src/lib/modules/printer/stores.svelte.ts`

- [ ] **Step 1: Define printer types and provider interface**

Create `src/lib/modules/printer/types.ts`:

```typescript
/**
 * Abstract printer provider interface.
 * Concrete implementations: BluetoothPrinterProvider, UsbPrinterProvider.
 */
export interface PrinterProvider {
  readonly type: 'bluetooth' | 'usb';
  readonly isConnected: boolean;
  readonly deviceName: string | null;

  /** Scan and connect to a printer. Returns true if connected. */
  connect(): Promise<boolean>;

  /** Disconnect from the printer. */
  disconnect(): Promise<void>;

  /** Send raw bytes to the printer. */
  write(data: Uint8Array): Promise<void>;
}

export interface PrinterDevice {
  id: string;
  name: string;
  type: 'bluetooth' | 'usb';
}

export interface ReceiptData {
  /** Cafe info */
  cafe_name: string;
  cafe_address: string;
  cafe_phone: string;

  /** Transaction info */
  transaction_id: string;
  date: string;
  staff_name: string;

  /** Items */
  items: ReceiptItem[];

  /** Totals */
  subtotal: number;
  discount: number;
  tax: number;
  total: number;

  /** Payment */
  payment_method: string;
  amount_paid?: number;
  change?: number;

  /** Footer */
  footer_message?: string;
}

export interface ReceiptItem {
  title: string;
  quantity: number;
  unit_price: number;
  total: number;
}

/** ESC/POS alignment */
export type Alignment = 'left' | 'center' | 'right';

/** ESC/POS text style */
export interface TextStyle {
  bold?: boolean;
  underline?: boolean;
  doubleWidth?: boolean;
  doubleHeight?: boolean;
  alignment?: Alignment;
}
```

- [ ] **Step 2: Implement ESC/POS command builder**

Create `src/lib/modules/printer/escpos.ts`:

```typescript
import type { ReceiptData, TextStyle, Alignment } from './types';

// ESC/POS command constants
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

// Paper width in characters (58mm printer ≈ 32 chars, 80mm ≈ 48 chars)
const PAPER_WIDTH = 32;

/**
 * ESC/POS command builder for thermal receipt printers.
 * Builds a Uint8Array of raw ESC/POS commands.
 */
export class EscPosBuilder {
  private buffer: number[] = [];
  private charWidth: number;

  constructor(paperWidth: number = PAPER_WIDTH) {
    this.charWidth = paperWidth;
  }

  /** Initialize printer (reset to default state). */
  init(): this {
    this.buffer.push(ESC, 0x40); // ESC @
    return this;
  }

  /** Set text alignment. */
  align(alignment: Alignment): this {
    const n = alignment === 'left' ? 0 : alignment === 'center' ? 1 : 2;
    this.buffer.push(ESC, 0x61, n); // ESC a n
    return this;
  }

  /** Set bold on/off. */
  bold(on: boolean): this {
    this.buffer.push(ESC, 0x45, on ? 1 : 0); // ESC E n
    return this;
  }

  /** Set underline on/off. */
  underline(on: boolean): this {
    this.buffer.push(ESC, 0x2d, on ? 1 : 0); // ESC - n
    return this;
  }

  /** Set double width on/off. */
  doubleWidth(on: boolean): this {
    if (on) {
      this.buffer.push(GS, 0x21, 0x10); // GS ! 0x10
    } else {
      this.buffer.push(GS, 0x21, 0x00); // GS ! 0x00
    }
    return this;
  }

  /** Set double height on/off. */
  doubleHeight(on: boolean): this {
    if (on) {
      this.buffer.push(GS, 0x21, 0x01); // GS ! 0x01
    } else {
      this.buffer.push(GS, 0x21, 0x00); // GS ! 0x00
    }
    return this;
  }

  /** Set text style (convenience method). */
  style(style: TextStyle): this {
    if (style.alignment) this.align(style.alignment);
    if (style.bold !== undefined) this.bold(style.bold);
    if (style.underline !== undefined) this.underline(style.underline);
    if (style.doubleWidth !== undefined) this.doubleWidth(style.doubleWidth);
    if (style.doubleHeight !== undefined) this.doubleHeight(style.doubleHeight);
    return this;
  }

  /** Print a text line followed by newline. */
  text(content: string): this {
    const encoder = new TextEncoder();
    this.buffer.push(...encoder.encode(content), LF);
    return this;
  }

  /** Print an empty line. */
  newline(count: number = 1): this {
    for (let i = 0; i < count; i++) {
      this.buffer.push(LF);
    }
    return this;
  }

  /** Print a separator line (e.g., "--------------------------------"). */
  separator(char: string = '-'): this {
    this.text(char.repeat(this.charWidth));
    return this;
  }

  /** Print two columns (left-aligned text, right-aligned value). */
  columns(left: string, right: string): this {
    const gap = this.charWidth - left.length - right.length;
    if (gap > 0) {
      this.text(left + ' '.repeat(gap) + right);
    } else {
      // Truncate left text if too long
      const truncatedLeft = left.substring(0, this.charWidth - right.length - 1);
      this.text(truncatedLeft + ' ' + right);
    }
    return this;
  }

  /** Cut paper (full cut). */
  cut(): this {
    this.newline(3);
    this.buffer.push(GS, 0x56, 0x00); // GS V 0 (full cut)
    return this;
  }

  /** Partial cut. */
  partialCut(): this {
    this.newline(3);
    this.buffer.push(GS, 0x56, 0x01); // GS V 1 (partial cut)
    return this;
  }

  /** Open cash drawer (kick pulse). */
  openCashDrawer(): this {
    this.buffer.push(ESC, 0x70, 0x00, 0x19, 0xfa); // ESC p 0 25 250
    return this;
  }

  /** Build the final byte array. */
  build(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

/**
 * Format currency for receipt (Indonesian Rupiah).
 */
function formatCurrency(amount: number): string {
  return 'Rp' + amount.toLocaleString('id-ID');
}

/**
 * Build a complete receipt from transaction data.
 */
export function buildReceipt(data: ReceiptData, paperWidth: number = PAPER_WIDTH): Uint8Array {
  const builder = new EscPosBuilder(paperWidth);

  builder
    .init()
    // Header — cafe info
    .style({ alignment: 'center', bold: true, doubleWidth: true })
    .text(data.cafe_name)
    .style({ bold: false, doubleWidth: false })
    .text(data.cafe_address)
    .text(data.cafe_phone)
    .separator('=')
    // Transaction info
    .align('left')
    .columns('No:', data.transaction_id.substring(0, 8).toUpperCase())
    .columns('Tanggal:', data.date)
    .columns('Kasir:', data.staff_name)
    .separator('-');

  // Items
  for (const item of data.items) {
    // Title on its own line if long
    if (item.title.length > paperWidth - 12) {
      builder.text(item.title.substring(0, paperWidth));
      builder.columns(
        `  ${item.quantity}x ${formatCurrency(item.unit_price)}`,
        formatCurrency(item.total)
      );
    } else {
      builder.text(item.title);
      builder.columns(
        `  ${item.quantity}x ${formatCurrency(item.unit_price)}`,
        formatCurrency(item.total)
      );
    }
  }

  builder.separator('-');

  // Totals
  builder
    .columns('Subtotal', formatCurrency(data.subtotal));

  if (data.discount > 0) {
    builder.columns('Diskon', '-' + formatCurrency(data.discount));
  }

  if (data.tax > 0) {
    builder.columns('PPN', formatCurrency(data.tax));
  }

  builder
    .separator('-')
    .bold(true)
    .columns('TOTAL', formatCurrency(data.total))
    .bold(false)
    .separator('-');

  // Payment info
  builder.columns('Bayar', data.payment_method.toUpperCase());

  if (data.amount_paid !== undefined) {
    builder.columns('Tunai', formatCurrency(data.amount_paid));
  }
  if (data.change !== undefined && data.change > 0) {
    builder.columns('Kembalian', formatCurrency(data.change));
  }

  builder.separator('=');

  // Footer
  builder
    .align('center')
    .newline(1)
    .text(data.footer_message ?? 'Terima kasih!')
    .text('Selamat membaca :)')
    .newline(1);

  builder.partialCut();

  return builder.build();
}
```

- [ ] **Step 3: Write ESC/POS builder tests**

Create `src/lib/modules/printer/escpos.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { EscPosBuilder, buildReceipt } from './escpos';
import type { ReceiptData } from './types';

describe('EscPosBuilder', () => {
  it('should initialize with ESC @ command', () => {
    const builder = new EscPosBuilder();
    const data = builder.init().build();

    // ESC @ = 0x1b 0x40
    expect(data[0]).toBe(0x1b);
    expect(data[1]).toBe(0x40);
  });

  it('should set center alignment', () => {
    const builder = new EscPosBuilder();
    const data = builder.align('center').build();

    // ESC a 1 = 0x1b 0x61 0x01
    expect(data[0]).toBe(0x1b);
    expect(data[1]).toBe(0x61);
    expect(data[2]).toBe(1);
  });

  it('should toggle bold on and off', () => {
    const builder = new EscPosBuilder();
    const data = builder.bold(true).bold(false).build();

    // ESC E 1 then ESC E 0
    expect(data[0]).toBe(0x1b);
    expect(data[1]).toBe(0x45);
    expect(data[2]).toBe(1);
    expect(data[3]).toBe(0x1b);
    expect(data[4]).toBe(0x45);
    expect(data[5]).toBe(0);
  });

  it('should produce text followed by LF', () => {
    const builder = new EscPosBuilder();
    const data = builder.text('Hello').build();
    const decoder = new TextDecoder();

    // Last byte should be LF (0x0a)
    expect(data[data.length - 1]).toBe(0x0a);
    // Content should contain "Hello"
    expect(decoder.decode(data.slice(0, 5))).toBe('Hello');
  });

  it('should produce separator line of correct width', () => {
    const width = 32;
    const builder = new EscPosBuilder(width);
    const data = builder.separator('-').build();
    const decoded = new TextDecoder().decode(data);

    // Should contain 32 dashes
    expect(decoded).toContain('-'.repeat(width));
  });

  it('should produce two-column layout', () => {
    const builder = new EscPosBuilder(32);
    const data = builder.columns('Subtotal', 'Rp50.000').build();
    const decoded = new TextDecoder().decode(data);

    expect(decoded).toContain('Subtotal');
    expect(decoded).toContain('Rp50.000');
    // Total length before LF should be 32
    const lineContent = decoded.split('\n')[0];
    expect(lineContent.length).toBe(32);
  });

  it('should produce full cut command', () => {
    const builder = new EscPosBuilder();
    const data = builder.cut().build();
    const arr = Array.from(data);

    // Should contain GS V 0 = 0x1d 0x56 0x00
    const gsIdx = arr.lastIndexOf(0x1d);
    expect(arr[gsIdx + 1]).toBe(0x56);
    expect(arr[gsIdx + 2]).toBe(0x00);
  });
});

describe('buildReceipt', () => {
  it('should build a complete receipt byte array', () => {
    const receiptData: ReceiptData = {
      cafe_name: 'Libris Cafe',
      cafe_address: 'Jl. Buku No. 42',
      cafe_phone: '021-1234567',
      transaction_id: 'abc12345-6789',
      date: '2026-03-19 14:30',
      staff_name: 'Adi',
      items: [
        { title: 'Laskar Pelangi', quantity: 1, unit_price: 75000, total: 75000 },
        { title: 'Bumi Manusia', quantity: 1, unit_price: 95000, total: 95000 },
      ],
      subtotal: 170000,
      discount: 0,
      tax: 18700,
      total: 188700,
      payment_method: 'cash',
      amount_paid: 200000,
      change: 11300,
    };

    const bytes = buildReceipt(receiptData);

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);

    // Should start with init command ESC @
    expect(bytes[0]).toBe(0x1b);
    expect(bytes[1]).toBe(0x40);

    // Should contain cafe name somewhere in the output
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toContain('Libris Cafe');
    expect(decoded).toContain('Laskar Pelangi');
    expect(decoded).toContain('Bumi Manusia');
    expect(decoded).toContain('Terima kasih!');
  });
});
```

- [ ] **Step 4: Implement Web Bluetooth printer provider**

Create `src/lib/modules/printer/bluetooth-provider.ts`:

```typescript
import type { PrinterProvider } from './types';

// Common thermal printer Bluetooth service UUIDs
const PRINTER_SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';
const PRINTER_CHAR_UUID = '00002af1-0000-1000-8000-00805f9b34fb';

// Some printers use the Serial Port Profile (SPP) UUID
const SPP_SERVICE_UUID = '00001101-0000-1000-8000-00805f9b34fb';

/**
 * Web Bluetooth API printer provider.
 * Connects to BLE thermal printers (e.g., common 58mm/80mm receipt printers).
 */
export class BluetoothPrinterProvider implements PrinterProvider {
  readonly type = 'bluetooth' as const;
  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private _isConnected = false;
  private _deviceName: string | null = null;

  get isConnected(): boolean {
    return this._isConnected;
  }

  get deviceName(): string | null {
    return this._deviceName;
  }

  async connect(): Promise<boolean> {
    try {
      if (!navigator.bluetooth) {
        throw new Error('Web Bluetooth API not supported in this browser');
      }

      // Request device with printer service filter
      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [PRINTER_SERVICE_UUID] },
          { services: [SPP_SERVICE_UUID] },
          // Also accept by name prefix (common thermal printer brands)
          { namePrefix: 'RPP' },
          { namePrefix: 'MPT' },
          { namePrefix: 'BlueTooth Printer' },
          { namePrefix: 'Printer' },
        ],
        optionalServices: [PRINTER_SERVICE_UUID, SPP_SERVICE_UUID],
      });

      if (!this.device) return false;

      this._deviceName = this.device.name ?? 'Unknown Printer';

      // Listen for disconnection
      this.device.addEventListener('gattserverdisconnected', () => {
        this._isConnected = false;
        this.characteristic = null;
      });

      // Connect to GATT server
      const server = await this.device.gatt!.connect();

      // Try to find the printer service
      let service: BluetoothRemoteGATTService;
      try {
        service = await server.getPrimaryService(PRINTER_SERVICE_UUID);
      } catch {
        // Fallback to SPP service
        service = await server.getPrimaryService(SPP_SERVICE_UUID);
      }

      // Get the write characteristic
      const characteristics = await service.getCharacteristics();
      this.characteristic =
        characteristics.find(c => c.properties.writeWithoutResponse || c.properties.write) ?? null;

      if (!this.characteristic) {
        throw new Error('No writable characteristic found on printer');
      }

      this._isConnected = true;
      return true;
    } catch (err) {
      console.error('Bluetooth printer connection failed:', err);
      this._isConnected = false;
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this._isConnected = false;
    this.characteristic = null;
    this.device = null;
    this._deviceName = null;
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this.characteristic || !this._isConnected) {
      throw new Error('Printer not connected');
    }

    // BLE has a max packet size (typically 20 bytes for older devices, 512 for BLE 5.0)
    // Send in chunks of 20 bytes for maximum compatibility
    const CHUNK_SIZE = 20;
    for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
      const chunk = data.slice(offset, offset + CHUNK_SIZE);
      if (this.characteristic.properties.writeWithoutResponse) {
        await this.characteristic.writeValueWithoutResponse(chunk);
      } else {
        await this.characteristic.writeValueWithResponse(chunk);
      }
      // Small delay between chunks to prevent buffer overflow on printer
      if (offset + CHUNK_SIZE < data.length) {
        await new Promise(r => setTimeout(r, 10));
      }
    }
  }
}
```

- [ ] **Step 5: Implement Web USB printer provider**

Create `src/lib/modules/printer/usb-provider.ts`:

```typescript
import type { PrinterProvider } from './types';

/**
 * Web USB API printer provider.
 * Connects to USB thermal receipt printers.
 */
export class UsbPrinterProvider implements PrinterProvider {
  readonly type = 'usb' as const;
  private device: USBDevice | null = null;
  private endpointNumber: number | null = null;
  private _isConnected = false;
  private _deviceName: string | null = null;

  get isConnected(): boolean {
    return this._isConnected;
  }

  get deviceName(): string | null {
    return this._deviceName;
  }

  async connect(): Promise<boolean> {
    try {
      if (!navigator.usb) {
        throw new Error('Web USB API not supported in this browser');
      }

      // Request USB device — user selects printer from browser dialog
      this.device = await navigator.usb.requestDevice({
        filters: [
          // Common USB printer class (7 = Printer)
          { classCode: 7 },
        ],
      });

      if (!this.device) return false;

      this._deviceName = this.device.productName ?? 'USB Printer';

      await this.device.open();

      // Select configuration (usually configuration 1)
      if (this.device.configuration === null) {
        await this.device.selectConfiguration(1);
      }

      // Find the printer interface and claim it
      const iface = this.device.configuration!.interfaces.find(i =>
        i.alternate.interfaceClass === 7 // Printer class
      );

      if (!iface) {
        throw new Error('No printer interface found on USB device');
      }

      await this.device.claimInterface(iface.interfaceNumber);

      // Find bulk OUT endpoint for sending data
      const endpoint = iface.alternate.endpoints.find(
        e => e.direction === 'out' && e.type === 'bulk'
      );

      if (!endpoint) {
        throw new Error('No bulk OUT endpoint found on printer');
      }

      this.endpointNumber = endpoint.endpointNumber;
      this._isConnected = true;
      return true;
    } catch (err) {
      console.error('USB printer connection failed:', err);
      this._isConnected = false;
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.device) {
      try {
        await this.device.close();
      } catch {
        // Device may already be disconnected
      }
    }
    this._isConnected = false;
    this.device = null;
    this.endpointNumber = null;
    this._deviceName = null;
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this.device || !this._isConnected || this.endpointNumber === null) {
      throw new Error('Printer not connected');
    }

    // USB can handle larger transfers than BLE, send in 64-byte chunks
    const CHUNK_SIZE = 64;
    for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
      const chunk = data.slice(offset, offset + CHUNK_SIZE);
      await this.device.transferOut(this.endpointNumber, chunk);
    }
  }
}
```

- [ ] **Step 6: Implement printer service (manager)**

Create `src/lib/modules/printer/service.ts`:

```typescript
import type { PrinterProvider, ReceiptData } from './types';
import { BluetoothPrinterProvider } from './bluetooth-provider';
import { UsbPrinterProvider } from './usb-provider';
import { buildReceipt } from './escpos';

export type PrinterConnectionType = 'bluetooth' | 'usb';

let activeProvider: PrinterProvider | null = null;

/**
 * Get or create a printer provider of the specified type.
 */
export function getProvider(type: PrinterConnectionType): PrinterProvider {
  if (activeProvider && activeProvider.type === type) {
    return activeProvider;
  }

  // Disconnect existing provider if switching types
  if (activeProvider) {
    activeProvider.disconnect();
  }

  activeProvider =
    type === 'bluetooth'
      ? new BluetoothPrinterProvider()
      : new UsbPrinterProvider();

  return activeProvider;
}

/**
 * Connect to a printer. Shows browser device picker.
 */
export async function connectPrinter(type: PrinterConnectionType): Promise<boolean> {
  const provider = getProvider(type);
  return provider.connect();
}

/**
 * Disconnect the current printer.
 */
export async function disconnectPrinter(): Promise<void> {
  if (activeProvider) {
    await activeProvider.disconnect();
    activeProvider = null;
  }
}

/**
 * Print a receipt. Builds ESC/POS commands and sends to printer.
 */
export async function printReceipt(
  data: ReceiptData,
  options: { paperWidth?: number; openDrawer?: boolean } = {}
): Promise<void> {
  if (!activeProvider || !activeProvider.isConnected) {
    throw new Error('No printer connected. Please connect a printer first.');
  }

  const receiptBytes = buildReceipt(data, options.paperWidth ?? 32);
  await activeProvider.write(receiptBytes);

  // Optionally open cash drawer after printing
  if (options.openDrawer) {
    const { EscPosBuilder } = await import('./escpos');
    const drawerCmd = new EscPosBuilder().openCashDrawer().build();
    await activeProvider.write(drawerCmd);
  }
}

/**
 * Print raw bytes (for testing or custom commands).
 */
export async function printRaw(data: Uint8Array): Promise<void> {
  if (!activeProvider || !activeProvider.isConnected) {
    throw new Error('No printer connected');
  }
  await activeProvider.write(data);
}

/**
 * Check if Web Bluetooth is supported.
 */
export function isBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

/**
 * Check if Web USB is supported.
 */
export function isUsbSupported(): boolean {
  return typeof navigator !== 'undefined' && 'usb' in navigator;
}

/**
 * Get the current printer status.
 */
export function getPrinterStatus(): {
  connected: boolean;
  type: PrinterConnectionType | null;
  deviceName: string | null;
} {
  return {
    connected: activeProvider?.isConnected ?? false,
    type: activeProvider?.type ?? null,
    deviceName: activeProvider?.deviceName ?? null,
  };
}
```

- [ ] **Step 7: Create printer stores**

Create `src/lib/modules/printer/stores.svelte.ts`:

```typescript
import {
  connectPrinter,
  disconnectPrinter,
  printReceipt,
  getPrinterStatus,
  isBluetoothSupported,
  isUsbSupported,
  type PrinterConnectionType,
} from './service';
import type { ReceiptData } from './types';

let isConnected = $state(false);
let connectionType = $state<PrinterConnectionType | null>(null);
let deviceName = $state<string | null>(null);
let isPrinting = $state(false);
let error = $state<string | null>(null);

function syncStatus() {
  const status = getPrinterStatus();
  isConnected = status.connected;
  connectionType = status.type;
  deviceName = status.deviceName;
}

export function getPrinterStore() {
  return {
    get isConnected() { return isConnected; },
    get connectionType() { return connectionType; },
    get deviceName() { return deviceName; },
    get isPrinting() { return isPrinting; },
    get error() { return error; },
    get bluetoothSupported() { return isBluetoothSupported(); },
    get usbSupported() { return isUsbSupported(); },

    async connect(type: PrinterConnectionType): Promise<boolean> {
      error = null;
      try {
        const success = await connectPrinter(type);
        syncStatus();
        return success;
      } catch (e) {
        error = e instanceof Error ? e.message : 'Connection failed';
        return false;
      }
    },

    async disconnect(): Promise<void> {
      await disconnectPrinter();
      syncStatus();
    },

    async print(data: ReceiptData, options?: { paperWidth?: number; openDrawer?: boolean }): Promise<boolean> {
      error = null;
      isPrinting = true;
      try {
        await printReceipt(data, options);
        return true;
      } catch (e) {
        error = e instanceof Error ? e.message : 'Print failed';
        return false;
      } finally {
        isPrinting = false;
      }
    },
  };
}
```

---

## Task 4: Kiosk Mode — Idle Timer, Layout & Components

**Files:**
- Create: `src/lib/modules/kiosk/types.ts`
- Create: `src/lib/modules/kiosk/idle-timer.ts`
- Create: `src/lib/modules/kiosk/idle-timer.test.ts`
- Create: `src/lib/modules/kiosk/stores.svelte.ts`
- Create: `src/routes/kiosk/+layout.svelte`
- Create: `src/routes/kiosk/+page.svelte`
- Create: `src/lib/components/kiosk/KioskHeader.svelte`
- Create: `src/lib/components/kiosk/IdleOverlay.svelte`
- Create: `src/lib/components/kiosk/QrBookCard.svelte`

- [ ] **Step 1: Define kiosk types**

Create `src/lib/modules/kiosk/types.ts`:

```typescript
export interface KioskConfig {
  /** Idle timeout in milliseconds before auto-reset. Default: 120000 (2 min). */
  idle_timeout_ms: number;

  /** Whether to show QR codes on book cards. */
  show_qr_codes: boolean;

  /** Custom welcome message displayed on idle overlay. */
  welcome_message_en: string;
  welcome_message_id: string;

  /** Cafe branding */
  cafe_name: string;
  cafe_logo_url?: string;

  /** Auto-enter fullscreen on mount. */
  auto_fullscreen: boolean;
}

export const DEFAULT_KIOSK_CONFIG: KioskConfig = {
  idle_timeout_ms: 2 * 60 * 1000, // 2 minutes
  show_qr_codes: false,
  welcome_message_en: 'Touch to browse our collection',
  welcome_message_id: 'Sentuh untuk menjelajahi koleksi kami',
  cafe_name: 'Libris Cafe',
  auto_fullscreen: true,
};

export type KioskState = 'active' | 'idle' | 'resetting';
```

- [ ] **Step 2: Implement idle timer**

Create `src/lib/modules/kiosk/idle-timer.ts`:

```typescript
export type IdleCallback = () => void;

/**
 * Idle timer for kiosk mode.
 * Monitors user interaction events and fires callback after timeout.
 * Resets on any touch, click, scroll, or keypress event.
 */
export class IdleTimer {
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private countdownId: ReturnType<typeof setInterval> | null = null;
  private timeoutMs: number;
  private onIdle: IdleCallback;
  private onCountdown?: (secondsLeft: number) => void;
  private warningMs: number;
  private isRunning = false;
  private lastActivity = Date.now();

  /** Events that reset the idle timer. */
  private static EVENTS: (keyof DocumentEventMap)[] = [
    'touchstart',
    'touchmove',
    'click',
    'mousemove',
    'scroll',
    'keydown',
  ];

  constructor(options: {
    timeoutMs: number;
    onIdle: IdleCallback;
    /** Callback fired every second during the warning period (last 10s). */
    onCountdown?: (secondsLeft: number) => void;
    /** How long before timeout to start countdown warning (ms). Default: 10000. */
    warningMs?: number;
  }) {
    this.timeoutMs = options.timeoutMs;
    this.onIdle = options.onIdle;
    this.onCountdown = options.onCountdown;
    this.warningMs = options.warningMs ?? 10000;
    this.handleActivity = this.handleActivity.bind(this);
  }

  /** Start monitoring idle state. */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastActivity = Date.now();

    // Attach event listeners
    for (const event of IdleTimer.EVENTS) {
      document.addEventListener(event, this.handleActivity, { passive: true });
    }

    this.scheduleTimeout();
  }

  /** Stop monitoring idle state. */
  stop(): void {
    this.isRunning = false;

    for (const event of IdleTimer.EVENTS) {
      document.removeEventListener(event, this.handleActivity);
    }

    this.clearTimers();
  }

  /** Reset the timer (called on user activity). */
  reset(): void {
    this.lastActivity = Date.now();
    this.clearTimers();
    if (this.isRunning) {
      this.scheduleTimeout();
    }
  }

  /** Get milliseconds remaining until idle. */
  getTimeRemaining(): number {
    return Math.max(0, this.timeoutMs - (Date.now() - this.lastActivity));
  }

  private handleActivity(): void {
    this.reset();
  }

  private scheduleTimeout(): void {
    this.clearTimers();

    // Schedule the warning countdown (starts warningMs before timeout)
    const warningDelay = Math.max(0, this.timeoutMs - this.warningMs);

    if (this.onCountdown && warningDelay > 0) {
      this.timeoutId = setTimeout(() => {
        // Start countdown
        let secondsLeft = Math.ceil(this.warningMs / 1000);
        this.onCountdown?.(secondsLeft);

        this.countdownId = setInterval(() => {
          secondsLeft--;
          if (secondsLeft <= 0) {
            this.clearTimers();
            this.onIdle();
          } else {
            this.onCountdown?.(secondsLeft);
          }
        }, 1000);
      }, warningDelay);
    } else {
      // No countdown, just fire after full timeout
      this.timeoutId = setTimeout(() => {
        this.onIdle();
      }, this.timeoutMs);
    }
  }

  private clearTimers(): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (this.countdownId !== null) {
      clearInterval(this.countdownId);
      this.countdownId = null;
    }
  }
}
```

- [ ] **Step 3: Write idle timer tests**

Create `src/lib/modules/kiosk/idle-timer.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IdleTimer } from './idle-timer';

describe('IdleTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Mock document event listeners
    vi.spyOn(document, 'addEventListener').mockImplementation(() => {});
    vi.spyOn(document, 'removeEventListener').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should fire onIdle callback after timeout', () => {
    const onIdle = vi.fn();
    const timer = new IdleTimer({ timeoutMs: 5000, onIdle });

    timer.start();
    expect(onIdle).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5000);
    expect(onIdle).toHaveBeenCalledOnce();

    timer.stop();
  });

  it('should not fire onIdle before timeout', () => {
    const onIdle = vi.fn();
    const timer = new IdleTimer({ timeoutMs: 5000, onIdle });

    timer.start();
    vi.advanceTimersByTime(4999);
    expect(onIdle).not.toHaveBeenCalled();

    timer.stop();
  });

  it('should reset timer on reset() call', () => {
    const onIdle = vi.fn();
    const timer = new IdleTimer({ timeoutMs: 5000, onIdle });

    timer.start();
    vi.advanceTimersByTime(3000);
    timer.reset();
    vi.advanceTimersByTime(3000);
    // Should NOT have fired — reset pushed it out
    expect(onIdle).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2000);
    expect(onIdle).toHaveBeenCalledOnce();

    timer.stop();
  });

  it('should fire countdown callback during warning period', () => {
    const onIdle = vi.fn();
    const onCountdown = vi.fn();
    const timer = new IdleTimer({
      timeoutMs: 5000,
      onIdle,
      onCountdown,
      warningMs: 3000,
    });

    timer.start();

    // After 2s (warningDelay = 5000 - 3000 = 2000), countdown starts
    vi.advanceTimersByTime(2000);
    expect(onCountdown).toHaveBeenCalledWith(3); // 3 seconds left

    vi.advanceTimersByTime(1000);
    expect(onCountdown).toHaveBeenCalledWith(2);

    vi.advanceTimersByTime(1000);
    expect(onCountdown).toHaveBeenCalledWith(1);

    vi.advanceTimersByTime(1000);
    expect(onIdle).toHaveBeenCalledOnce();

    timer.stop();
  });

  it('should register event listeners on start and remove on stop', () => {
    const timer = new IdleTimer({ timeoutMs: 5000, onIdle: vi.fn() });

    timer.start();
    expect(document.addEventListener).toHaveBeenCalled();

    timer.stop();
    expect(document.removeEventListener).toHaveBeenCalled();
  });

  it('should not start twice', () => {
    const onIdle = vi.fn();
    const timer = new IdleTimer({ timeoutMs: 5000, onIdle });

    timer.start();
    timer.start(); // Second call should be no-op

    vi.advanceTimersByTime(5000);
    expect(onIdle).toHaveBeenCalledOnce(); // Only one timeout fired

    timer.stop();
  });
});
```

- [ ] **Step 4: Create kiosk stores**

Create `src/lib/modules/kiosk/stores.svelte.ts`:

```typescript
import type { KioskConfig, KioskState } from './types';
import { DEFAULT_KIOSK_CONFIG } from './types';

let kioskMode = $state(false);
let kioskState = $state<KioskState>('idle');
let config = $state<KioskConfig>({ ...DEFAULT_KIOSK_CONFIG });
let countdownSeconds = $state<number | null>(null);

export function getKioskStore() {
  return {
    get isKioskMode() { return kioskMode; },
    get state() { return kioskState; },
    get config() { return config; },
    get countdownSeconds() { return countdownSeconds; },

    enable(overrides?: Partial<KioskConfig>) {
      kioskMode = true;
      kioskState = 'idle';
      if (overrides) {
        config = { ...DEFAULT_KIOSK_CONFIG, ...overrides };
      }
    },

    disable() {
      kioskMode = false;
      kioskState = 'idle';
      countdownSeconds = null;
    },

    setActive() {
      kioskState = 'active';
      countdownSeconds = null;
    },

    setIdle() {
      kioskState = 'idle';
      countdownSeconds = null;
    },

    setCountdown(seconds: number) {
      countdownSeconds = seconds;
    },

    setResetting() {
      kioskState = 'resetting';
    },

    updateConfig(overrides: Partial<KioskConfig>) {
      config = { ...config, ...overrides };
    },
  };
}
```

- [ ] **Step 5: Create kiosk layout (fullscreen, locked to guest, idle timer)**

Create `src/routes/kiosk/+layout.svelte`:

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { IdleTimer } from '$lib/modules/kiosk/idle-timer';
  import { getKioskStore } from '$lib/modules/kiosk/stores.svelte';
  import { t } from '$lib/i18n/index.svelte';
  import IdleOverlay from '$lib/components/kiosk/IdleOverlay.svelte';
  import KioskHeader from '$lib/components/kiosk/KioskHeader.svelte';

  let { children } = $props();

  const kiosk = getKioskStore();
  let idleTimer: IdleTimer | null = null;

  function handleIdle() {
    kiosk.setIdle();
    // Reset to kiosk home
    goto('/kiosk');
  }

  function handleCountdown(seconds: number) {
    kiosk.setCountdown(seconds);
  }

  function handleInteraction() {
    kiosk.setActive();
  }

  onMount(() => {
    // Enable kiosk mode
    kiosk.enable();

    // Request fullscreen if configured
    if (kiosk.config.auto_fullscreen && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {
        // Fullscreen may be blocked by browser policy — continue anyway
      });
    }

    // Start idle timer
    idleTimer = new IdleTimer({
      timeoutMs: kiosk.config.idle_timeout_ms,
      onIdle: handleIdle,
      onCountdown: handleCountdown,
      warningMs: 10000,
    });
    idleTimer.start();

    // Set active on first interaction
    document.addEventListener('touchstart', handleInteraction, { once: true });
  });

  onDestroy(() => {
    idleTimer?.stop();
    kiosk.disable();

    // Exit fullscreen
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  });
</script>

<div class="kiosk-container min-h-screen bg-base-100 flex flex-col select-none">
  <KioskHeader cafeName={kiosk.config.cafe_name} logoUrl={kiosk.config.cafe_logo_url} />

  <main class="flex-1 overflow-y-auto p-4">
    {@render children()}
  </main>

  {#if kiosk.state === 'idle'}
    <IdleOverlay
      welcomeMessage={t('kiosk.welcome')}
      cafeName={kiosk.config.cafe_name}
      ontap={handleInteraction}
    />
  {/if}

  {#if kiosk.countdownSeconds !== null && kiosk.countdownSeconds > 0}
    <div class="fixed bottom-4 left-1/2 -translate-x-1/2 bg-amber-500 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg z-40">
      {t('kiosk.resetIn', { seconds: kiosk.countdownSeconds })}
    </div>
  {/if}
</div>

<style>
  .kiosk-container {
    /* Prevent pull-to-refresh and overscroll on tablet */
    overscroll-behavior: none;
    touch-action: pan-y;
    /* Hide scrollbar for cleaner kiosk look */
    &::-webkit-scrollbar { display: none; }
  }
</style>
```

- [ ] **Step 6: Create kiosk page (browse-only catalog)**

Create `src/routes/kiosk/+page.svelte`:

```svelte
<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import { getKioskStore } from '$lib/modules/kiosk/stores.svelte';
  import QrBookCard from '$lib/components/kiosk/QrBookCard.svelte';
  import { books } from '$lib/db/books.svelte';

  const kiosk = getKioskStore();
  let searchQuery = $state('');

  const filteredBooks = $derived(
    searchQuery.trim()
      ? books.filter(b =>
          b.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (b.authors ?? []).some(a => a.toLowerCase().includes(searchQuery.toLowerCase()))
        )
      : books
  );
</script>

<div class="space-y-4">
  <!-- Search bar -->
  <div class="sticky top-0 z-10 bg-base-100 pb-2">
    <input
      type="search"
      placeholder={t('kiosk.searchPlaceholder')}
      bind:value={searchQuery}
      class="w-full px-4 py-3 rounded-xl border border-base-300 bg-base-200 text-lg focus:outline-none focus:ring-2 focus:ring-primary"
    />
  </div>

  <!-- Book grid -->
  <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
    {#each filteredBooks as book (book.id)}
      <QrBookCard
        {book}
        showQr={kiosk.config.show_qr_codes}
      />
    {/each}
  </div>

  {#if filteredBooks.length === 0}
    <div class="text-center py-12 text-base-content/60">
      <p class="text-xl">{t('kiosk.noResults')}</p>
    </div>
  {/if}
</div>
```

- [ ] **Step 7: Create kiosk components**

Create `src/lib/components/kiosk/KioskHeader.svelte`:

```svelte
<script lang="ts">
  let { cafeName, logoUrl }: { cafeName: string; logoUrl?: string } = $props();
</script>

<header class="flex items-center justify-center gap-3 py-3 px-4 bg-primary text-primary-content shadow-md">
  {#if logoUrl}
    <img src={logoUrl} alt={cafeName} class="h-8 w-8 rounded-full object-cover" />
  {/if}
  <h1 class="text-xl font-bold tracking-tight">{cafeName}</h1>
</header>
```

Create `src/lib/components/kiosk/IdleOverlay.svelte`:

```svelte
<script lang="ts">
  let { welcomeMessage, cafeName, ontap }: {
    welcomeMessage: string;
    cafeName: string;
    ontap: () => void;
  } = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-base-100/95 backdrop-blur-sm"
  onclick={ontap}
  ontouchstart={ontap}
>
  <div class="text-center space-y-6 animate-pulse-slow">
    <h2 class="text-4xl font-bold text-primary">{cafeName}</h2>
    <p class="text-xl text-base-content/70">{welcomeMessage}</p>
    <div class="mt-8">
      <svg class="w-16 h-16 mx-auto text-primary/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59" />
      </svg>
    </div>
  </div>
</div>

<style>
  @keyframes pulse-slow {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.8; }
  }
  .animate-pulse-slow {
    animation: pulse-slow 3s ease-in-out infinite;
  }
</style>
```

Create `src/lib/components/kiosk/QrBookCard.svelte`:

```svelte
<script lang="ts">
  import type { Book } from '$lib/db/types';

  let { book, showQr = false }: { book: Book; showQr?: boolean } = $props();

  // Simple QR URL — could link to book detail page or external catalog
  const qrUrl = $derived(
    showQr ? `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(`/book/${book.id}`)}` : null
  );
</script>

<div class="bg-base-200 rounded-xl overflow-hidden shadow-sm active:scale-[0.98] transition-transform">
  <!-- Cover image -->
  <div class="aspect-[2/3] bg-base-300 relative">
    {#if book.coverUrl}
      <img
        src={book.coverUrl}
        alt={book.title}
        class="w-full h-full object-cover"
        loading="lazy"
      />
    {:else}
      <div class="w-full h-full flex items-center justify-center text-base-content/30">
        <svg class="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>
      </div>
    {/if}

    {#if qrUrl}
      <img
        src={qrUrl}
        alt="QR"
        class="absolute bottom-1 right-1 w-12 h-12 bg-white rounded p-0.5"
      />
    {/if}
  </div>

  <!-- Info -->
  <div class="p-2">
    <h3 class="font-medium text-sm line-clamp-2 leading-tight">{book.title}</h3>
    {#if book.authors?.length}
      <p class="text-xs text-base-content/60 mt-0.5 truncate">{book.authors.join(', ')}</p>
    {/if}
  </div>
</div>
```

---

## Task 5: Advanced Reports — CSV Client-Side Export

**Files:**
- Create: `src/lib/modules/reports/types.ts`
- Create: `src/lib/modules/reports/csv-export.ts`
- Create: `src/lib/modules/reports/csv-export.test.ts`
- Create: `src/lib/modules/reports/service.ts`
- Create: `src/lib/modules/reports/stores.svelte.ts`

- [ ] **Step 1: Define report types**

Create `src/lib/modules/reports/types.ts`:

```typescript
export type ExportFormat = 'csv' | 'pdf' | 'excel';

export type ReportType =
  | 'sales_daily'
  | 'sales_weekly'
  | 'sales_monthly'
  | 'inventory_status'
  | 'stock_movement'
  | 'dead_stock'
  | 'profit_margin'
  | 'consignment_summary'
  | 'supplier_performance'
  | 'lending_sessions';

export interface ReportConfig {
  type: ReportType;
  format: ExportFormat;
  outlet_id: string;
  date_from: string;  // ISO date
  date_to: string;    // ISO date
  /** Optional filters (e.g., category, supplier_id). */
  filters?: Record<string, string>;
}

export interface ReportColumn {
  key: string;
  label_en: string;
  label_id: string;
  /** Format type for display/export. */
  format?: 'text' | 'number' | 'currency' | 'date' | 'percentage';
}

export interface ReportData {
  title_en: string;
  title_id: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  generated_at: string;
  config: ReportConfig;
}

export interface ExportProgress {
  status: 'idle' | 'fetching' | 'generating' | 'downloading' | 'done' | 'error';
  progress: number; // 0-100
  error?: string;
}

/** Report definitions — maps ReportType to its column schema. */
export const REPORT_SCHEMAS: Record<ReportType, { title_en: string; title_id: string; columns: ReportColumn[] }> = {
  sales_daily: {
    title_en: 'Daily Sales Report',
    title_id: 'Laporan Penjualan Harian',
    columns: [
      { key: 'date', label_en: 'Date', label_id: 'Tanggal', format: 'date' },
      { key: 'transactions', label_en: 'Transactions', label_id: 'Transaksi', format: 'number' },
      { key: 'items_sold', label_en: 'Items Sold', label_id: 'Item Terjual', format: 'number' },
      { key: 'subtotal', label_en: 'Subtotal', label_id: 'Subtotal', format: 'currency' },
      { key: 'discount', label_en: 'Discount', label_id: 'Diskon', format: 'currency' },
      { key: 'tax', label_en: 'Tax', label_id: 'Pajak', format: 'currency' },
      { key: 'total', label_en: 'Total', label_id: 'Total', format: 'currency' },
    ],
  },
  sales_weekly: {
    title_en: 'Weekly Sales Report',
    title_id: 'Laporan Penjualan Mingguan',
    columns: [
      { key: 'week', label_en: 'Week', label_id: 'Minggu', format: 'text' },
      { key: 'transactions', label_en: 'Transactions', label_id: 'Transaksi', format: 'number' },
      { key: 'total', label_en: 'Total', label_id: 'Total', format: 'currency' },
      { key: 'avg_per_transaction', label_en: 'Avg/Transaction', label_id: 'Rata-rata/Transaksi', format: 'currency' },
    ],
  },
  sales_monthly: {
    title_en: 'Monthly Sales Report',
    title_id: 'Laporan Penjualan Bulanan',
    columns: [
      { key: 'month', label_en: 'Month', label_id: 'Bulan', format: 'text' },
      { key: 'transactions', label_en: 'Transactions', label_id: 'Transaksi', format: 'number' },
      { key: 'total', label_en: 'Total', label_id: 'Total', format: 'currency' },
      { key: 'growth', label_en: 'Growth', label_id: 'Pertumbuhan', format: 'percentage' },
    ],
  },
  inventory_status: {
    title_en: 'Inventory Status Report',
    title_id: 'Laporan Status Inventaris',
    columns: [
      { key: 'title', label_en: 'Book Title', label_id: 'Judul Buku', format: 'text' },
      { key: 'isbn', label_en: 'ISBN', label_id: 'ISBN', format: 'text' },
      { key: 'type', label_en: 'Type', label_id: 'Tipe', format: 'text' },
      { key: 'stock', label_en: 'Stock', label_id: 'Stok', format: 'number' },
      { key: 'price', label_en: 'Price', label_id: 'Harga', format: 'currency' },
      { key: 'condition', label_en: 'Condition', label_id: 'Kondisi', format: 'text' },
    ],
  },
  stock_movement: {
    title_en: 'Stock Movement Report',
    title_id: 'Laporan Pergerakan Stok',
    columns: [
      { key: 'date', label_en: 'Date', label_id: 'Tanggal', format: 'date' },
      { key: 'title', label_en: 'Book', label_id: 'Buku', format: 'text' },
      { key: 'type', label_en: 'Movement Type', label_id: 'Jenis Pergerakan', format: 'text' },
      { key: 'quantity', label_en: 'Quantity', label_id: 'Jumlah', format: 'number' },
      { key: 'staff', label_en: 'Staff', label_id: 'Staf', format: 'text' },
      { key: 'reason', label_en: 'Reason', label_id: 'Alasan', format: 'text' },
    ],
  },
  dead_stock: {
    title_en: 'Dead Stock Report (>90 days unsold)',
    title_id: 'Laporan Stok Mati (>90 hari tidak terjual)',
    columns: [
      { key: 'title', label_en: 'Book Title', label_id: 'Judul Buku', format: 'text' },
      { key: 'stock', label_en: 'Stock', label_id: 'Stok', format: 'number' },
      { key: 'last_sold', label_en: 'Last Sold', label_id: 'Terakhir Terjual', format: 'date' },
      { key: 'days_unsold', label_en: 'Days Unsold', label_id: 'Hari Tidak Terjual', format: 'number' },
      { key: 'value', label_en: 'Stock Value', label_id: 'Nilai Stok', format: 'currency' },
    ],
  },
  profit_margin: {
    title_en: 'Profit Margin Report',
    title_id: 'Laporan Margin Keuntungan',
    columns: [
      { key: 'title', label_en: 'Book Title', label_id: 'Judul Buku', format: 'text' },
      { key: 'sold', label_en: 'Sold', label_id: 'Terjual', format: 'number' },
      { key: 'revenue', label_en: 'Revenue', label_id: 'Pendapatan', format: 'currency' },
      { key: 'cost', label_en: 'Cost', label_id: 'Biaya', format: 'currency' },
      { key: 'margin', label_en: 'Margin', label_id: 'Margin', format: 'currency' },
      { key: 'margin_pct', label_en: 'Margin %', label_id: 'Margin %', format: 'percentage' },
    ],
  },
  consignment_summary: {
    title_en: 'Consignment Summary',
    title_id: 'Ringkasan Konsinyasi',
    columns: [
      { key: 'consignor', label_en: 'Consignor', label_id: 'Konsinyur', format: 'text' },
      { key: 'books_count', label_en: 'Books', label_id: 'Jumlah Buku', format: 'number' },
      { key: 'sold', label_en: 'Sold', label_id: 'Terjual', format: 'number' },
      { key: 'total_sales', label_en: 'Total Sales', label_id: 'Total Penjualan', format: 'currency' },
      { key: 'commission', label_en: 'Commission', label_id: 'Komisi', format: 'currency' },
      { key: 'payout', label_en: 'Payout', label_id: 'Pembayaran', format: 'currency' },
    ],
  },
  supplier_performance: {
    title_en: 'Supplier Performance Report',
    title_id: 'Laporan Kinerja Supplier',
    columns: [
      { key: 'supplier', label_en: 'Supplier', label_id: 'Supplier', format: 'text' },
      { key: 'orders', label_en: 'Orders', label_id: 'Pesanan', format: 'number' },
      { key: 'total_spent', label_en: 'Total Spent', label_id: 'Total Belanja', format: 'currency' },
      { key: 'avg_lead_days', label_en: 'Avg Lead Time', label_id: 'Rata-rata Lead Time', format: 'number' },
      { key: 'fulfillment_rate', label_en: 'Fulfillment %', label_id: 'Fulfillment %', format: 'percentage' },
    ],
  },
  lending_sessions: {
    title_en: 'Lending Sessions Report',
    title_id: 'Laporan Sesi Peminjaman',
    columns: [
      { key: 'date', label_en: 'Date', label_id: 'Tanggal', format: 'date' },
      { key: 'title', label_en: 'Book', label_id: 'Buku', format: 'text' },
      { key: 'customer', label_en: 'Customer', label_id: 'Pelanggan', format: 'text' },
      { key: 'level', label_en: 'Level', label_id: 'Level', format: 'text' },
      { key: 'duration_min', label_en: 'Duration (min)', label_id: 'Durasi (menit)', format: 'number' },
      { key: 'deposit', label_en: 'Deposit', label_id: 'Deposit', format: 'currency' },
      { key: 'status', label_en: 'Status', label_id: 'Status', format: 'text' },
    ],
  },
};
```

- [ ] **Step 2: Implement CSV export (client-side)**

Create `src/lib/modules/reports/csv-export.ts`:

```typescript
import type { ReportData, ReportColumn } from './types';

/**
 * Format a cell value for CSV based on its column format.
 */
function formatCell(value: unknown, column: ReportColumn): string {
  if (value === null || value === undefined) return '';

  switch (column.format) {
    case 'currency':
      return typeof value === 'number' ? value.toFixed(2) : String(value);
    case 'percentage':
      return typeof value === 'number' ? `${value.toFixed(1)}%` : String(value);
    case 'number':
      return String(value);
    case 'date':
      return String(value);
    default:
      return String(value);
  }
}

/**
 * Escape a CSV field (RFC 4180 compliant).
 * Wraps in quotes if the value contains commas, quotes, or newlines.
 */
function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

/**
 * Generate CSV string from report data.
 * @param data - Report data with columns and rows.
 * @param lang - Language for column headers ('en' or 'id').
 * @returns CSV string with BOM for Excel compatibility.
 */
export function generateCsv(data: ReportData, lang: 'en' | 'id' = 'en'): string {
  const lines: string[] = [];

  // Header row
  const headers = data.columns.map(col =>
    escapeCsv(lang === 'id' ? col.label_id : col.label_en)
  );
  lines.push(headers.join(','));

  // Data rows
  for (const row of data.rows) {
    const cells = data.columns.map(col => {
      const value = row[col.key];
      return escapeCsv(formatCell(value, col));
    });
    lines.push(cells.join(','));
  }

  // BOM + content (BOM helps Excel detect UTF-8)
  return '\ufeff' + lines.join('\r\n');
}

/**
 * Trigger a CSV file download in the browser.
 */
export function downloadCsv(data: ReportData, lang: 'en' | 'id' = 'en'): void {
  const csv = generateCsv(data, lang);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const title = lang === 'id' ? data.title_id : data.title_en;
  const filename = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_${data.config.date_from}_${data.config.date_to}.csv`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 3: Write CSV export tests**

Create `src/lib/modules/reports/csv-export.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generateCsv } from './csv-export';
import type { ReportData } from './types';

const sampleReport: ReportData = {
  title_en: 'Daily Sales Report',
  title_id: 'Laporan Penjualan Harian',
  columns: [
    { key: 'date', label_en: 'Date', label_id: 'Tanggal', format: 'date' },
    { key: 'total', label_en: 'Total', label_id: 'Total', format: 'currency' },
    { key: 'items', label_en: 'Items', label_id: 'Item', format: 'number' },
  ],
  rows: [
    { date: '2026-03-01', total: 150000, items: 5 },
    { date: '2026-03-02', total: 225000, items: 8 },
    { date: '2026-03-03', total: 0, items: 0 },
  ],
  generated_at: '2026-03-19T10:00:00Z',
  config: {
    type: 'sales_daily',
    format: 'csv',
    outlet_id: 'outlet-1',
    date_from: '2026-03-01',
    date_to: '2026-03-03',
  },
};

describe('generateCsv', () => {
  it('should generate CSV with English headers', () => {
    const csv = generateCsv(sampleReport, 'en');

    expect(csv).toContain('\ufeff'); // BOM
    expect(csv).toContain('Date,Total,Items');
    expect(csv).toContain('2026-03-01,150000.00,5');
    expect(csv).toContain('2026-03-02,225000.00,8');
    expect(csv).toContain('2026-03-03,0.00,0');
  });

  it('should generate CSV with Indonesian headers', () => {
    const csv = generateCsv(sampleReport, 'id');

    expect(csv).toContain('Tanggal,Total,Item');
  });

  it('should escape fields containing commas', () => {
    const report: ReportData = {
      ...sampleReport,
      columns: [
        { key: 'name', label_en: 'Name', label_id: 'Nama', format: 'text' },
      ],
      rows: [
        { name: 'Smith, John' },
      ],
    };

    const csv = generateCsv(report, 'en');
    expect(csv).toContain('"Smith, John"');
  });

  it('should escape fields containing double quotes', () => {
    const report: ReportData = {
      ...sampleReport,
      columns: [
        { key: 'title', label_en: 'Title', label_id: 'Judul', format: 'text' },
      ],
      rows: [
        { title: 'The "Great" Book' },
      ],
    };

    const csv = generateCsv(report, 'en');
    expect(csv).toContain('"The ""Great"" Book"');
  });

  it('should handle null and undefined values', () => {
    const report: ReportData = {
      ...sampleReport,
      columns: [
        { key: 'a', label_en: 'A', label_id: 'A', format: 'text' },
        { key: 'b', label_en: 'B', label_id: 'B', format: 'number' },
      ],
      rows: [
        { a: null, b: undefined },
      ],
    };

    const csv = generateCsv(report, 'en');
    const lines = csv.split('\r\n');
    // Data line should be just a comma (two empty fields)
    expect(lines[1]).toBe(',');
  });

  it('should format percentage values correctly', () => {
    const report: ReportData = {
      ...sampleReport,
      columns: [
        { key: 'rate', label_en: 'Rate', label_id: 'Rate', format: 'percentage' },
      ],
      rows: [
        { rate: 15.678 },
      ],
    };

    const csv = generateCsv(report, 'en');
    expect(csv).toContain('15.7%');
  });
});
```

- [ ] **Step 4: Implement report service (data fetching + export orchestration)**

Create `src/lib/modules/reports/service.ts`:

```typescript
import { getSupabase } from '$lib/supabase/client';
import type { ReportConfig, ReportData, ExportFormat } from './types';
import { REPORT_SCHEMAS } from './types';
import { downloadCsv } from './csv-export';

/**
 * Fetch report data from Supabase based on config.
 */
export async function fetchReportData(config: ReportConfig): Promise<ReportData> {
  const schema = REPORT_SCHEMAS[config.type];
  if (!schema) throw new Error(`Unknown report type: ${config.type}`);

  const supabase = getSupabase();
  let rows: Record<string, unknown>[] = [];

  switch (config.type) {
    case 'sales_daily':
    case 'sales_weekly':
    case 'sales_monthly':
      rows = await fetchSalesReport(supabase, config);
      break;
    case 'inventory_status':
      rows = await fetchInventoryStatus(supabase, config);
      break;
    case 'stock_movement':
      rows = await fetchStockMovement(supabase, config);
      break;
    case 'dead_stock':
      rows = await fetchDeadStock(supabase, config);
      break;
    case 'profit_margin':
      rows = await fetchProfitMargin(supabase, config);
      break;
    case 'consignment_summary':
      rows = await fetchConsignmentSummary(supabase, config);
      break;
    case 'supplier_performance':
      rows = await fetchSupplierPerformance(supabase, config);
      break;
    case 'lending_sessions':
      rows = await fetchLendingSessions(supabase, config);
      break;
  }

  return {
    title_en: schema.title_en,
    title_id: schema.title_id,
    columns: schema.columns,
    rows,
    generated_at: new Date().toISOString(),
    config,
  };
}

/**
 * Export a report in the specified format.
 * CSV: client-side download.
 * PDF/Excel: call Edge Function, receive file, download.
 */
export async function exportReport(
  config: ReportConfig,
  lang: 'en' | 'id' = 'en'
): Promise<void> {
  const data = await fetchReportData(config);

  switch (config.format) {
    case 'csv':
      downloadCsv(data, lang);
      break;
    case 'pdf':
      await exportViaPdfEdgeFunction(data, lang);
      break;
    case 'excel':
      await exportViaExcelEdgeFunction(data, lang);
      break;
  }
}

// --- Private data fetchers ---

async function fetchSalesReport(
  supabase: ReturnType<typeof getSupabase>,
  config: ReportConfig
): Promise<Record<string, unknown>[]> {
  // Use RPC for aggregated sales data
  const { data, error } = await supabase.rpc('get_sales_report', {
    p_outlet_id: config.outlet_id,
    p_date_from: config.date_from,
    p_date_to: config.date_to,
    p_period: config.type.replace('sales_', ''), // 'daily', 'weekly', 'monthly'
  });

  if (error) throw new Error(`Sales report failed: ${error.message}`);
  return (data ?? []) as Record<string, unknown>[];
}

async function fetchInventoryStatus(
  supabase: ReturnType<typeof getSupabase>,
  config: ReportConfig
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('inventory')
    .select('book_id, type, stock, price, condition')
    .eq('outlet_id', config.outlet_id)
    .order('stock', { ascending: true });

  if (error) throw new Error(`Inventory report failed: ${error.message}`);
  return (data ?? []) as Record<string, unknown>[];
}

async function fetchStockMovement(
  supabase: ReturnType<typeof getSupabase>,
  config: ReportConfig
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('stock_movement')
    .select('*, inventory!inner(book_id, outlet_id), staff(name)')
    .eq('inventory.outlet_id', config.outlet_id)
    .gte('created_at', config.date_from)
    .lte('created_at', config.date_to)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Stock movement report failed: ${error.message}`);
  return (data ?? []).map((row: any) => ({
    date: row.created_at,
    title: row.inventory?.book_id ?? '',
    type: row.type,
    quantity: row.quantity,
    staff: row.staff?.name ?? '',
    reason: row.reason ?? '',
  }));
}

async function fetchDeadStock(
  supabase: ReturnType<typeof getSupabase>,
  config: ReportConfig
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase.rpc('get_dead_stock', {
    p_outlet_id: config.outlet_id,
    p_days_threshold: 90,
  });

  if (error) throw new Error(`Dead stock report failed: ${error.message}`);
  return (data ?? []) as Record<string, unknown>[];
}

async function fetchProfitMargin(
  supabase: ReturnType<typeof getSupabase>,
  config: ReportConfig
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase.rpc('get_profit_margin_report', {
    p_outlet_id: config.outlet_id,
    p_date_from: config.date_from,
    p_date_to: config.date_to,
  });

  if (error) throw new Error(`Profit margin report failed: ${error.message}`);
  return (data ?? []) as Record<string, unknown>[];
}

async function fetchConsignmentSummary(
  supabase: ReturnType<typeof getSupabase>,
  config: ReportConfig
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase.rpc('get_consignment_summary', {
    p_outlet_id: config.outlet_id,
    p_date_from: config.date_from,
    p_date_to: config.date_to,
  });

  if (error) throw new Error(`Consignment report failed: ${error.message}`);
  return (data ?? []) as Record<string, unknown>[];
}

async function fetchSupplierPerformance(
  supabase: ReturnType<typeof getSupabase>,
  config: ReportConfig
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase.rpc('get_supplier_performance', {
    p_outlet_id: config.outlet_id,
    p_date_from: config.date_from,
    p_date_to: config.date_to,
  });

  if (error) throw new Error(`Supplier report failed: ${error.message}`);
  return (data ?? []) as Record<string, unknown>[];
}

async function fetchLendingSessions(
  supabase: ReturnType<typeof getSupabase>,
  config: ReportConfig
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('reading_session')
    .select('*')
    .eq('outlet_id', config.outlet_id)
    .gte('checked_in_at', config.date_from)
    .lte('checked_in_at', config.date_to)
    .order('checked_in_at', { ascending: false });

  if (error) throw new Error(`Lending report failed: ${error.message}`);
  return (data ?? []).map((row: any) => ({
    date: row.checked_in_at,
    title: row.book_id,
    customer: row.customer_name ?? '-',
    level: row.level,
    duration_min: row.checked_out_at
      ? Math.round((new Date(row.checked_out_at).getTime() - new Date(row.checked_in_at).getTime()) / 60000)
      : null,
    deposit: row.deposit_amount,
    status: row.status,
  }));
}

// --- Edge Function callers for PDF/Excel ---

async function exportViaPdfEdgeFunction(data: ReportData, lang: 'en' | 'id'): Promise<void> {
  const supabase = getSupabase();
  const { data: fileBlob, error } = await supabase.functions.invoke('export-pdf', {
    body: { report: data, lang },
  });

  if (error) throw new Error(`PDF export failed: ${error.message}`);

  const title = lang === 'id' ? data.title_id : data.title_en;
  downloadBlob(fileBlob, `${title}_${data.config.date_from}_${data.config.date_to}.pdf`, 'application/pdf');
}

async function exportViaExcelEdgeFunction(data: ReportData, lang: 'en' | 'id'): Promise<void> {
  const supabase = getSupabase();
  const { data: fileBlob, error } = await supabase.functions.invoke('export-excel', {
    body: { report: data, lang },
  });

  if (error) throw new Error(`Excel export failed: ${error.message}`);

  const title = lang === 'id' ? data.title_id : data.title_en;
  downloadBlob(
    fileBlob,
    `${title}_${data.config.date_from}_${data.config.date_to}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
}

function downloadBlob(data: Blob | ArrayBuffer, filename: string, mimeType: string): void {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 5: Create reports stores**

Create `src/lib/modules/reports/stores.svelte.ts`:

```typescript
import type { ReportConfig, ExportProgress } from './types';
import { exportReport } from './service';

let progress = $state<ExportProgress>({ status: 'idle', progress: 0 });

export function getReportsStore() {
  return {
    get progress() { return progress; },

    async export(config: ReportConfig, lang: 'en' | 'id' = 'en'): Promise<void> {
      progress = { status: 'fetching', progress: 20 };
      try {
        progress = { status: 'generating', progress: 50 };
        await exportReport(config, lang);
        progress = { status: 'downloading', progress: 80 };
        // Small delay so user sees the "downloading" state
        await new Promise(r => setTimeout(r, 300));
        progress = { status: 'done', progress: 100 };
      } catch (e) {
        progress = {
          status: 'error',
          progress: 0,
          error: e instanceof Error ? e.message : 'Export failed',
        };
      }
    },

    reset() {
      progress = { status: 'idle', progress: 0 };
    },
  };
}
```

---

## Task 6: PDF & Excel Export Edge Functions

**Files:**
- Create: `supabase/functions/export-pdf/index.ts`
- Create: `supabase/functions/export-excel/index.ts`

- [ ] **Step 1: Implement PDF export Edge Function**

Create `supabase/functions/export-pdf/index.ts`:

```typescript
// supabase/functions/export-pdf/index.ts
// Generates PDF reports using jsPDF (Deno-compatible ESM build).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

// jsPDF ESM import for Deno
// @ts-ignore: Deno-style import
import { jsPDF } from 'https://esm.sh/jspdf@2.5.1';
// @ts-ignore: Deno-style import
import autoTable from 'https://esm.sh/jspdf-autotable@3.8.2';

interface ReportColumn {
  key: string;
  label_en: string;
  label_id: string;
  format?: string;
}

interface ReportData {
  title_en: string;
  title_id: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  generated_at: string;
  config: { date_from: string; date_to: string };
}

function formatCell(value: unknown, format?: string): string {
  if (value === null || value === undefined) return '-';
  switch (format) {
    case 'currency':
      return `Rp${Number(value).toLocaleString('id-ID')}`;
    case 'percentage':
      return `${Number(value).toFixed(1)}%`;
    case 'number':
      return Number(value).toLocaleString('id-ID');
    default:
      return String(value);
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { report, lang = 'en' }: { report: ReportData; lang: 'en' | 'id' } = await req.json();

    const title = lang === 'id' ? report.title_id : report.title_en;
    const headers = report.columns.map(c => lang === 'id' ? c.label_id : c.label_en);

    // Create PDF (A4 landscape for wide reports)
    const isWide = report.columns.length > 5;
    const doc = new jsPDF({
      orientation: isWide ? 'landscape' : 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    // Title
    doc.setFontSize(16);
    doc.text(title, 14, 20);

    // Subtitle (date range)
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(
      `${report.config.date_from} — ${report.config.date_to}`,
      14, 28
    );
    doc.text(
      `${lang === 'id' ? 'Dibuat' : 'Generated'}: ${new Date(report.generated_at).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US')}`,
      14, 33
    );

    // Table
    const body = report.rows.map(row =>
      report.columns.map(col => formatCell(row[col.key], col.format))
    );

    autoTable(doc, {
      head: [headers],
      body,
      startY: 38,
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [79, 70, 60], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 243, 240] },
      margin: { left: 14, right: 14 },
    });

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `Libris Cafe — ${lang === 'id' ? 'Halaman' : 'Page'} ${i}/${pageCount}`,
        14,
        doc.internal.pageSize.height - 10
      );
    }

    // Output as arraybuffer
    const pdfOutput = doc.output('arraybuffer');

    return new Response(pdfOutput, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${title}.pdf"`,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
```

- [ ] **Step 2: Implement Excel export Edge Function**

Create `supabase/functions/export-excel/index.ts`:

```typescript
// supabase/functions/export-excel/index.ts
// Generates Excel (.xlsx) reports using ExcelJS.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

// @ts-ignore: Deno-style import
import ExcelJS from 'https://esm.sh/exceljs@4.4.0';

interface ReportColumn {
  key: string;
  label_en: string;
  label_id: string;
  format?: string;
}

interface ReportData {
  title_en: string;
  title_id: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  generated_at: string;
  config: { date_from: string; date_to: string };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { report, lang = 'en' }: { report: ReportData; lang: 'en' | 'id' } = await req.json();

    const title = lang === 'id' ? report.title_id : report.title_en;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Libris Cafe';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(title.substring(0, 31)); // Excel sheet name max 31 chars

    // Title row (merged)
    sheet.mergeCells(1, 1, 1, report.columns.length);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = title;
    titleCell.font = { size: 14, bold: true };
    titleCell.alignment = { horizontal: 'left' };

    // Date range row
    sheet.mergeCells(2, 1, 2, report.columns.length);
    const dateCell = sheet.getCell(2, 1);
    dateCell.value = `${report.config.date_from} — ${report.config.date_to}`;
    dateCell.font = { size: 10, color: { argb: 'FF666666' } };

    // Empty row
    // Row 3 is blank

    // Header row (row 4)
    const headerRow = sheet.getRow(4);
    report.columns.forEach((col, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = lang === 'id' ? col.label_id : col.label_en;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4F463C' }, // Dark brown (matches cafe theme)
      };
      cell.alignment = { horizontal: 'center' };
      cell.border = {
        bottom: { style: 'thin' },
      };
    });

    // Data rows (starting at row 5)
    report.rows.forEach((row, rowIdx) => {
      const excelRow = sheet.getRow(5 + rowIdx);
      report.columns.forEach((col, colIdx) => {
        const cell = excelRow.getCell(colIdx + 1);
        const value = row[col.key];

        // Set value with proper type
        switch (col.format) {
          case 'currency':
            cell.value = typeof value === 'number' ? value : 0;
            cell.numFmt = '#,##0';
            break;
          case 'percentage':
            cell.value = typeof value === 'number' ? value / 100 : 0;
            cell.numFmt = '0.0%';
            break;
          case 'number':
            cell.value = typeof value === 'number' ? value : 0;
            cell.numFmt = '#,##0';
            break;
          case 'date':
            cell.value = value ? new Date(String(value)) : '';
            cell.numFmt = 'yyyy-mm-dd';
            break;
          default:
            cell.value = value !== null && value !== undefined ? String(value) : '';
        }

        // Alternate row shading
        if (rowIdx % 2 === 1) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF5F3F0' },
          };
        }
      });
    });

    // Auto-fit column widths (approximate)
    report.columns.forEach((col, i) => {
      const headerLen = (lang === 'id' ? col.label_id : col.label_en).length;
      const maxDataLen = report.rows.reduce((max, row) => {
        const val = String(row[col.key] ?? '');
        return Math.max(max, val.length);
      }, 0);
      sheet.getColumn(i + 1).width = Math.min(40, Math.max(10, headerLen, maxDataLen) + 2);
    });

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    return new Response(buffer, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${title}.xlsx"`,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
```

- [ ] **Step 3: Create shared CORS headers**

Create `supabase/functions/_shared/cors.ts`:

```typescript
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
```

- [ ] **Step 4: Deploy Edge Functions**

```bash
npx supabase functions deploy export-pdf
npx supabase functions deploy export-excel
```

Verify by calling each function with sample data from the Supabase Dashboard Functions panel.

---

## Task 7: Prediction Engine — Sales Velocity & Restock Scoring

**Files:**
- Create: `src/lib/modules/prediction/types.ts`
- Create: `src/lib/modules/prediction/engine.ts`
- Create: `src/lib/modules/prediction/engine.test.ts`
- Create: `src/lib/modules/prediction/stores.svelte.ts`

- [ ] **Step 1: Define prediction types**

Create `src/lib/modules/prediction/types.ts`:

```typescript
export interface SalesVelocity {
  inventory_id: string;
  book_id: string;
  outlet_id: string;
  current_stock: number;
  min_stock: number;
  units_sold_30d: number;
  units_sold_7d: number;
  avg_daily_sales: number;
  days_until_stockout: number | null;
}

export type Urgency = 'critical' | 'urgent' | 'warning' | 'low' | 'ok';

export interface RestockRecommendation {
  inventory_id: string;
  book_id: string;
  current_stock: number;
  min_stock: number;
  avg_daily_sales: number;
  days_until_stockout: number | null;
  units_sold_30d: number;
  units_sold_7d: number;
  suggested_quantity: number;
  urgency: Urgency;
  restock_score: number;
  /** Denormalized book title from Yjs */
  book_title?: string;
}

export interface PredictionSummary {
  total_items: number;
  critical_count: number;
  urgent_count: number;
  warning_count: number;
  avg_days_until_stockout: number | null;
  top_sellers: { book_id: string; units_sold_30d: number; book_title?: string }[];
}

export interface DemandForecast {
  inventory_id: string;
  book_id: string;
  /** Projected units to sell in next 7 days based on weighted moving average. */
  forecast_7d: number;
  /** Projected units to sell in next 30 days. */
  forecast_30d: number;
  /** Trend direction. */
  trend: 'rising' | 'stable' | 'declining';
}
```

- [ ] **Step 2: Implement prediction engine**

Create `src/lib/modules/prediction/engine.ts`:

```typescript
import { getSupabase } from '$lib/supabase/client';
import type {
  SalesVelocity,
  RestockRecommendation,
  PredictionSummary,
  DemandForecast,
  Urgency,
} from './types';

/**
 * Fetch sales velocity data from the materialized view.
 */
export async function getSalesVelocity(outletId: string): Promise<SalesVelocity[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('mv_sales_velocity')
    .select('*')
    .eq('outlet_id', outletId);

  if (error) throw new Error(`Failed to fetch sales velocity: ${error.message}`);
  return (data ?? []) as SalesVelocity[];
}

/**
 * Get restock recommendations from the RPC function.
 */
export async function getRestockRecommendations(
  outletId: string,
  leadTimeDays: number = 7
): Promise<RestockRecommendation[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('get_restock_recommendations', {
    p_outlet_id: outletId,
    p_lead_time_days: leadTimeDays,
  });

  if (error) throw new Error(`Failed to fetch restock recommendations: ${error.message}`);
  return (data ?? []) as RestockRecommendation[];
}

/**
 * Refresh the materialized view (call periodically or on-demand).
 */
export async function refreshVelocityData(): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('refresh_sales_velocity');
  if (error) throw new Error(`Failed to refresh velocity data: ${error.message}`);
}

/**
 * Compute demand forecast using weighted moving average.
 * Gives more weight to recent sales (7d) vs older (30d).
 *
 * Client-side computation from velocity data.
 */
export function computeDemandForecast(velocityData: SalesVelocity[]): DemandForecast[] {
  return velocityData
    .filter(v => v.units_sold_30d > 0)
    .map(v => {
      const dailyRate30d = v.avg_daily_sales;
      const dailyRate7d = v.units_sold_7d / 7;

      // Weighted: 60% recent (7d), 40% longer-term (30d)
      const weightedDailyRate = dailyRate7d * 0.6 + dailyRate30d * 0.4;

      // Determine trend by comparing 7d rate to 30d rate
      const ratio = dailyRate30d > 0 ? dailyRate7d / dailyRate30d : 1;
      let trend: 'rising' | 'stable' | 'declining';
      if (ratio > 1.2) trend = 'rising';
      else if (ratio < 0.8) trend = 'declining';
      else trend = 'stable';

      return {
        inventory_id: v.inventory_id,
        book_id: v.book_id,
        forecast_7d: Math.round(weightedDailyRate * 7 * 10) / 10,
        forecast_30d: Math.round(weightedDailyRate * 30 * 10) / 10,
        trend,
      };
    });
}

/**
 * Compute prediction summary from velocity data.
 */
export function computeSummary(
  velocityData: SalesVelocity[],
  recommendations: RestockRecommendation[]
): PredictionSummary {
  const urgencyCounts = recommendations.reduce(
    (acc, r) => {
      acc[r.urgency] = (acc[r.urgency] || 0) + 1;
      return acc;
    },
    {} as Record<Urgency, number>
  );

  const itemsWithStockout = velocityData.filter(v => v.days_until_stockout !== null);
  const avgStockout =
    itemsWithStockout.length > 0
      ? itemsWithStockout.reduce((sum, v) => sum + (v.days_until_stockout ?? 0), 0) / itemsWithStockout.length
      : null;

  // Top 5 sellers by 30d volume
  const topSellers = [...velocityData]
    .sort((a, b) => b.units_sold_30d - a.units_sold_30d)
    .slice(0, 5)
    .map(v => ({
      book_id: v.book_id,
      units_sold_30d: v.units_sold_30d,
    }));

  return {
    total_items: velocityData.length,
    critical_count: urgencyCounts.critical ?? 0,
    urgent_count: urgencyCounts.urgent ?? 0,
    warning_count: urgencyCounts.warning ?? 0,
    avg_days_until_stockout: avgStockout !== null ? Math.round(avgStockout) : null,
    top_sellers: topSellers,
  };
}

/**
 * Classify urgency from days_until_stockout and stock levels.
 * Used client-side when RPC isn't available.
 */
export function classifyUrgency(
  currentStock: number,
  minStock: number,
  daysUntilStockout: number | null,
  leadTimeDays: number = 7
): Urgency {
  if (currentStock <= 0) return 'critical';
  if (daysUntilStockout !== null && daysUntilStockout <= leadTimeDays) return 'urgent';
  if (daysUntilStockout !== null && daysUntilStockout <= leadTimeDays * 2) return 'warning';
  if (currentStock <= minStock) return 'low';
  return 'ok';
}

/**
 * Calculate suggested restock quantity.
 */
export function suggestRestockQuantity(
  avgDailySales: number,
  leadTimeDays: number = 7,
  bufferDays: number = 14,
  minStock: number = 1
): number {
  if (avgDailySales <= 0) return minStock;
  return Math.ceil(avgDailySales * (leadTimeDays + bufferDays));
}
```

- [ ] **Step 3: Write prediction engine tests**

Create `src/lib/modules/prediction/engine.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  computeDemandForecast,
  computeSummary,
  classifyUrgency,
  suggestRestockQuantity,
} from './engine';
import type { SalesVelocity, RestockRecommendation } from './types';

describe('computeDemandForecast', () => {
  it('should compute weighted forecast from velocity data', () => {
    const data: SalesVelocity[] = [
      {
        inventory_id: 'inv-1',
        book_id: 'book-1',
        outlet_id: 'outlet-1',
        current_stock: 10,
        min_stock: 2,
        units_sold_30d: 30,
        units_sold_7d: 14,
        avg_daily_sales: 1.0,
        days_until_stockout: 10,
      },
    ];

    const forecasts = computeDemandForecast(data);

    expect(forecasts).toHaveLength(1);
    const f = forecasts[0];
    // 7d rate = 14/7 = 2.0, 30d rate = 1.0
    // Weighted = 2.0*0.6 + 1.0*0.4 = 1.6
    expect(f.forecast_7d).toBeCloseTo(1.6 * 7, 0); // ~11.2
    expect(f.forecast_30d).toBeCloseTo(1.6 * 30, 0); // ~48.0
    expect(f.trend).toBe('rising'); // 7d rate (2.0) > 30d rate (1.0) * 1.2
  });

  it('should classify trend as declining when 7d rate is low', () => {
    const data: SalesVelocity[] = [
      {
        inventory_id: 'inv-2',
        book_id: 'book-2',
        outlet_id: 'outlet-1',
        current_stock: 5,
        min_stock: 1,
        units_sold_30d: 30,
        units_sold_7d: 3,
        avg_daily_sales: 1.0,
        days_until_stockout: 5,
      },
    ];

    const forecasts = computeDemandForecast(data);
    // 7d rate = 3/7 ≈ 0.43, ratio = 0.43/1.0 = 0.43 < 0.8
    expect(forecasts[0].trend).toBe('declining');
  });

  it('should classify trend as stable when rates are similar', () => {
    const data: SalesVelocity[] = [
      {
        inventory_id: 'inv-3',
        book_id: 'book-3',
        outlet_id: 'outlet-1',
        current_stock: 20,
        min_stock: 3,
        units_sold_30d: 30,
        units_sold_7d: 7,
        avg_daily_sales: 1.0,
        days_until_stockout: 20,
      },
    ];

    const forecasts = computeDemandForecast(data);
    // 7d rate = 7/7 = 1.0, ratio = 1.0/1.0 = 1.0 (between 0.8 and 1.2)
    expect(forecasts[0].trend).toBe('stable');
  });

  it('should filter out items with zero sales', () => {
    const data: SalesVelocity[] = [
      {
        inventory_id: 'inv-4',
        book_id: 'book-4',
        outlet_id: 'outlet-1',
        current_stock: 10,
        min_stock: 1,
        units_sold_30d: 0,
        units_sold_7d: 0,
        avg_daily_sales: 0,
        days_until_stockout: null,
      },
    ];

    const forecasts = computeDemandForecast(data);
    expect(forecasts).toHaveLength(0);
  });
});

describe('classifyUrgency', () => {
  it('should return critical when stock is 0', () => {
    expect(classifyUrgency(0, 2, null)).toBe('critical');
  });

  it('should return urgent when stockout is within lead time', () => {
    expect(classifyUrgency(3, 2, 5, 7)).toBe('urgent');
  });

  it('should return warning when stockout is within 2x lead time', () => {
    expect(classifyUrgency(10, 2, 12, 7)).toBe('warning');
  });

  it('should return low when stock is at or below min_stock', () => {
    expect(classifyUrgency(2, 2, 30, 7)).toBe('low');
  });

  it('should return ok when everything is fine', () => {
    expect(classifyUrgency(20, 2, 60, 7)).toBe('ok');
  });
});

describe('suggestRestockQuantity', () => {
  it('should calculate quantity for lead time + buffer', () => {
    // 2 units/day * (7 lead + 14 buffer) = 42
    expect(suggestRestockQuantity(2, 7, 14)).toBe(42);
  });

  it('should return min_stock when no sales', () => {
    expect(suggestRestockQuantity(0, 7, 14, 3)).toBe(3);
  });

  it('should ceil fractional quantities', () => {
    // 0.5 units/day * 21 days = 10.5 → 11
    expect(suggestRestockQuantity(0.5, 7, 14)).toBe(11);
  });
});

describe('computeSummary', () => {
  it('should compute summary from velocity and recommendations', () => {
    const velocity: SalesVelocity[] = [
      { inventory_id: 'a', book_id: 'b1', outlet_id: 'o', current_stock: 5, min_stock: 2, units_sold_30d: 20, units_sold_7d: 7, avg_daily_sales: 0.67, days_until_stockout: 7.5 },
      { inventory_id: 'b', book_id: 'b2', outlet_id: 'o', current_stock: 0, min_stock: 1, units_sold_30d: 10, units_sold_7d: 3, avg_daily_sales: 0.33, days_until_stockout: 0 },
      { inventory_id: 'c', book_id: 'b3', outlet_id: 'o', current_stock: 50, min_stock: 5, units_sold_30d: 5, units_sold_7d: 1, avg_daily_sales: 0.17, days_until_stockout: 300 },
    ];

    const recs: RestockRecommendation[] = [
      { inventory_id: 'a', book_id: 'b1', current_stock: 5, min_stock: 2, avg_daily_sales: 0.67, days_until_stockout: 7.5, units_sold_30d: 20, units_sold_7d: 7, suggested_quantity: 14, urgency: 'warning', restock_score: 60 },
      { inventory_id: 'b', book_id: 'b2', current_stock: 0, min_stock: 1, avg_daily_sales: 0.33, days_until_stockout: 0, units_sold_30d: 10, units_sold_7d: 3, suggested_quantity: 7, urgency: 'critical', restock_score: 100 },
    ];

    const summary = computeSummary(velocity, recs);

    expect(summary.total_items).toBe(3);
    expect(summary.critical_count).toBe(1);
    expect(summary.warning_count).toBe(1);
    expect(summary.top_sellers).toHaveLength(3);
    expect(summary.top_sellers[0].book_id).toBe('b1'); // Highest 30d sales
    expect(summary.avg_days_until_stockout).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 4: Create prediction stores**

Create `src/lib/modules/prediction/stores.svelte.ts`:

```typescript
import type {
  SalesVelocity,
  RestockRecommendation,
  PredictionSummary,
  DemandForecast,
} from './types';
import {
  getSalesVelocity,
  getRestockRecommendations,
  refreshVelocityData,
  computeDemandForecast,
  computeSummary,
} from './engine';

let velocityData = $state<SalesVelocity[]>([]);
let recommendations = $state<RestockRecommendation[]>([]);
let forecasts = $state<DemandForecast[]>([]);
let summary = $state<PredictionSummary | null>(null);
let isLoading = $state(false);
let error = $state<string | null>(null);

export function getPredictionStore() {
  return {
    get velocityData() { return velocityData; },
    get recommendations() { return recommendations; },
    get forecasts() { return forecasts; },
    get summary() { return summary; },
    get isLoading() { return isLoading; },
    get error() { return error; },

    async refresh(outletId: string, leadTimeDays: number = 7): Promise<void> {
      isLoading = true;
      error = null;
      try {
        // Refresh materialized view first
        await refreshVelocityData();

        // Fetch updated data
        const [vel, recs] = await Promise.all([
          getSalesVelocity(outletId),
          getRestockRecommendations(outletId, leadTimeDays),
        ]);

        velocityData = vel;
        recommendations = recs;
        forecasts = computeDemandForecast(vel);
        summary = computeSummary(vel, recs);
      } catch (e) {
        error = e instanceof Error ? e.message : 'Failed to load prediction data';
      } finally {
        isLoading = false;
      }
    },
  };
}
```

---

## Task 8: Lending UI — Staff Pages & Components

**Files:**
- Create: `src/routes/staff/lending/+page.svelte`
- Create: `src/lib/components/lending/CheckInDialog.svelte`
- Create: `src/lib/components/lending/CheckOutDialog.svelte`
- Create: `src/lib/components/lending/SessionCard.svelte`
- Create: `src/lib/components/lending/OverdueAlert.svelte`

- [ ] **Step 1: Create the lending dashboard page**

Create `src/routes/staff/lending/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/index.svelte';
  import { getLendingStore } from '$lib/modules/lending/stores.svelte';
  import { checkIn, checkOut } from '$lib/modules/lending/service';
  import CheckInDialog from '$lib/components/lending/CheckInDialog.svelte';
  import CheckOutDialog from '$lib/components/lending/CheckOutDialog.svelte';
  import SessionCard from '$lib/components/lending/SessionCard.svelte';
  import OverdueAlert from '$lib/components/lending/OverdueAlert.svelte';
  import type { CheckInParams, CheckOutParams, ReadingSession } from '$lib/modules/lending/types';

  const lending = getLendingStore();
  let showCheckIn = $state(false);
  let showCheckOut = $state(false);
  let selectedSession = $state<ReadingSession | null>(null);

  // TODO: get from auth store
  const outletId = 'current-outlet-id';
  const staffId = 'current-staff-id';

  onMount(async () => {
    await lending.refreshSessions(outletId);
    await lending.refreshStats(outletId);
    // Check for overdue sessions
    await lending.checkOverdue(outletId);
  });

  async function handleCheckIn(params: Omit<CheckInParams, 'outlet_id' | 'staff_id'>) {
    await checkIn({ ...params, outlet_id: outletId, staff_id: staffId });
    showCheckIn = false;
    await lending.refreshSessions(outletId);
    await lending.refreshStats(outletId);
  }

  async function handleCheckOut(params: Omit<CheckOutParams, 'staff_id'>) {
    await checkOut({ ...params, staff_id: staffId });
    showCheckOut = false;
    selectedSession = null;
    await lending.refreshSessions(outletId);
    await lending.refreshStats(outletId);
  }

  function openCheckOut(session: ReadingSession) {
    selectedSession = session;
    showCheckOut = true;
  }
</script>

<div class="max-w-2xl mx-auto p-4 space-y-4">
  <!-- Header + New Check-in button -->
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-bold">{t('lending.title')}</h1>
    <button
      class="btn btn-primary btn-sm"
      onclick={() => showCheckIn = true}
    >
      + {t('lending.checkIn')}
    </button>
  </div>

  <!-- Stats cards -->
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
    <div class="bg-base-200 rounded-xl p-3 text-center">
      <div class="text-2xl font-bold text-primary">{lending.stats.active_count}</div>
      <div class="text-xs text-base-content/60">{t('lending.active')}</div>
    </div>
    <div class="bg-base-200 rounded-xl p-3 text-center">
      <div class="text-2xl font-bold text-error">{lending.stats.overdue_count}</div>
      <div class="text-xs text-base-content/60">{t('lending.overdue')}</div>
    </div>
    <div class="bg-base-200 rounded-xl p-3 text-center">
      <div class="text-2xl font-bold">{lending.stats.today_checkins}</div>
      <div class="text-xs text-base-content/60">{t('lending.todayIn')}</div>
    </div>
    <div class="bg-base-200 rounded-xl p-3 text-center">
      <div class="text-2xl font-bold">{lending.stats.today_checkouts}</div>
      <div class="text-xs text-base-content/60">{t('lending.todayOut')}</div>
    </div>
  </div>

  <!-- Overdue alerts -->
  {#if lending.overdueSessions.length > 0}
    <OverdueAlert sessions={lending.overdueSessions} onaction={openCheckOut} />
  {/if}

  <!-- Active sessions list -->
  <div class="space-y-2">
    <h2 class="font-semibold text-base-content/80">{t('lending.activeSessions')}</h2>
    {#if lending.isLoading}
      <div class="text-center py-8 text-base-content/40">{t('common.loading')}</div>
    {:else if lending.activeSessions.length === 0}
      <div class="text-center py-8 text-base-content/40">{t('lending.noSessions')}</div>
    {:else}
      {#each lending.activeSessions as session (session.id)}
        <SessionCard
          {session}
          oncheckout={() => openCheckOut(session)}
        />
      {/each}
    {/if}
  </div>
</div>

<!-- Dialogs -->
{#if showCheckIn}
  <CheckInDialog
    onsubmit={handleCheckIn}
    onclose={() => showCheckIn = false}
  />
{/if}

{#if showCheckOut && selectedSession}
  <CheckOutDialog
    session={selectedSession}
    onsubmit={handleCheckOut}
    onclose={() => { showCheckOut = false; selectedSession = null; }}
  />
{/if}
```

- [ ] **Step 2: Create CheckInDialog component**

Create `src/lib/components/lending/CheckInDialog.svelte`:

```svelte
<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import type { CheckInParams, LendingLevel } from '$lib/modules/lending/types';

  let {
    onsubmit,
    onclose,
  }: {
    onsubmit: (params: Omit<CheckInParams, 'outlet_id' | 'staff_id'>) => void;
    onclose: () => void;
  } = $props();

  let level = $state<LendingLevel>('semi_formal');
  let bookSearch = $state('');
  let selectedBookId = $state('');
  let selectedInventoryId = $state('');
  let durationMinutes = $state(120);
  let customerName = $state('');
  let customerContact = $state('');
  let depositAmount = $state(0);
  let notes = $state('');
  let isSubmitting = $state(false);

  async function handleSubmit() {
    if (!selectedBookId || !selectedInventoryId) return;
    isSubmitting = true;
    try {
      onsubmit({
        inventory_id: selectedInventoryId,
        book_id: selectedBookId,
        level,
        duration_minutes: level === 'formal' ? durationMinutes : undefined,
        customer_name: level === 'formal' ? customerName : undefined,
        customer_contact: level === 'formal' ? customerContact : undefined,
        deposit_amount: level === 'formal' ? depositAmount : undefined,
        notes: notes || undefined,
      });
    } finally {
      isSubmitting = false;
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onclick={onclose}>
  <div
    class="bg-base-100 rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto p-5 space-y-4"
    onclick={(e) => e.stopPropagation()}
  >
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-bold">{t('lending.newCheckIn')}</h2>
      <button class="btn btn-ghost btn-sm btn-circle" onclick={onclose}>X</button>
    </div>

    <!-- Book search -->
    <div>
      <label class="text-sm font-medium">{t('lending.selectBook')}</label>
      <input
        type="text"
        placeholder={t('lending.searchBook')}
        bind:value={bookSearch}
        class="w-full mt-1 px-3 py-2 rounded-lg border border-base-300 bg-base-200 text-sm"
      />
      <!-- TODO: integrate with Yjs book search + inventory lookup -->
      <p class="text-xs text-base-content/50 mt-1">{t('lending.scanOrSearch')}</p>
    </div>

    <!-- Level selection -->
    <div>
      <label class="text-sm font-medium">{t('lending.level')}</label>
      <div class="flex gap-2 mt-1">
        <button
          class="flex-1 py-2 rounded-lg text-sm font-medium transition-colors {level === 'semi_formal' ? 'bg-primary text-primary-content' : 'bg-base-200'}"
          onclick={() => level = 'semi_formal'}
        >
          {t('lending.semiFormal')}
        </button>
        <button
          class="flex-1 py-2 rounded-lg text-sm font-medium transition-colors {level === 'formal' ? 'bg-primary text-primary-content' : 'bg-base-200'}"
          onclick={() => level = 'formal'}
        >
          {t('lending.formal')}
        </button>
      </div>
    </div>

    <!-- Formal-only fields -->
    {#if level === 'formal'}
      <div class="space-y-3 border-l-2 border-primary/30 pl-3">
        <div>
          <label class="text-sm font-medium">{t('lending.customerName')}</label>
          <input type="text" bind:value={customerName}
            class="w-full mt-1 px-3 py-2 rounded-lg border border-base-300 bg-base-200 text-sm" />
        </div>
        <div>
          <label class="text-sm font-medium">{t('lending.customerContact')}</label>
          <input type="tel" bind:value={customerContact}
            class="w-full mt-1 px-3 py-2 rounded-lg border border-base-300 bg-base-200 text-sm"
            placeholder="08xxxxxxxxxx" />
        </div>
        <div>
          <label class="text-sm font-medium">{t('lending.duration')}</label>
          <select bind:value={durationMinutes}
            class="w-full mt-1 px-3 py-2 rounded-lg border border-base-300 bg-base-200 text-sm">
            <option value={30}>30 {t('common.minutes')}</option>
            <option value={60}>1 {t('common.hour')}</option>
            <option value={120}>2 {t('common.hours')}</option>
            <option value={180}>3 {t('common.hours')}</option>
            <option value={240}>4 {t('common.hours')}</option>
          </select>
        </div>
        <div>
          <label class="text-sm font-medium">{t('lending.depositAmount')}</label>
          <input type="number" bind:value={depositAmount}
            class="w-full mt-1 px-3 py-2 rounded-lg border border-base-300 bg-base-200 text-sm"
            min="0" step="5000" placeholder="Rp" />
        </div>
      </div>
    {/if}

    <!-- Notes -->
    <div>
      <label class="text-sm font-medium">{t('common.notes')}</label>
      <textarea bind:value={notes}
        class="w-full mt-1 px-3 py-2 rounded-lg border border-base-300 bg-base-200 text-sm"
        rows="2"></textarea>
    </div>

    <!-- Submit -->
    <button
      class="w-full py-3 rounded-xl bg-primary text-primary-content font-semibold disabled:opacity-50"
      disabled={!selectedBookId || isSubmitting}
      onclick={handleSubmit}
    >
      {isSubmitting ? t('common.loading') : t('lending.checkIn')}
    </button>
  </div>
</div>
```

- [ ] **Step 3: Create CheckOutDialog component**

Create `src/lib/components/lending/CheckOutDialog.svelte`:

```svelte
<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import type { ReadingSession, CheckOutParams } from '$lib/modules/lending/types';

  let {
    session,
    onsubmit,
    onclose,
  }: {
    session: ReadingSession;
    onsubmit: (params: Omit<CheckOutParams, 'staff_id'>) => void;
    onclose: () => void;
  } = $props();

  let refundDeposit = $state(true);
  let notes = $state('');
  let isSubmitting = $state(false);

  const duration = $derived(() => {
    const inTime = new Date(session.checked_in_at).getTime();
    const now = Date.now();
    const minutes = Math.round((now - inTime) / 60000);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  });

  const isOverdue = $derived(session.status === 'overdue');
  const hasFormalDeposit = $derived(session.level === 'formal' && session.deposit_amount > 0);

  async function handleSubmit() {
    isSubmitting = true;
    try {
      onsubmit({
        session_id: session.id,
        refund_deposit: hasFormalDeposit ? refundDeposit : false,
        notes: notes || undefined,
      });
    } finally {
      isSubmitting = false;
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onclick={onclose}>
  <div
    class="bg-base-100 rounded-t-2xl sm:rounded-2xl w-full max-w-md p-5 space-y-4"
    onclick={(e) => e.stopPropagation()}
  >
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-bold">{t('lending.checkOutTitle')}</h2>
      <button class="btn btn-ghost btn-sm btn-circle" onclick={onclose}>X</button>
    </div>

    <!-- Session info -->
    <div class="bg-base-200 rounded-xl p-3 space-y-1">
      <div class="text-sm"><span class="font-medium">{t('lending.book')}:</span> {session.book_id}</div>
      <div class="text-sm"><span class="font-medium">{t('lending.duration')}:</span> {duration()}</div>
      <div class="text-sm"><span class="font-medium">{t('lending.level')}:</span> {session.level === 'formal' ? t('lending.formal') : t('lending.semiFormal')}</div>
      {#if session.customer_name}
        <div class="text-sm"><span class="font-medium">{t('lending.customer')}:</span> {session.customer_name}</div>
      {/if}
      {#if isOverdue}
        <div class="text-sm text-error font-medium">{t('lending.overdueWarning')}</div>
      {/if}
    </div>

    <!-- Deposit handling -->
    {#if hasFormalDeposit}
      <div class="space-y-2">
        <label class="text-sm font-medium">{t('lending.deposit')}: Rp{session.deposit_amount.toLocaleString('id-ID')}</label>
        <div class="flex gap-2">
          <button
            class="flex-1 py-2 rounded-lg text-sm font-medium {refundDeposit ? 'bg-success text-success-content' : 'bg-base-200'}"
            onclick={() => refundDeposit = true}
          >
            {t('lending.refundDeposit')}
          </button>
          <button
            class="flex-1 py-2 rounded-lg text-sm font-medium {!refundDeposit ? 'bg-error text-error-content' : 'bg-base-200'}"
            onclick={() => refundDeposit = false}
          >
            {t('lending.forfeitDeposit')}
          </button>
        </div>
      </div>
    {/if}

    <!-- Notes -->
    <div>
      <label class="text-sm font-medium">{t('common.notes')}</label>
      <textarea bind:value={notes}
        class="w-full mt-1 px-3 py-2 rounded-lg border border-base-300 bg-base-200 text-sm"
        rows="2"
        placeholder={isOverdue ? t('lending.overdueNotes') : ''}></textarea>
    </div>

    <!-- Submit -->
    <button
      class="w-full py-3 rounded-xl bg-primary text-primary-content font-semibold disabled:opacity-50"
      disabled={isSubmitting}
      onclick={handleSubmit}
    >
      {isSubmitting ? t('common.loading') : t('lending.checkOut')}
    </button>
  </div>
</div>
```

- [ ] **Step 4: Create SessionCard component**

Create `src/lib/components/lending/SessionCard.svelte`:

```svelte
<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import type { ReadingSession } from '$lib/modules/lending/types';

  let { session, oncheckout }: { session: ReadingSession; oncheckout: () => void } = $props();

  const elapsedMinutes = $derived(() => {
    return Math.round((Date.now() - new Date(session.checked_in_at).getTime()) / 60000);
  });

  const formatElapsed = $derived(() => {
    const m = elapsedMinutes();
    const h = Math.floor(m / 60);
    const mins = m % 60;
    return h > 0 ? `${h}h ${mins}m` : `${mins}m`;
  });

  const isOverdue = $derived(session.status === 'overdue');
  const isFormal = $derived(session.level === 'formal');
</script>

<div class="bg-base-200 rounded-xl p-3 flex items-center gap-3 {isOverdue ? 'ring-2 ring-error/50' : ''}">
  <!-- Status indicator -->
  <div class="w-2 h-12 rounded-full {isOverdue ? 'bg-error' : 'bg-success'} shrink-0"></div>

  <!-- Info -->
  <div class="flex-1 min-w-0">
    <div class="font-medium text-sm truncate">{session.book_title ?? session.book_id}</div>
    <div class="text-xs text-base-content/60 flex items-center gap-2 mt-0.5">
      <span>{formatElapsed()}</span>
      <span class="inline-block w-1 h-1 rounded-full bg-base-content/30"></span>
      <span>{isFormal ? t('lending.formal') : t('lending.semiFormal')}</span>
      {#if session.customer_name}
        <span class="inline-block w-1 h-1 rounded-full bg-base-content/30"></span>
        <span class="truncate">{session.customer_name}</span>
      {/if}
    </div>
    {#if isFormal && session.expected_return_at}
      <div class="text-xs mt-0.5 {isOverdue ? 'text-error font-medium' : 'text-base-content/50'}">
        {t('lending.returnBy')}: {new Date(session.expected_return_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
      </div>
    {/if}
  </div>

  <!-- Check-out button -->
  <button
    class="btn btn-sm {isOverdue ? 'btn-error' : 'btn-outline'} shrink-0"
    onclick={oncheckout}
  >
    {t('lending.return')}
  </button>
</div>
```

- [ ] **Step 5: Create OverdueAlert component**

Create `src/lib/components/lending/OverdueAlert.svelte`:

```svelte
<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import type { ReadingSession } from '$lib/modules/lending/types';

  let { sessions, onaction }: {
    sessions: ReadingSession[];
    onaction: (session: ReadingSession) => void;
  } = $props();
</script>

<div class="bg-error/10 border border-error/30 rounded-xl p-3 space-y-2">
  <div class="flex items-center gap-2">
    <svg class="w-5 h-5 text-error shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
    <span class="text-sm font-semibold text-error">
      {t('lending.overdueCount', { count: sessions.length })}
    </span>
  </div>
  {#each sessions as session (session.id)}
    <button
      class="w-full text-left bg-base-100 rounded-lg p-2 flex items-center justify-between text-sm hover:bg-base-200 transition-colors"
      onclick={() => onaction(session)}
    >
      <span class="truncate">{session.book_title ?? session.book_id}</span>
      <span class="text-error text-xs shrink-0 ml-2">{t('lending.tapToReturn')}</span>
    </button>
  {/each}
</div>
```

---

## Task 9: Report & Prediction UI Pages

**Files:**
- Create: `src/routes/staff/reports/+page.svelte`
- Create: `src/routes/owner/prediction/+page.svelte`
- Create: `src/lib/components/reports/ReportBuilder.svelte`
- Create: `src/lib/components/reports/ExportButton.svelte`
- Create: `src/lib/components/prediction/RestockTable.svelte`
- Create: `src/lib/components/prediction/VelocityBadge.svelte`
- Create: `src/lib/components/prediction/StockoutChart.svelte`

- [ ] **Step 1: Create the reports page**

Create `src/routes/staff/reports/+page.svelte`:

```svelte
<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import ReportBuilder from '$lib/components/reports/ReportBuilder.svelte';
  import ExportButton from '$lib/components/reports/ExportButton.svelte';
  import { getReportsStore } from '$lib/modules/reports/stores.svelte';
  import type { ReportConfig } from '$lib/modules/reports/types';

  const reports = getReportsStore();

  let currentConfig = $state<ReportConfig | null>(null);

  function handleConfigChange(config: ReportConfig) {
    currentConfig = config;
  }

  async function handleExport() {
    if (!currentConfig) return;
    await reports.export(currentConfig);
  }
</script>

<div class="max-w-2xl mx-auto p-4 space-y-4">
  <h1 class="text-xl font-bold">{t('reports.title')}</h1>

  <ReportBuilder onchange={handleConfigChange} />

  {#if currentConfig}
    <ExportButton
      config={currentConfig}
      progress={reports.progress}
      onexport={handleExport}
    />
  {/if}

  {#if reports.progress.status === 'error'}
    <div class="bg-error/10 text-error text-sm rounded-lg p-3">
      {reports.progress.error}
    </div>
  {/if}
</div>
```

- [ ] **Step 2: Create ReportBuilder component**

Create `src/lib/components/reports/ReportBuilder.svelte`:

```svelte
<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import type { ReportConfig, ReportType, ExportFormat } from '$lib/modules/reports/types';
  import { REPORT_SCHEMAS } from '$lib/modules/reports/types';

  let { onchange }: { onchange: (config: ReportConfig) => void } = $props();

  let reportType = $state<ReportType>('sales_daily');
  let format = $state<ExportFormat>('csv');
  let dateFrom = $state(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  let dateTo = $state(new Date().toISOString().split('T')[0]);

  // TODO: get from auth store
  const outletId = 'current-outlet-id';

  const reportTypes = Object.entries(REPORT_SCHEMAS).map(([key, schema]) => ({
    value: key as ReportType,
    label_en: schema.title_en,
    label_id: schema.title_id,
  }));

  $effect(() => {
    onchange({
      type: reportType,
      format,
      outlet_id: outletId,
      date_from: dateFrom,
      date_to: dateTo,
    });
  });
</script>

<div class="bg-base-200 rounded-xl p-4 space-y-4">
  <!-- Report type -->
  <div>
    <label class="text-sm font-medium">{t('reports.type')}</label>
    <select bind:value={reportType}
      class="w-full mt-1 px-3 py-2 rounded-lg border border-base-300 bg-base-100 text-sm">
      {#each reportTypes as rt}
        <option value={rt.value}>{rt.label_en}</option>
      {/each}
    </select>
  </div>

  <!-- Date range -->
  <div class="grid grid-cols-2 gap-3">
    <div>
      <label class="text-sm font-medium">{t('reports.from')}</label>
      <input type="date" bind:value={dateFrom}
        class="w-full mt-1 px-3 py-2 rounded-lg border border-base-300 bg-base-100 text-sm" />
    </div>
    <div>
      <label class="text-sm font-medium">{t('reports.to')}</label>
      <input type="date" bind:value={dateTo}
        class="w-full mt-1 px-3 py-2 rounded-lg border border-base-300 bg-base-100 text-sm" />
    </div>
  </div>

  <!-- Export format -->
  <div>
    <label class="text-sm font-medium">{t('reports.format')}</label>
    <div class="flex gap-2 mt-1">
      {#each ['csv', 'pdf', 'excel'] as fmt}
        <button
          class="flex-1 py-2 rounded-lg text-sm font-medium transition-colors {format === fmt ? 'bg-primary text-primary-content' : 'bg-base-100 border border-base-300'}"
          onclick={() => format = fmt as ExportFormat}
        >
          {fmt.toUpperCase()}
        </button>
      {/each}
    </div>
  </div>
</div>
```

- [ ] **Step 3: Create ExportButton component**

Create `src/lib/components/reports/ExportButton.svelte`:

```svelte
<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import type { ReportConfig, ExportProgress } from '$lib/modules/reports/types';

  let { config, progress, onexport }: {
    config: ReportConfig;
    progress: ExportProgress;
    onexport: () => void;
  } = $props();

  const isExporting = $derived(
    progress.status === 'fetching' || progress.status === 'generating' || progress.status === 'downloading'
  );

  const statusText = $derived(() => {
    switch (progress.status) {
      case 'fetching': return t('reports.fetching');
      case 'generating': return t('reports.generating');
      case 'downloading': return t('reports.downloading');
      case 'done': return t('reports.done');
      case 'error': return t('reports.error');
      default: return '';
    }
  });
</script>

<div class="space-y-2">
  <button
    class="w-full py-3 rounded-xl font-semibold transition-all disabled:opacity-50
      {isExporting ? 'bg-base-300 text-base-content' : 'bg-primary text-primary-content'}"
    disabled={isExporting}
    onclick={onexport}
  >
    {#if isExporting}
      <span class="flex items-center justify-center gap-2">
        <svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
        {statusText()}
      </span>
    {:else}
      {t('reports.export')} {config.format.toUpperCase()}
    {/if}
  </button>

  {#if isExporting}
    <div class="w-full bg-base-300 rounded-full h-1.5">
      <div
        class="bg-primary h-1.5 rounded-full transition-all duration-300"
        style="width: {progress.progress}%"
      ></div>
    </div>
  {/if}
</div>
```

- [ ] **Step 4: Create the prediction dashboard page**

Create `src/routes/owner/prediction/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/index.svelte';
  import { getPredictionStore } from '$lib/modules/prediction/stores.svelte';
  import RestockTable from '$lib/components/prediction/RestockTable.svelte';
  import VelocityBadge from '$lib/components/prediction/VelocityBadge.svelte';
  import StockoutChart from '$lib/components/prediction/StockoutChart.svelte';

  const prediction = getPredictionStore();

  // TODO: get from auth store
  const outletId = 'current-outlet-id';
  let leadTimeDays = $state(7);

  onMount(() => {
    prediction.refresh(outletId, leadTimeDays);
  });

  function handleRefresh() {
    prediction.refresh(outletId, leadTimeDays);
  }
</script>

<div class="max-w-3xl mx-auto p-4 space-y-4">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-bold">{t('prediction.title')}</h1>
    <button class="btn btn-outline btn-sm" onclick={handleRefresh} disabled={prediction.isLoading}>
      {prediction.isLoading ? t('common.loading') : t('prediction.refresh')}
    </button>
  </div>

  <!-- Summary cards -->
  {#if prediction.summary}
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div class="bg-base-200 rounded-xl p-3 text-center">
        <div class="text-2xl font-bold">{prediction.summary.total_items}</div>
        <div class="text-xs text-base-content/60">{t('prediction.totalItems')}</div>
      </div>
      <div class="bg-error/10 rounded-xl p-3 text-center">
        <div class="text-2xl font-bold text-error">{prediction.summary.critical_count}</div>
        <div class="text-xs text-base-content/60">{t('prediction.critical')}</div>
      </div>
      <div class="bg-warning/10 rounded-xl p-3 text-center">
        <div class="text-2xl font-bold text-warning">{prediction.summary.urgent_count}</div>
        <div class="text-xs text-base-content/60">{t('prediction.urgent')}</div>
      </div>
      <div class="bg-base-200 rounded-xl p-3 text-center">
        <div class="text-2xl font-bold">
          {prediction.summary.avg_days_until_stockout !== null
            ? `${prediction.summary.avg_days_until_stockout}d`
            : '-'}
        </div>
        <div class="text-xs text-base-content/60">{t('prediction.avgStockout')}</div>
      </div>
    </div>
  {/if}

  <!-- Lead time config -->
  <div class="bg-base-200 rounded-xl p-3 flex items-center gap-3">
    <label class="text-sm font-medium shrink-0">{t('prediction.leadTime')}:</label>
    <input type="number" bind:value={leadTimeDays} min="1" max="90"
      class="w-20 px-2 py-1 rounded-lg border border-base-300 bg-base-100 text-sm text-center" />
    <span class="text-sm text-base-content/60">{t('common.days')}</span>
  </div>

  <!-- Stockout chart -->
  {#if prediction.velocityData.length > 0}
    <StockoutChart data={prediction.velocityData} />
  {/if}

  <!-- Restock recommendations table -->
  {#if prediction.recommendations.length > 0}
    <RestockTable recommendations={prediction.recommendations} />
  {:else if !prediction.isLoading}
    <div class="text-center py-8 text-base-content/40">
      {t('prediction.allGood')}
    </div>
  {/if}

  <!-- Top sellers with velocity badge -->
  {#if prediction.summary?.top_sellers.length}
    <div class="space-y-2">
      <h2 class="font-semibold">{t('prediction.topSellers')}</h2>
      {#each prediction.summary.top_sellers as seller}
        <div class="flex items-center justify-between bg-base-200 rounded-lg p-2">
          <span class="text-sm truncate">{seller.book_title ?? seller.book_id}</span>
          <VelocityBadge unitsSold30d={seller.units_sold_30d} />
        </div>
      {/each}
    </div>
  {/if}
</div>
```

- [ ] **Step 5: Create RestockTable component**

Create `src/lib/components/prediction/RestockTable.svelte`:

```svelte
<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import type { RestockRecommendation } from '$lib/modules/prediction/types';

  let { recommendations }: { recommendations: RestockRecommendation[] } = $props();

  const urgencyColors: Record<string, string> = {
    critical: 'bg-error text-error-content',
    urgent: 'bg-warning text-warning-content',
    warning: 'bg-amber-200 text-amber-800',
    low: 'bg-info/20 text-info',
    ok: 'bg-success/20 text-success',
  };
</script>

<div class="space-y-2">
  <h2 class="font-semibold">{t('prediction.restockRecommendations')}</h2>
  <div class="overflow-x-auto rounded-xl border border-base-300">
    <table class="w-full text-sm">
      <thead class="bg-base-200">
        <tr>
          <th class="text-left p-2">{t('prediction.book')}</th>
          <th class="text-center p-2">{t('prediction.stock')}</th>
          <th class="text-center p-2">{t('prediction.daysLeft')}</th>
          <th class="text-center p-2">{t('prediction.suggestedQty')}</th>
          <th class="text-center p-2">{t('prediction.urgency')}</th>
        </tr>
      </thead>
      <tbody>
        {#each recommendations as rec (rec.inventory_id)}
          <tr class="border-t border-base-300">
            <td class="p-2 max-w-[160px] truncate">{rec.book_title ?? rec.book_id}</td>
            <td class="p-2 text-center font-mono">{rec.current_stock}</td>
            <td class="p-2 text-center font-mono">
              {rec.days_until_stockout !== null ? Math.round(rec.days_until_stockout) : '-'}
            </td>
            <td class="p-2 text-center font-mono font-medium">{rec.suggested_quantity}</td>
            <td class="p-2 text-center">
              <span class="inline-block px-2 py-0.5 rounded-full text-xs font-medium {urgencyColors[rec.urgency]}">
                {rec.urgency}
              </span>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
```

- [ ] **Step 6: Create VelocityBadge and StockoutChart components**

Create `src/lib/components/prediction/VelocityBadge.svelte`:

```svelte
<script lang="ts">
  let { unitsSold30d }: { unitsSold30d: number } = $props();

  const dailyRate = $derived(Math.round((unitsSold30d / 30) * 10) / 10);

  const level = $derived(() => {
    if (dailyRate >= 2) return 'high';
    if (dailyRate >= 0.5) return 'medium';
    return 'low';
  });

  const colors: Record<string, string> = {
    high: 'bg-success/20 text-success',
    medium: 'bg-info/20 text-info',
    low: 'bg-base-300 text-base-content/60',
  };
</script>

<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium {colors[level()]}">
  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
    <path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
  </svg>
  {dailyRate}/d
</span>
```

Create `src/lib/components/prediction/StockoutChart.svelte`:

```svelte
<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import type { SalesVelocity } from '$lib/modules/prediction/types';

  let { data }: { data: SalesVelocity[] } = $props();

  // Show top 15 items sorted by soonest stockout
  const chartData = $derived(
    [...data]
      .filter(d => d.days_until_stockout !== null && d.days_until_stockout < 60)
      .sort((a, b) => (a.days_until_stockout ?? 999) - (b.days_until_stockout ?? 999))
      .slice(0, 15)
  );

  const maxDays = $derived(
    Math.max(...chartData.map(d => d.days_until_stockout ?? 0), 1)
  );

  function barColor(days: number | null): string {
    if (days === null) return 'bg-base-300';
    if (days <= 7) return 'bg-error';
    if (days <= 14) return 'bg-warning';
    if (days <= 30) return 'bg-amber-400';
    return 'bg-success';
  }
</script>

<div class="space-y-2">
  <h2 class="font-semibold">{t('prediction.stockoutTimeline')}</h2>
  <div class="bg-base-200 rounded-xl p-3 space-y-1.5">
    {#each chartData as item (item.inventory_id)}
      {@const days = item.days_until_stockout ?? 0}
      {@const pct = Math.max(2, (days / maxDays) * 100)}
      <div class="flex items-center gap-2">
        <span class="text-xs w-24 truncate shrink-0 text-base-content/70">
          {item.book_id.substring(0, 12)}
        </span>
        <div class="flex-1 h-4 bg-base-300 rounded-full overflow-hidden">
          <div
            class="h-full rounded-full transition-all {barColor(item.days_until_stockout)}"
            style="width: {pct}%"
          ></div>
        </div>
        <span class="text-xs font-mono w-8 text-right shrink-0">
          {Math.round(days)}d
        </span>
      </div>
    {/each}

    {#if chartData.length === 0}
      <div class="text-center text-sm text-base-content/40 py-4">
        {t('prediction.noStockoutRisk')}
      </div>
    {/if}
  </div>
</div>
```

---

## Task 10: Printer & Report UI Components

**Files:**
- Create: `src/lib/components/printer/PrinterSetup.svelte`
- Create: `src/lib/components/printer/PrintButton.svelte`
- Modify: `src/lib/modules/pos/checkout.ts`

- [ ] **Step 1: Create PrinterSetup component**

Create `src/lib/components/printer/PrinterSetup.svelte`:

```svelte
<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import { getPrinterStore } from '$lib/modules/printer/stores.svelte';

  const printer = getPrinterStore();
</script>

<div class="bg-base-200 rounded-xl p-4 space-y-3">
  <h3 class="font-semibold text-sm">{t('printer.setup')}</h3>

  {#if printer.isConnected}
    <!-- Connected state -->
    <div class="flex items-center gap-2">
      <div class="w-2 h-2 rounded-full bg-success"></div>
      <span class="text-sm">{printer.deviceName}</span>
      <span class="text-xs text-base-content/50">({printer.connectionType})</span>
    </div>
    <button
      class="w-full py-2 rounded-lg border border-base-300 text-sm"
      onclick={() => printer.disconnect()}
    >
      {t('printer.disconnect')}
    </button>
  {:else}
    <!-- Disconnected state — show connection options -->
    <div class="flex gap-2">
      {#if printer.bluetoothSupported}
        <button
          class="flex-1 py-2 rounded-lg bg-primary text-primary-content text-sm font-medium"
          onclick={() => printer.connect('bluetooth')}
        >
          Bluetooth
        </button>
      {/if}
      {#if printer.usbSupported}
        <button
          class="flex-1 py-2 rounded-lg bg-primary text-primary-content text-sm font-medium"
          onclick={() => printer.connect('usb')}
        >
          USB
        </button>
      {/if}
    </div>

    {#if !printer.bluetoothSupported && !printer.usbSupported}
      <p class="text-xs text-base-content/50">{t('printer.notSupported')}</p>
    {/if}

    {#if printer.error}
      <p class="text-xs text-error">{printer.error}</p>
    {/if}
  {/if}
</div>
```

- [ ] **Step 2: Create PrintButton component for POS**

Create `src/lib/components/printer/PrintButton.svelte`:

```svelte
<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import { getPrinterStore } from '$lib/modules/printer/stores.svelte';
  import type { ReceiptData } from '$lib/modules/printer/types';

  let { receiptData }: { receiptData: ReceiptData } = $props();

  const printer = getPrinterStore();

  async function handlePrint() {
    await printer.print(receiptData, { openDrawer: true });
  }
</script>

{#if printer.isConnected}
  <button
    class="flex items-center gap-2 py-2 px-4 rounded-lg border border-base-300 text-sm
      {printer.isPrinting ? 'opacity-50' : 'hover:bg-base-200'}"
    disabled={printer.isPrinting}
    onclick={handlePrint}
  >
    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
    </svg>
    {printer.isPrinting ? t('printer.printing') : t('printer.printReceipt')}
  </button>
  {#if printer.error}
    <p class="text-xs text-error mt-1">{printer.error}</p>
  {/if}
{/if}
```

- [ ] **Step 3: Hook printer into POS checkout flow**

Modify `src/lib/modules/pos/checkout.ts` — add thermal print after successful checkout:

```typescript
// Add this import at the top of the existing checkout.ts:
import { getPrinterStatus } from '$lib/modules/printer/service';
import { printReceipt } from '$lib/modules/printer/service';
import type { ReceiptData } from '$lib/modules/printer/types';

// Add this function to the existing checkout.ts:

/**
 * Build receipt data from a completed transaction.
 * Called after successful checkout to prepare for thermal printing.
 */
export function buildReceiptFromTransaction(
  transaction: Transaction,
  items: TransactionItem[],
  cafeInfo: { name: string; address: string; phone: string },
  staffName: string
): ReceiptData {
  return {
    cafe_name: cafeInfo.name,
    cafe_address: cafeInfo.address,
    cafe_phone: cafeInfo.phone,
    transaction_id: transaction.id,
    date: new Date(transaction.created_at).toLocaleString('id-ID'),
    staff_name: staffName,
    items: items.map(item => ({
      title: item.title,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total: item.total,
    })),
    subtotal: transaction.subtotal,
    discount: transaction.discount,
    tax: transaction.tax,
    total: transaction.total,
    payment_method: transaction.payment_method,
    footer_message: 'Terima kasih telah berkunjung!',
  };
}

/**
 * Attempt to print receipt on thermal printer if connected.
 * Non-blocking — failures are logged but don't affect the transaction.
 */
export async function tryPrintReceipt(receiptData: ReceiptData): Promise<void> {
  const status = getPrinterStatus();
  if (!status.connected) return;

  try {
    await printReceipt(receiptData, { openDrawer: true });
  } catch (err) {
    console.warn('Thermal print failed (non-critical):', err);
  }
}
```

- [ ] **Step 4: Add printer status icon to TopBar**

Modify `src/lib/components/TopBar.svelte` — add this snippet in the status area (the exact insertion point depends on existing TopBar structure; add alongside existing status indicators):

```svelte
<!-- Printer status indicator — add inside TopBar's status area -->
{#if printerConnected}
  <div class="flex items-center gap-1 text-xs text-success" title={printerDeviceName}>
    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
    </svg>
  </div>
{/if}
```

In the `<script>` section, add:

```typescript
import { getPrinterStatus } from '$lib/modules/printer/service';

const printerStatus = $derived(getPrinterStatus());
const printerConnected = $derived(printerStatus.connected);
const printerDeviceName = $derived(printerStatus.deviceName ?? '');
```

---

## Task 11: i18n — Bilingual Strings (EN/ID)

**Files:**
- Modify: `src/lib/i18n/en.ts`
- Modify: `src/lib/i18n/id.ts`

- [ ] **Step 1: Add English strings**

Add to `src/lib/i18n/en.ts` (append to existing translation object):

```typescript
// Phase 4: Lending
'lending.title': 'Reading Sessions',
'lending.checkIn': 'Check In',
'lending.checkOut': 'Return',
'lending.checkOutTitle': 'Return Book',
'lending.newCheckIn': 'New Check-In',
'lending.active': 'Active',
'lending.overdue': 'Overdue',
'lending.todayIn': 'Today In',
'lending.todayOut': 'Today Out',
'lending.activeSessions': 'Active Sessions',
'lending.noSessions': 'No active reading sessions',
'lending.selectBook': 'Select Book',
'lending.searchBook': 'Search by title or ISBN...',
'lending.scanOrSearch': 'Scan barcode or search by title',
'lending.level': 'Level',
'lending.semiFormal': 'Quick (no deposit)',
'lending.formal': 'Formal (with deposit)',
'lending.customerName': 'Customer Name',
'lending.customerContact': 'Phone Number',
'lending.duration': 'Duration',
'lending.depositAmount': 'Deposit Amount',
'lending.deposit': 'Deposit',
'lending.refundDeposit': 'Refund',
'lending.forfeitDeposit': 'Forfeit',
'lending.returnBy': 'Return by',
'lending.book': 'Book',
'lending.customer': 'Customer',
'lending.return': 'Return',
'lending.overdueWarning': 'This session is overdue!',
'lending.overdueNotes': 'Reason for late return...',
'lending.overdueCount': '{count} overdue session(s)',
'lending.tapToReturn': 'Tap to return',

// Phase 4: Kiosk
'kiosk.welcome': 'Touch to browse our collection',
'kiosk.searchPlaceholder': 'Search books...',
'kiosk.noResults': 'No books found',
'kiosk.resetIn': 'Resetting in {seconds}s...',

// Phase 4: Printer
'printer.setup': 'Thermal Printer',
'printer.disconnect': 'Disconnect',
'printer.notSupported': 'Your browser does not support Bluetooth or USB printing',
'printer.printReceipt': 'Print Receipt',
'printer.printing': 'Printing...',

// Phase 4: Reports
'reports.title': 'Reports',
'reports.type': 'Report Type',
'reports.from': 'From',
'reports.to': 'To',
'reports.format': 'Format',
'reports.export': 'Export',
'reports.fetching': 'Fetching data...',
'reports.generating': 'Generating file...',
'reports.downloading': 'Downloading...',
'reports.done': 'Done!',
'reports.error': 'Export failed',

// Phase 4: Prediction
'prediction.title': 'Demand Forecast',
'prediction.refresh': 'Refresh',
'prediction.totalItems': 'Total Items',
'prediction.critical': 'Critical',
'prediction.urgent': 'Urgent',
'prediction.avgStockout': 'Avg Days to Stockout',
'prediction.leadTime': 'Supplier Lead Time',
'prediction.restockRecommendations': 'Restock Recommendations',
'prediction.book': 'Book',
'prediction.stock': 'Stock',
'prediction.daysLeft': 'Days Left',
'prediction.suggestedQty': 'Suggested Qty',
'prediction.urgency': 'Urgency',
'prediction.topSellers': 'Top Sellers (30 days)',
'prediction.stockoutTimeline': 'Stockout Timeline',
'prediction.noStockoutRisk': 'No stockout risk detected',
'prediction.allGood': 'All stock levels are healthy',

// Common (Phase 4 additions)
'common.minutes': 'minutes',
'common.hour': 'hour',
'common.hours': 'hours',
'common.days': 'days',
'common.notes': 'Notes',
'common.loading': 'Loading...',
```

- [ ] **Step 2: Add Indonesian strings**

Add to `src/lib/i18n/id.ts` (append to existing translation object):

```typescript
// Phase 4: Lending
'lending.title': 'Sesi Membaca',
'lending.checkIn': 'Check In',
'lending.checkOut': 'Kembalikan',
'lending.checkOutTitle': 'Kembalikan Buku',
'lending.newCheckIn': 'Check-In Baru',
'lending.active': 'Aktif',
'lending.overdue': 'Terlambat',
'lending.todayIn': 'Masuk Hari Ini',
'lending.todayOut': 'Keluar Hari Ini',
'lending.activeSessions': 'Sesi Aktif',
'lending.noSessions': 'Tidak ada sesi membaca aktif',
'lending.selectBook': 'Pilih Buku',
'lending.searchBook': 'Cari berdasarkan judul atau ISBN...',
'lending.scanOrSearch': 'Scan barcode atau cari judul',
'lending.level': 'Level',
'lending.semiFormal': 'Cepat (tanpa deposit)',
'lending.formal': 'Formal (dengan deposit)',
'lending.customerName': 'Nama Pelanggan',
'lending.customerContact': 'Nomor Telepon',
'lending.duration': 'Durasi',
'lending.depositAmount': 'Jumlah Deposit',
'lending.deposit': 'Deposit',
'lending.refundDeposit': 'Kembalikan',
'lending.forfeitDeposit': 'Hanguskan',
'lending.returnBy': 'Kembali sebelum',
'lending.book': 'Buku',
'lending.customer': 'Pelanggan',
'lending.return': 'Kembalikan',
'lending.overdueWarning': 'Sesi ini sudah melewati batas waktu!',
'lending.overdueNotes': 'Alasan keterlambatan...',
'lending.overdueCount': '{count} sesi terlambat',
'lending.tapToReturn': 'Ketuk untuk mengembalikan',

// Phase 4: Kiosk
'kiosk.welcome': 'Sentuh untuk menjelajahi koleksi kami',
'kiosk.searchPlaceholder': 'Cari buku...',
'kiosk.noResults': 'Buku tidak ditemukan',
'kiosk.resetIn': 'Reset dalam {seconds} detik...',

// Phase 4: Printer
'printer.setup': 'Printer Termal',
'printer.disconnect': 'Putuskan',
'printer.notSupported': 'Browser Anda tidak mendukung pencetakan Bluetooth atau USB',
'printer.printReceipt': 'Cetak Struk',
'printer.printing': 'Mencetak...',

// Phase 4: Reports
'reports.title': 'Laporan',
'reports.type': 'Jenis Laporan',
'reports.from': 'Dari',
'reports.to': 'Sampai',
'reports.format': 'Format',
'reports.export': 'Ekspor',
'reports.fetching': 'Mengambil data...',
'reports.generating': 'Membuat file...',
'reports.downloading': 'Mengunduh...',
'reports.done': 'Selesai!',
'reports.error': 'Ekspor gagal',

// Phase 4: Prediction
'prediction.title': 'Prediksi Permintaan',
'prediction.refresh': 'Perbarui',
'prediction.totalItems': 'Total Item',
'prediction.critical': 'Kritis',
'prediction.urgent': 'Mendesak',
'prediction.avgStockout': 'Rata-rata Hari Habis',
'prediction.leadTime': 'Lead Time Supplier',
'prediction.restockRecommendations': 'Rekomendasi Restock',
'prediction.book': 'Buku',
'prediction.stock': 'Stok',
'prediction.daysLeft': 'Sisa Hari',
'prediction.suggestedQty': 'Jumlah Saran',
'prediction.urgency': 'Urgensi',
'prediction.topSellers': 'Terlaris (30 hari)',
'prediction.stockoutTimeline': 'Timeline Habis Stok',
'prediction.noStockoutRisk': 'Tidak ada risiko kehabisan stok',
'prediction.allGood': 'Semua level stok sehat',

// Common (Phase 4 additions)
'common.minutes': 'menit',
'common.hour': 'jam',
'common.hours': 'jam',
'common.days': 'hari',
'common.notes': 'Catatan',
'common.loading': 'Memuat...',
```

---

## Task 12: Navigation Updates & Integration Testing

**Files:**
- Modify: `src/lib/components/BottomNav.svelte`
- Modify: `src/routes/staff/+layout.svelte`
- Modify: `src/routes/owner/+layout.svelte`

- [ ] **Step 1: Add lending and reports to BottomNav**

Modify `src/lib/components/BottomNav.svelte` — add new tabs for staff role (the exact insertion depends on existing structure; add alongside existing POS/Inventory tabs):

```typescript
// Add to the staff navigation tabs array:
{
  label: t('lending.title'),
  href: '/staff/lending',
  icon: 'book-open', // use existing icon system
},
{
  label: t('reports.title'),
  href: '/staff/reports',
  icon: 'chart-bar',
},
```

Note: In kiosk mode, BottomNav should be hidden entirely. Add this guard:

```svelte
<script>
  import { getKioskStore } from '$lib/modules/kiosk/stores.svelte';
  const kiosk = getKioskStore();
</script>

{#if !kiosk.isKioskMode}
  <!-- existing BottomNav content -->
{/if}
```

- [ ] **Step 2: Add prediction link to owner layout**

Modify `src/routes/owner/+layout.svelte` — add navigation link:

```svelte
<!-- Add to owner navigation links -->
<a href="/owner/prediction" class="...">{t('prediction.title')}</a>
```

If `src/routes/owner/+layout.svelte` does not yet exist (depends on Phase 2/3), create it with auth guard for owner role.

- [ ] **Step 3: Install dependencies**

```bash
npm install jspdf jspdf-autotable exceljs
npm install -D @types/jspdf
```

Note: jsPDF and ExcelJS are only used in Edge Functions (Deno), but having the types available helps during development.

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```

Expected: All new tests pass (lending service, idle timer, ESC/POS builder, CSV export, prediction engine) plus all existing tests remain green.

- [ ] **Step 5: Run dev server and smoke test**

```bash
npm run dev
```

Manual smoke test checklist:
- [ ] Navigate to `/staff/lending` — stats load, can open check-in dialog
- [ ] Check in a book (semi-formal) — session appears in active list
- [ ] Check out the book — session removed from active list, stats updated
- [ ] Navigate to `/staff/reports` — report builder loads, select type/dates/format
- [ ] Export CSV — file downloads with correct data and BOM
- [ ] Navigate to `/owner/prediction` — summary cards, restock table, stockout chart render
- [ ] Navigate to `/kiosk` — fullscreen layout, idle overlay appears, touch activates browse
- [ ] Wait 2 minutes idle on kiosk — auto-reset to idle overlay
- [ ] In POS (if printer connected) — print button appears, receipt prints correctly
- [ ] Existing features still work: POS, inventory, browse, search, barcode scan

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete Phase 4 — lending, kiosk, thermal printer, reports export, prediction engine"
```

---

## Summary

| Task | What it builds | Tests |
|------|----------------|-------|
| 1 | Database migration — reading_session table, mv_sales_velocity view, restock RPC, RLS | Migration verification |
| 2 | Lending module — types, service (check-in/out, stats, overdue), stores | 5 unit tests |
| 3 | Thermal printer module — ESC/POS builder, Bluetooth provider, USB provider, service, stores | 8 unit tests |
| 4 | Kiosk mode — idle timer, types, stores, layout, page, components | 6 unit tests |
| 5 | Reports module — types, CSV export (client-side), service, stores | 6 unit tests |
| 6 | PDF & Excel export Edge Functions (jsPDF, ExcelJS) + shared CORS | Edge Function deploy |
| 7 | Prediction engine — sales velocity, demand forecast, restock scoring, stores | 8 unit tests |
| 8 | Lending UI — staff lending page, check-in/out dialogs, session card, overdue alert | Manual |
| 9 | Reports & prediction UI — report builder, export button, restock table, velocity badge, stockout chart | Manual |
| 10 | Printer UI — setup component, print button, POS integration, TopBar status | Manual |
| 11 | i18n — bilingual EN/ID strings for all Phase 4 features | — |
| 12 | Navigation updates + integration smoke test | Full smoke test |

**Total: 12 tasks, ~33 unit tests, 2 Edge Functions, 1 integration smoke test**
