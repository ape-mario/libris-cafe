# Phase 2: Payments & Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add digital payment (Midtrans), digital receipts (WhatsApp + email), owner/staff dashboards, and pelanggan browse with availability badges.

**Architecture:** Midtrans Snap.js for client-side payment popup, Supabase Edge Functions (Deno) for server-side Midtrans API calls and webhook handling. WhatsApp via Fonnte API behind abstract MessagingProvider. Dashboard reads from Supabase RPC functions + materialized views. Pelanggan browse reads inventory from Supabase (cached) and catalog from Yjs.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes, Supabase Edge Functions (Deno), Midtrans Snap.js, Fonnte API, Chart.js for dashboard charts, Vitest for testing.

**Spec Reference:** `docs/superpowers/specs/2026-03-19-libris-cafe-design.md`

**Prerequisite:** Phase 1 complete — auth, inventory, POS (cash), offline queue modules all exist.

---

## File Structure

### New Files

```
src/lib/
├── modules/
│   ├── payment/
│   │   ├── types.ts                 # Payment, MidtransConfig, SnapToken types
│   │   ├── service.ts               # Create payment, check status, handle callback
│   │   ├── service.test.ts          # Payment service tests
│   │   ├── snap.ts                  # Snap.js loader + wrapper
│   │   └── stores.svelte.ts         # Active payment state
│   │
│   ├── receipt/
│   │   ├── types.ts                 # Receipt, MessagingProvider, ReceiptChannel types
│   │   ├── service.ts               # Send receipt (WhatsApp or email)
│   │   ├── service.test.ts          # Receipt service tests
│   │   └── template.ts             # Receipt content formatter (text + HTML)
│   │
│   └── dashboard/
│       ├── types.ts                 # DashboardMetrics, SalesTrend, TopBook types
│       ├── service.ts               # Fetch dashboard data via RPC
│       ├── service.test.ts          # Dashboard service tests
│       └── stores.svelte.ts         # Dashboard state, date range, refresh

src/routes/
├── staff/
│   ├── pos/
│   │   └── +page.svelte             # MODIFIED — add digital payment options
│   ├── dashboard/
│   │   └── +page.svelte             # Staff dashboard (today's metrics)
│   └── receipt/
│       └── [transactionId]/
│           └── +page.svelte         # Post-checkout receipt send page
├── owner/
│   ├── +layout.svelte               # Owner auth guard layout
│   └── dashboard/
│       └── +page.svelte             # Owner full dashboard

src/lib/components/
├── PaymentModal.svelte              # Midtrans Snap payment modal
├── ReceiptSender.svelte             # WhatsApp/email receipt form
├── AvailabilityBadge.svelte         # Stock/price badge for pelanggan browse
├── DashboardCard.svelte             # Reusable metric card
└── SalesChart.svelte                # Sales trend chart (Chart.js)

supabase/
├── migrations/
│   └── 00002_payments_visibility.sql  # payment, receipt tables + RPC functions + mat views
└── functions/
    ├── create-payment/
    │   └── index.ts                 # Edge Function: create Midtrans Snap token
    ├── midtrans-webhook/
    │   └── index.ts                 # Edge Function: Midtrans payment notification
    ├── check-payment/
    │   └── index.ts                 # Edge Function: poll Midtrans status
    ├── send-receipt-wa/
    │   └── index.ts                 # Edge Function: send receipt via Fonnte (WhatsApp)
    └── send-receipt-email/
        └── index.ts                 # Edge Function: send receipt via email
```

### Modified Files

```
src/lib/modules/pos/types.ts            # Extend CheckoutRequest with digital payment methods
src/lib/modules/pos/checkout.ts          # Add digital payment flow + receipt queuing
src/lib/modules/pos/stores.svelte.ts     # Add activePayment state
src/lib/components/BottomNav.svelte      # Add dashboard tab for staff/owner
src/lib/components/TopBar.svelte         # Show active payment indicator
src/lib/i18n/en.ts                       # Add payment, receipt, dashboard, browse strings
src/lib/i18n/id.ts                       # Add payment, receipt, dashboard, browse strings
src/routes/+layout.svelte                # Load Snap.js script tag
src/routes/(app)/+page.svelte            # OR book detail page: show availability badges for guests
```

---

## Task 1: Database Migration — Payment, Receipt Tables + Dashboard RPC

**Files:**
- Create: `supabase/migrations/00002_payments_visibility.sql`

- [ ] **Step 1: Write the Phase 2 migration**

Create `supabase/migrations/00002_payments_visibility.sql`:

```sql
-- Phase 2: Payments, Receipts, Dashboard

-- ============================================================
-- PAYMENT TABLE (Midtrans)
-- ============================================================
CREATE TABLE payment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES transaction(id),
  midtrans_order_id text NOT NULL UNIQUE,
  midtrans_transaction_id text,
  payment_type text,
  gross_amount decimal(12,2) NOT NULL,
  status text NOT NULL CHECK (status IN (
    'pending', 'capture', 'settlement', 'deny',
    'cancel', 'expire', 'refund'
  )) DEFAULT 'pending',
  snap_token text,
  snap_redirect_url text,
  raw_response jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_payment_transaction ON payment(transaction_id);
CREATE INDEX idx_payment_midtrans_order ON payment(midtrans_order_id);
CREATE INDEX idx_payment_status ON payment(status);

-- ============================================================
-- ADD MIDTRANS FIELDS TO TRANSACTION TABLE
-- ============================================================
ALTER TABLE transaction
  ADD COLUMN IF NOT EXISTS midtrans_order_id text,
  ADD COLUMN IF NOT EXISTS midtrans_transaction_id text;

-- ============================================================
-- RECEIPT TABLE
-- ============================================================
CREATE TABLE receipt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES transaction(id),
  type text NOT NULL CHECK (type IN ('whatsapp', 'email')),
  recipient text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'sent', 'failed')) DEFAULT 'queued',
  error_message text,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_receipt_transaction ON receipt(transaction_id);
CREATE INDEX idx_receipt_status ON receipt(status);

-- ============================================================
-- RLS FOR NEW TABLES
-- ============================================================
ALTER TABLE payment ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read payments for own outlet transactions" ON payment
  FOR SELECT USING (
    transaction_id IN (
      SELECT t.id FROM transaction t
      JOIN staff s ON s.outlet_id = t.outlet_id
      WHERE s.id = auth.uid()
    )
  );

CREATE POLICY "Staff can insert payments" ON payment
  FOR INSERT WITH CHECK (
    transaction_id IN (
      SELECT t.id FROM transaction t
      JOIN staff s ON s.outlet_id = t.outlet_id
      WHERE s.id = auth.uid()
    )
  );

CREATE POLICY "Staff can update payments" ON payment
  FOR UPDATE USING (
    transaction_id IN (
      SELECT t.id FROM transaction t
      JOIN staff s ON s.outlet_id = t.outlet_id
      WHERE s.id = auth.uid()
    )
  );

CREATE POLICY "Staff can manage receipts for own outlet" ON receipt
  FOR ALL USING (
    transaction_id IN (
      SELECT t.id FROM transaction t
      JOIN staff s ON s.outlet_id = t.outlet_id
      WHERE s.id = auth.uid()
    )
  );

-- ============================================================
-- MATERIALIZED VIEW: DAILY SALES SUMMARY
-- ============================================================
CREATE MATERIALIZED VIEW mv_daily_sales AS
SELECT
  t.outlet_id,
  DATE(t.created_at AT TIME ZONE 'Asia/Jakarta') AS sale_date,
  COUNT(*) AS transaction_count,
  SUM(t.total) AS total_sales,
  SUM(t.subtotal - COALESCE(
    (SELECT SUM(ti.quantity * i.cost_price)
     FROM transaction_item ti
     JOIN inventory i ON i.id = ti.inventory_id
     WHERE ti.transaction_id = t.id),
    0
  )) AS total_margin,
  SUM(t.tax) AS total_tax,
  t.payment_method
FROM transaction t
WHERE t.type = 'sale'
  AND t.payment_status IN ('paid', 'settlement')
GROUP BY t.outlet_id, sale_date, t.payment_method;

CREATE UNIQUE INDEX idx_mv_daily_sales
  ON mv_daily_sales(outlet_id, sale_date, payment_method);

-- ============================================================
-- MATERIALIZED VIEW: TOP SELLING BOOKS
-- ============================================================
CREATE MATERIALIZED VIEW mv_top_books AS
SELECT
  t.outlet_id,
  ti.book_id,
  ti.title,
  SUM(ti.quantity) AS total_sold,
  SUM(ti.total) AS total_revenue,
  DATE(MIN(t.created_at) AT TIME ZONE 'Asia/Jakarta') AS first_sale,
  DATE(MAX(t.created_at) AT TIME ZONE 'Asia/Jakarta') AS last_sale
FROM transaction_item ti
JOIN transaction t ON t.id = ti.transaction_id
WHERE t.type = 'sale'
  AND t.payment_status IN ('paid', 'settlement')
GROUP BY t.outlet_id, ti.book_id, ti.title;

CREATE UNIQUE INDEX idx_mv_top_books
  ON mv_top_books(outlet_id, book_id);

-- ============================================================
-- RPC: TODAY'S DASHBOARD METRICS
-- ============================================================
CREATE OR REPLACE FUNCTION get_today_metrics(p_outlet_id uuid)
RETURNS json AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'total_sales', COALESCE(SUM(t.total), 0),
    'transaction_count', COUNT(*),
    'total_margin', COALESCE(SUM(t.subtotal), 0) - COALESCE(
      (SELECT SUM(ti.quantity * i.cost_price)
       FROM transaction_item ti
       JOIN inventory i ON i.id = ti.inventory_id
       JOIN transaction tx ON tx.id = ti.transaction_id
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
        FROM transaction
        WHERE outlet_id = p_outlet_id
          AND type = 'sale'
          AND payment_status IN ('paid', 'settlement')
          AND DATE(created_at AT TIME ZONE 'Asia/Jakarta') = CURRENT_DATE
        GROUP BY payment_method
      ) sub
    )
  ) INTO result
  FROM transaction t
  WHERE t.outlet_id = p_outlet_id
    AND t.type = 'sale'
    AND t.payment_status IN ('paid', 'settlement')
    AND DATE(t.created_at AT TIME ZONE 'Asia/Jakarta') = CURRENT_DATE;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RPC: SALES TREND (date range)
-- ============================================================
CREATE OR REPLACE FUNCTION get_sales_trend(
  p_outlet_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS json AS $$
DECLARE
  result json;
BEGIN
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
    FROM transaction
    WHERE outlet_id = p_outlet_id
      AND type = 'sale'
      AND payment_status IN ('paid', 'settlement')
      AND DATE(created_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
    GROUP BY sale_date
  ) s ON s.sale_date = d.day::date;

  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RPC: TOP SELLING BOOKS (for dashboard)
-- ============================================================
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
  SELECT json_agg(row_to_json(sub)) INTO result
  FROM (
    SELECT ti.book_id,
           ti.title,
           SUM(ti.quantity) AS total_sold,
           SUM(ti.total) AS total_revenue
    FROM transaction_item ti
    JOIN transaction t ON t.id = ti.transaction_id
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

-- ============================================================
-- RPC: INVENTORY AVAILABILITY (for pelanggan browse, no auth needed)
-- ============================================================
CREATE OR REPLACE FUNCTION get_public_availability(p_outlet_id uuid)
RETURNS json AS $$
DECLARE
  result json;
BEGIN
  SELECT json_agg(json_build_object(
    'book_id', book_id,
    'type', type,
    'price', price,
    'in_stock', stock > 0,
    'is_preloved', is_preloved,
    'location', location
  )) INTO result
  FROM inventory
  WHERE outlet_id = p_outlet_id;

  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant anonymous access to public availability
GRANT EXECUTE ON FUNCTION get_public_availability(uuid) TO anon;

-- ============================================================
-- REFRESH MATERIALIZED VIEWS FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION refresh_dashboard_views()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_sales;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_top_books;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db reset
```

Expected: All tables created, RPC functions registered, materialized views built, no errors.

- [ ] **Step 3: Regenerate TypeScript types**

```bash
npx supabase gen types typescript --local > src/lib/supabase/types.ts
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00002_payments_visibility.sql src/lib/supabase/types.ts
git commit -m "feat: add Phase 2 migration — payment, receipt tables, dashboard RPCs, mat views"
```

---

## Task 2: Payment Module — Types, Snap Loader & Service

**Files:**
- Create: `src/lib/modules/payment/types.ts`
- Create: `src/lib/modules/payment/snap.ts`
- Create: `src/lib/modules/payment/service.ts`
- Create: `src/lib/modules/payment/service.test.ts`
- Create: `src/lib/modules/payment/stores.svelte.ts`

- [ ] **Step 1: Write payment types**

Create `src/lib/modules/payment/types.ts`:

```typescript
export type PaymentMethod = 'cash' | 'qris' | 'ewallet' | 'bank_transfer' | 'card';

export type PaymentStatus =
  | 'pending' | 'capture' | 'settlement' | 'deny'
  | 'cancel' | 'expire' | 'refund';

export interface Payment {
  id: string;
  transaction_id: string;
  midtrans_order_id: string;
  midtrans_transaction_id: string | null;
  payment_type: string | null;
  gross_amount: number;
  status: PaymentStatus;
  snap_token: string | null;
  snap_redirect_url: string | null;
  raw_response: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePaymentRequest {
  transactionId: string;
  orderId: string;
  grossAmount: number;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  items: {
    id: string;
    name: string;
    price: number;
    quantity: number;
  }[];
}

export interface CreatePaymentResponse {
  snapToken: string;
  redirectUrl: string;
  orderId: string;
}

export interface SnapResult {
  status_code: string;
  status_message: string;
  transaction_id: string;
  order_id: string;
  gross_amount: string;
  payment_type: string;
  transaction_time: string;
  transaction_status: string;
  fraud_status?: string;
}

export interface MidtransNotification {
  transaction_time: string;
  transaction_status: string;
  transaction_id: string;
  status_message: string;
  status_code: string;
  signature_key: string;
  settlement_time?: string;
  payment_type: string;
  order_id: string;
  merchant_id: string;
  gross_amount: string;
  fraud_status?: string;
  currency: string;
}
```

- [ ] **Step 2: Write Snap.js loader**

Create `src/lib/modules/payment/snap.ts`:

```typescript
/**
 * Midtrans Snap.js loader and wrapper.
 * Loads the Snap.js script dynamically, provides a typed interface
 * for calling snap.pay().
 */

declare global {
  interface Window {
    snap: {
      pay(
        token: string,
        options: {
          onSuccess: (result: Record<string, string>) => void;
          onPending: (result: Record<string, string>) => void;
          onError: (result: Record<string, string>) => void;
          onClose: () => void;
        }
      ): void;
    };
  }
}

const SNAP_SANDBOX_URL = 'https://app.sandbox.midtrans.com/snap/snap.js';
const SNAP_PRODUCTION_URL = 'https://app.midtrans.com/snap/snap.js';

let loaded = false;
let loading: Promise<void> | null = null;

/**
 * Load Snap.js script into the page.
 * Safe to call multiple times — only loads once.
 */
export function loadSnapJs(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (loading) return loading;

  const clientKey = import.meta.env.VITE_MIDTRANS_CLIENT_KEY as string;
  const isProduction = import.meta.env.VITE_MIDTRANS_IS_PRODUCTION === 'true';

  if (!clientKey) {
    return Promise.reject(new Error('VITE_MIDTRANS_CLIENT_KEY not configured'));
  }

  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = isProduction ? SNAP_PRODUCTION_URL : SNAP_SANDBOX_URL;
    script.setAttribute('data-client-key', clientKey);
    script.async = true;

    script.onload = () => {
      loaded = true;
      loading = null;
      resolve();
    };
    script.onerror = () => {
      loading = null;
      reject(new Error('Failed to load Midtrans Snap.js'));
    };

    document.head.appendChild(script);
  });

  return loading;
}

export interface SnapPayResult {
  success: boolean;
  pending: boolean;
  result: Record<string, string> | null;
  error: string | null;
}

/**
 * Open Snap.js payment popup.
 * Returns a promise that resolves when the payment completes, is pending, errors, or the user closes.
 */
export function openSnapPayment(token: string): Promise<SnapPayResult> {
  return new Promise((resolve) => {
    if (!window.snap) {
      resolve({ success: false, pending: false, result: null, error: 'Snap.js not loaded' });
      return;
    }

    window.snap.pay(token, {
      onSuccess(result) {
        resolve({ success: true, pending: false, result, error: null });
      },
      onPending(result) {
        resolve({ success: false, pending: true, result, error: null });
      },
      onError(result) {
        resolve({
          success: false,
          pending: false,
          result,
          error: result.status_message || 'Payment failed',
        });
      },
      onClose() {
        resolve({ success: false, pending: false, result: null, error: 'Payment popup closed' });
      },
    });
  });
}

/**
 * Check if Snap.js is loaded and available.
 */
export function isSnapReady(): boolean {
  return loaded && typeof window !== 'undefined' && !!window.snap;
}
```

- [ ] **Step 3: Write failing test for payment service**

Create `src/lib/modules/payment/service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInvoke = vi.fn();
const mockFrom = vi.fn();
const mockInsert = vi.fn();

vi.mock('$lib/supabase/client', () => ({
  getSupabase: () => ({
    functions: { invoke: mockInvoke },
    from: mockFrom,
  }),
}));

import { createSnapPayment, checkPaymentStatus, recordPayment } from './service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Payment service', () => {
  it('should create a Snap payment via Edge Function', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        snap_token: 'snap-token-xyz',
        redirect_url: 'https://app.sandbox.midtrans.com/snap/v3/...',
        order_id: 'LIBRIS-20260319-abc123',
      },
      error: null,
    });

    const result = await createSnapPayment({
      transactionId: 'tx-1',
      orderId: 'LIBRIS-20260319-abc123',
      grossAmount: 98790,
      items: [{ id: 'inv-1', name: 'Atomic Habits', price: 89000, quantity: 1 }],
    });

    expect(mockInvoke).toHaveBeenCalledWith('create-payment', {
      body: expect.objectContaining({ order_id: 'LIBRIS-20260319-abc123' }),
    });
    expect(result.snapToken).toBe('snap-token-xyz');
    expect(result.orderId).toBe('LIBRIS-20260319-abc123');
  });

  it('should throw on Edge Function error', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: { message: 'Function error' },
    });

    await expect(
      createSnapPayment({
        transactionId: 'tx-1',
        orderId: 'LIBRIS-20260319-abc123',
        grossAmount: 98790,
        items: [],
      })
    ).rejects.toThrow('Function error');
  });

  it('should check payment status via Edge Function', async () => {
    mockInvoke.mockResolvedValue({
      data: { transaction_status: 'settlement', payment_type: 'qris' },
      error: null,
    });

    const result = await checkPaymentStatus('LIBRIS-20260319-abc123');
    expect(result.transaction_status).toBe('settlement');
  });

  it('should record a payment in the database', async () => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: 'pay-1' },
      error: null,
    });
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
    mockFrom.mockReturnValue({
      insert: mockInsert.mockReturnValue({ select: mockSelect }),
    });

    const payment = await recordPayment({
      transactionId: 'tx-1',
      orderId: 'LIBRIS-20260319-abc123',
      grossAmount: 98790,
      snapToken: 'snap-token-xyz',
    });

    expect(mockInsert).toHaveBeenCalled();
    expect(payment.id).toBe('pay-1');
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
npx vitest run src/lib/modules/payment/service.test.ts
```

Expected: FAIL — `createSnapPayment` not found.

- [ ] **Step 5: Implement payment service**

Create `src/lib/modules/payment/service.ts`:

```typescript
import { getSupabase } from '$lib/supabase/client';
import type { CreatePaymentRequest, CreatePaymentResponse, Payment } from './types';

/**
 * Generate a unique order ID for Midtrans.
 * Format: LIBRIS-YYYYMMDD-<random8>
 */
export function generateOrderId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = crypto.randomUUID().slice(0, 8);
  return `LIBRIS-${date}-${random}`;
}

/**
 * Create a Midtrans Snap payment token via Edge Function.
 * Never calls Midtrans directly from client (security).
 */
export async function createSnapPayment(
  request: CreatePaymentRequest
): Promise<CreatePaymentResponse> {
  const supabase = getSupabase();

  const { data, error } = await supabase.functions.invoke('create-payment', {
    body: {
      order_id: request.orderId,
      gross_amount: request.grossAmount,
      transaction_id: request.transactionId,
      customer_name: request.customerName ?? null,
      customer_email: request.customerEmail ?? null,
      customer_phone: request.customerPhone ?? null,
      items: request.items.map(item => ({
        id: item.id,
        name: item.name.slice(0, 50), // Midtrans 50 char limit
        price: item.price,
        quantity: item.quantity,
      })),
    },
  });

  if (error) throw new Error(error.message);
  if (!data?.snap_token) throw new Error('Failed to create payment token');

  return {
    snapToken: data.snap_token,
    redirectUrl: data.redirect_url ?? '',
    orderId: data.order_id,
  };
}

/**
 * Check payment status via Edge Function (polling fallback).
 */
export async function checkPaymentStatus(
  orderId: string
): Promise<Record<string, string>> {
  const supabase = getSupabase();

  const { data, error } = await supabase.functions.invoke('check-payment', {
    body: { order_id: orderId },
  });

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Record a payment entry in the database.
 */
export async function recordPayment(params: {
  transactionId: string;
  orderId: string;
  grossAmount: number;
  snapToken: string;
  redirectUrl?: string;
}): Promise<Payment> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('payment')
    .insert({
      transaction_id: params.transactionId,
      midtrans_order_id: params.orderId,
      gross_amount: params.grossAmount,
      snap_token: params.snapToken,
      snap_redirect_url: params.redirectUrl ?? null,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to record payment: ${error.message}`);
  return data as Payment;
}

/**
 * Update payment status after webhook or polling.
 */
export async function updatePaymentStatus(
  orderId: string,
  status: string,
  midtransTransactionId?: string,
  paymentType?: string,
  rawResponse?: Record<string, unknown>
): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from('payment')
    .update({
      status,
      midtrans_transaction_id: midtransTransactionId ?? null,
      payment_type: paymentType ?? null,
      raw_response: rawResponse ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('midtrans_order_id', orderId);

  if (error) throw new Error(`Failed to update payment: ${error.message}`);
}

/**
 * Get payment by transaction ID.
 */
export async function getPaymentByTransaction(transactionId: string): Promise<Payment | null> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('payment')
    .select()
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) return null;
  return data as Payment;
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
npx vitest run src/lib/modules/payment/service.test.ts
```

Expected: PASS.

- [ ] **Step 7: Write payment store**

Create `src/lib/modules/payment/stores.svelte.ts`:

```typescript
import type { PaymentStatus } from './types';

interface ActivePayment {
  orderId: string;
  transactionId: string;
  status: PaymentStatus;
  snapToken: string | null;
}

let activePayment = $state<ActivePayment | null>(null);
let paymentPolling = $state(false);

export function getActivePayment(): ActivePayment | null {
  return activePayment;
}

export function setActivePayment(payment: ActivePayment | null): void {
  activePayment = payment;
}

export function isPaymentInProgress(): boolean {
  return activePayment !== null && activePayment.status === 'pending';
}

export function getPaymentPolling(): boolean {
  return paymentPolling;
}

export function setPaymentPolling(polling: boolean): void {
  paymentPolling = polling;
}

export function clearActivePayment(): void {
  activePayment = null;
  paymentPolling = false;
}
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/modules/payment/
git commit -m "feat: add payment module — types, Snap.js loader, service, store"
```

---

## Task 3: Midtrans Edge Functions

**Files:**
- Create: `supabase/functions/create-payment/index.ts`
- Create: `supabase/functions/midtrans-webhook/index.ts`
- Create: `supabase/functions/check-payment/index.ts`

- [ ] **Step 1: Create the create-payment Edge Function**

Create `supabase/functions/create-payment/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MIDTRANS_SERVER_KEY = Deno.env.get('MIDTRANS_SERVER_KEY') ?? '';
const MIDTRANS_IS_PRODUCTION = Deno.env.get('MIDTRANS_IS_PRODUCTION') === 'true';

const SNAP_API_URL = MIDTRANS_IS_PRODUCTION
  ? 'https://app.midtrans.com/snap/v1/transactions'
  : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const {
      order_id,
      gross_amount,
      transaction_id,
      customer_name,
      customer_email,
      customer_phone,
      items,
    } = await req.json();

    if (!order_id || !gross_amount) {
      return new Response(
        JSON.stringify({ error: 'order_id and gross_amount required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build Midtrans Snap request
    const snapPayload = {
      transaction_details: {
        order_id,
        gross_amount: Math.round(gross_amount), // Midtrans requires integer
      },
      customer_details: {
        first_name: customer_name ?? 'Customer',
        email: customer_email ?? undefined,
        phone: customer_phone ?? undefined,
      },
      item_details: items?.map((item: any) => ({
        id: item.id,
        name: item.name,
        price: Math.round(item.price),
        quantity: item.quantity,
      })),
      enabled_payments: [
        'credit_card', 'bca_va', 'bni_va', 'bri_va', 'permata_va',
        'gopay', 'shopeepay', 'qris',
      ],
      expiry: {
        unit: 'minutes',
        duration: 15,
      },
    };

    // Call Midtrans Snap API
    const auth = btoa(`${MIDTRANS_SERVER_KEY}:`);
    const response = await fetch(SNAP_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
      },
      body: JSON.stringify(snapPayload),
    });

    const result = await response.json();

    if (!response.ok || !result.token) {
      console.error('Midtrans error:', result);
      return new Response(
        JSON.stringify({ error: result.error_messages?.[0] ?? 'Failed to create Snap token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Store payment record in database
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    await supabase.from('payment').insert({
      transaction_id,
      midtrans_order_id: order_id,
      gross_amount: Math.round(gross_amount),
      snap_token: result.token,
      snap_redirect_url: result.redirect_url,
      status: 'pending',
    });

    // Update transaction with midtrans_order_id
    await supabase
      .from('transaction')
      .update({ midtrans_order_id: order_id })
      .eq('id', transaction_id);

    return new Response(
      JSON.stringify({
        snap_token: result.token,
        redirect_url: result.redirect_url,
        order_id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('create-payment error:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

- [ ] **Step 2: Create the midtrans-webhook Edge Function**

Create `supabase/functions/midtrans-webhook/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { crypto } from 'https://deno.land/std@0.177.0/crypto/mod.ts';

const MIDTRANS_SERVER_KEY = Deno.env.get('MIDTRANS_SERVER_KEY') ?? '';

serve(async (req: Request) => {
  // Webhook only accepts POST
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const notification = await req.json();
    const {
      order_id,
      transaction_id: midtrans_tx_id,
      transaction_status,
      payment_type,
      gross_amount,
      signature_key,
      fraud_status,
      status_code,
    } = notification;

    // Verify signature: SHA512(order_id + status_code + gross_amount + server_key)
    const rawSignature = `${order_id}${status_code}${gross_amount}${MIDTRANS_SERVER_KEY}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(rawSignature);
    const hashBuffer = await crypto.subtle.digest('SHA-512', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const computedSignature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    if (computedSignature !== signature_key) {
      console.error('Invalid signature for order:', order_id);
      return new Response('Invalid signature', { status: 403 });
    }

    // Determine final status
    let paymentStatus: string;
    if (transaction_status === 'capture') {
      paymentStatus = (fraud_status === 'accept') ? 'capture' : 'deny';
    } else if (transaction_status === 'settlement') {
      paymentStatus = 'settlement';
    } else if (transaction_status === 'deny') {
      paymentStatus = 'deny';
    } else if (transaction_status === 'cancel' || transaction_status === 'expire') {
      paymentStatus = transaction_status;
    } else if (transaction_status === 'pending') {
      paymentStatus = 'pending';
    } else if (transaction_status === 'refund') {
      paymentStatus = 'refund';
    } else {
      paymentStatus = transaction_status;
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Update payment record
    await supabase
      .from('payment')
      .update({
        status: paymentStatus,
        midtrans_transaction_id: midtrans_tx_id,
        payment_type,
        raw_response: notification,
        updated_at: new Date().toISOString(),
      })
      .eq('midtrans_order_id', order_id);

    // Map Midtrans status to our transaction payment_status
    let txPaymentStatus: string;
    if (paymentStatus === 'settlement' || paymentStatus === 'capture') {
      txPaymentStatus = 'paid';
    } else if (paymentStatus === 'deny' || paymentStatus === 'cancel' || paymentStatus === 'expire') {
      txPaymentStatus = 'failed';
    } else if (paymentStatus === 'refund') {
      txPaymentStatus = 'refunded';
    } else {
      txPaymentStatus = 'pending';
    }

    // Update transaction status
    const { data: txData } = await supabase
      .from('transaction')
      .update({
        payment_status: txPaymentStatus,
        midtrans_transaction_id: midtrans_tx_id,
      })
      .eq('midtrans_order_id', order_id)
      .select('id, staff_id')
      .single();

    // If payment is successful, decrement stock
    if (txPaymentStatus === 'paid' && txData) {
      const { data: items } = await supabase
        .from('transaction_item')
        .select('inventory_id, quantity')
        .eq('transaction_id', txData.id);

      if (items) {
        for (const item of items) {
          await supabase.from('stock_movement').insert({
            inventory_id: item.inventory_id,
            type: 'sale_out',
            quantity: -item.quantity,
            reference_id: txData.id,
            staff_id: txData.staff_id,
          });
        }
      }
    }

    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('Webhook error:', err);
    return new Response('Internal error', { status: 500 });
  }
});
```

- [ ] **Step 3: Create the check-payment Edge Function**

Create `supabase/functions/check-payment/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const MIDTRANS_SERVER_KEY = Deno.env.get('MIDTRANS_SERVER_KEY') ?? '';
const MIDTRANS_IS_PRODUCTION = Deno.env.get('MIDTRANS_IS_PRODUCTION') === 'true';

const STATUS_API_URL = MIDTRANS_IS_PRODUCTION
  ? 'https://api.midtrans.com/v2'
  : 'https://api.sandbox.midtrans.com/v2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { order_id } = await req.json();

    if (!order_id) {
      return new Response(
        JSON.stringify({ error: 'order_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const auth = btoa(`${MIDTRANS_SERVER_KEY}:`);
    const response = await fetch(`${STATUS_API_URL}/${order_id}/status`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
      },
    });

    const result = await response.json();

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('check-payment error:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

- [ ] **Step 4: Update `.env.example` with Midtrans keys**

Append to `.env.example`:

```
# Midtrans
VITE_MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxx
VITE_MIDTRANS_IS_PRODUCTION=false

# (Set in Supabase secrets, not in .env)
# MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxx
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/ .env.example
git commit -m "feat: add Midtrans Edge Functions — create-payment, webhook, check-payment"
```

---

## Task 4: Receipt Module — Types, Templates & Service

**Files:**
- Create: `src/lib/modules/receipt/types.ts`
- Create: `src/lib/modules/receipt/template.ts`
- Create: `src/lib/modules/receipt/service.ts`
- Create: `src/lib/modules/receipt/service.test.ts`

- [ ] **Step 1: Write receipt types**

Create `src/lib/modules/receipt/types.ts`:

```typescript
export type ReceiptChannel = 'whatsapp' | 'email';
export type ReceiptStatus = 'queued' | 'sent' | 'failed';

export interface Receipt {
  id: string;
  transaction_id: string;
  type: ReceiptChannel;
  recipient: string;
  status: ReceiptStatus;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface ReceiptData {
  transactionId: string;
  orderId: string;
  date: string;
  items: {
    title: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paymentMethod: string;
  paymentReference: string | null;
  cafeName: string;
  cafeAddress: string;
  staffName: string;
}

/**
 * Abstract messaging provider interface.
 * Concrete implementations: Fonnte (WhatsApp), email.
 * Swappable without changing caller code.
 */
export interface MessagingProvider {
  send(recipient: string, message: string): Promise<{ success: boolean; error?: string }>;
}
```

- [ ] **Step 2: Write receipt template formatter**

Create `src/lib/modules/receipt/template.ts`:

```typescript
import type { ReceiptData } from './types';

/**
 * Format receipt as plain text (for WhatsApp).
 */
export function formatReceiptText(data: ReceiptData): string {
  const divider = '─'.repeat(30);
  const lines: string[] = [];

  lines.push(`*${data.cafeName}*`);
  lines.push(data.cafeAddress);
  lines.push(divider);
  lines.push(`Tanggal: ${data.date}`);
  lines.push(`Kasir: ${data.staffName}`);
  lines.push(`No: ${data.orderId}`);
  lines.push(divider);

  for (const item of data.items) {
    const itemTotal = formatRp(item.total);
    lines.push(`${item.title}`);
    lines.push(`  ${item.quantity}x ${formatRp(item.unitPrice)}  ${itemTotal}`);
  }

  lines.push(divider);
  lines.push(`Subtotal: ${formatRp(data.subtotal)}`);

  if (data.discount > 0) {
    lines.push(`Diskon: -${formatRp(data.discount)}`);
  }

  if (data.tax > 0) {
    lines.push(`Pajak: ${formatRp(data.tax)}`);
  }

  lines.push(`*TOTAL: ${formatRp(data.total)}*`);
  lines.push(divider);
  lines.push(`Pembayaran: ${formatPaymentMethod(data.paymentMethod)}`);

  if (data.paymentReference) {
    lines.push(`Ref: ${data.paymentReference}`);
  }

  lines.push('');
  lines.push('Terima kasih! 📚');

  return lines.join('\n');
}

/**
 * Format receipt as HTML (for email).
 */
export function formatReceiptHtml(data: ReceiptData): string {
  const itemRows = data.items.map(item => `
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #f0ebe4;">
        <div style="font-weight: 500; color: #2d2a26;">${item.title}</div>
        <div style="font-size: 12px; color: #8a857e;">${item.quantity}x ${formatRp(item.unitPrice)}</div>
      </td>
      <td style="padding: 8px 0; text-align: right; border-bottom: 1px solid #f0ebe4; color: #2d2a26;">
        ${formatRp(item.total)}
      </td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; background-color: #faf8f5; font-family: 'Source Sans 3', 'Segoe UI', sans-serif;">
  <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
    <!-- Header -->
    <div style="background: #d4763c; padding: 24px; text-align: center;">
      <h1 style="margin: 0; color: #faf8f5; font-family: 'Playfair Display', Georgia, serif; font-size: 24px;">
        ${data.cafeName}
      </h1>
      <p style="margin: 4px 0 0; color: #faf8f5; opacity: 0.8; font-size: 13px;">
        ${data.cafeAddress}
      </p>
    </div>

    <!-- Receipt Info -->
    <div style="padding: 20px 24px 0;">
      <table style="width: 100%; font-size: 13px; color: #8a857e;">
        <tr>
          <td>Tanggal</td>
          <td style="text-align: right;">${data.date}</td>
        </tr>
        <tr>
          <td>Kasir</td>
          <td style="text-align: right;">${data.staffName}</td>
        </tr>
        <tr>
          <td>No. Transaksi</td>
          <td style="text-align: right; font-family: monospace; font-size: 11px;">${data.orderId}</td>
        </tr>
      </table>
    </div>

    <!-- Items -->
    <div style="padding: 16px 24px;">
      <table style="width: 100%; font-size: 14px;">
        ${itemRows}
      </table>
    </div>

    <!-- Totals -->
    <div style="padding: 0 24px 20px;">
      <table style="width: 100%; font-size: 14px;">
        <tr>
          <td style="padding: 4px 0; color: #8a857e;">Subtotal</td>
          <td style="text-align: right; color: #2d2a26;">${formatRp(data.subtotal)}</td>
        </tr>
        ${data.discount > 0 ? `
        <tr>
          <td style="padding: 4px 0; color: #8a857e;">Diskon</td>
          <td style="text-align: right; color: #c84b6c;">-${formatRp(data.discount)}</td>
        </tr>
        ` : ''}
        ${data.tax > 0 ? `
        <tr>
          <td style="padding: 4px 0; color: #8a857e;">Pajak</td>
          <td style="text-align: right; color: #2d2a26;">${formatRp(data.tax)}</td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding: 12px 0 0; font-weight: 700; font-size: 18px; color: #2d2a26; border-top: 2px solid #2d2a26;">TOTAL</td>
          <td style="padding: 12px 0 0; text-align: right; font-weight: 700; font-size: 18px; color: #2d2a26; border-top: 2px solid #2d2a26;">${formatRp(data.total)}</td>
        </tr>
      </table>
    </div>

    <!-- Payment Info -->
    <div style="padding: 16px 24px; background: #f8f5f0; border-top: 1px solid #f0ebe4;">
      <p style="margin: 0; font-size: 13px; color: #8a857e;">
        Pembayaran: <strong style="color: #2d2a26;">${formatPaymentMethod(data.paymentMethod)}</strong>
        ${data.paymentReference ? `<br>Ref: <code style="font-size: 11px;">${data.paymentReference}</code>` : ''}
      </p>
    </div>

    <!-- Footer -->
    <div style="padding: 20px 24px; text-align: center;">
      <p style="margin: 0; font-size: 13px; color: #8a857e;">Terima kasih telah berbelanja di ${data.cafeName}!</p>
    </div>
  </div>
</body>
</html>`;
}

function formatRp(amount: number): string {
  return `Rp ${amount.toLocaleString('id-ID')}`;
}

function formatPaymentMethod(method: string): string {
  const map: Record<string, string> = {
    cash: 'Tunai',
    qris: 'QRIS',
    ewallet: 'E-Wallet',
    bank_transfer: 'Transfer Bank',
    card: 'Kartu',
  };
  return map[method] ?? method;
}
```

- [ ] **Step 3: Write failing test for receipt service**

Create `src/lib/modules/receipt/service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInvoke = vi.fn();
const mockFrom = vi.fn();
const mockInsert = vi.fn();

vi.mock('$lib/supabase/client', () => ({
  getSupabase: () => ({
    functions: { invoke: mockInvoke },
    from: mockFrom,
  }),
}));

import { sendReceipt, queueReceipt, getReceiptsByTransaction } from './service';

beforeEach(() => {
  vi.clearAllMocks();

  const mockSingle = vi.fn().mockResolvedValue({
    data: { id: 'rcpt-1', status: 'queued' },
    error: null,
  });
  const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
  mockFrom.mockReturnValue({
    insert: mockInsert.mockReturnValue({ select: mockSelect }),
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [{ id: 'rcpt-1', type: 'whatsapp', status: 'sent' }],
          error: null,
        }),
      }),
    }),
  });
});

describe('Receipt service', () => {
  it('should queue a receipt in the database', async () => {
    const receipt = await queueReceipt('tx-1', 'whatsapp', '+6281234567890');

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        transaction_id: 'tx-1',
        type: 'whatsapp',
        recipient: '+6281234567890',
        status: 'queued',
      })
    );
    expect(receipt.id).toBe('rcpt-1');
  });

  it('should send a WhatsApp receipt via Edge Function', async () => {
    mockInvoke.mockResolvedValue({ data: { success: true }, error: null });

    const result = await sendReceipt('rcpt-1', 'whatsapp', '+6281234567890', 'Receipt text');
    expect(mockInvoke).toHaveBeenCalledWith('send-receipt-wa', {
      body: expect.objectContaining({
        recipient: '+6281234567890',
        message: 'Receipt text',
      }),
    });
    expect(result.success).toBe(true);
  });

  it('should send an email receipt via Edge Function', async () => {
    mockInvoke.mockResolvedValue({ data: { success: true }, error: null });

    const result = await sendReceipt('rcpt-1', 'email', 'customer@test.com', '<html>...</html>');
    expect(mockInvoke).toHaveBeenCalledWith('send-receipt-email', {
      body: expect.objectContaining({
        recipient: 'customer@test.com',
      }),
    });
    expect(result.success).toBe(true);
  });

  it('should fetch receipts for a transaction', async () => {
    const receipts = await getReceiptsByTransaction('tx-1');
    expect(receipts).toHaveLength(1);
    expect(receipts[0].type).toBe('whatsapp');
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
npx vitest run src/lib/modules/receipt/service.test.ts
```

Expected: FAIL — functions not found.

- [ ] **Step 5: Implement receipt service**

Create `src/lib/modules/receipt/service.ts`:

```typescript
import { getSupabase } from '$lib/supabase/client';
import type { Receipt, ReceiptChannel } from './types';

/**
 * Queue a receipt record in the database (status = queued).
 */
export async function queueReceipt(
  transactionId: string,
  type: ReceiptChannel,
  recipient: string
): Promise<Receipt> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('receipt')
    .insert({
      transaction_id: transactionId,
      type,
      recipient,
      status: 'queued',
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to queue receipt: ${error.message}`);
  return data as Receipt;
}

/**
 * Send a receipt via the appropriate Edge Function.
 * Updates receipt status to 'sent' or 'failed'.
 */
export async function sendReceipt(
  receiptId: string,
  channel: ReceiptChannel,
  recipient: string,
  content: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();

  const functionName = channel === 'whatsapp' ? 'send-receipt-wa' : 'send-receipt-email';

  const { data, error } = await supabase.functions.invoke(functionName, {
    body: {
      receipt_id: receiptId,
      recipient,
      message: content,
    },
  });

  if (error) {
    // Update receipt as failed
    await supabase
      .from('receipt')
      .update({ status: 'failed', error_message: error.message })
      .eq('id', receiptId);

    return { success: false, error: error.message };
  }

  // Update receipt as sent
  await supabase
    .from('receipt')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', receiptId);

  return { success: true };
}

/**
 * Get all receipts for a transaction.
 */
export async function getReceiptsByTransaction(transactionId: string): Promise<Receipt[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('receipt')
    .select()
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch receipts: ${error.message}`);
  return (data ?? []) as Receipt[];
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
npx vitest run src/lib/modules/receipt/service.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/modules/receipt/
git commit -m "feat: add receipt module — types, templates (text + HTML), queue + send service"
```

---

## Task 5: Receipt Edge Functions (WhatsApp + Email)

**Files:**
- Create: `supabase/functions/send-receipt-wa/index.ts`
- Create: `supabase/functions/send-receipt-email/index.ts`

- [ ] **Step 1: Create WhatsApp receipt Edge Function (Fonnte)**

Create `supabase/functions/send-receipt-wa/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FONNTE_API_KEY = Deno.env.get('FONNTE_API_KEY') ?? '';
const FONNTE_API_URL = 'https://api.fonnte.com/send';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { receipt_id, recipient, message } = await req.json();

    if (!recipient || !message) {
      return new Response(
        JSON.stringify({ error: 'recipient and message required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!FONNTE_API_KEY) {
      console.warn('FONNTE_API_KEY not configured, skipping WhatsApp send');
      return new Response(
        JSON.stringify({ success: false, error: 'WhatsApp not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send via Fonnte API
    const formData = new FormData();
    formData.append('target', recipient);
    formData.append('message', message);

    const response = await fetch(FONNTE_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': FONNTE_API_KEY,
      },
      body: formData,
    });

    const result = await response.json();

    // Update receipt status in database
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (result.status) {
      await supabase
        .from('receipt')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', receipt_id);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      const errorMsg = result.reason ?? 'Fonnte send failed';
      await supabase
        .from('receipt')
        .update({ status: 'failed', error_message: errorMsg })
        .eq('id', receipt_id);

      return new Response(
        JSON.stringify({ success: false, error: errorMsg }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (err) {
    console.error('send-receipt-wa error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

- [ ] **Step 2: Create email receipt Edge Function**

Create `supabase/functions/send-receipt-email/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SMTP_HOST = Deno.env.get('SMTP_HOST') ?? '';
const SMTP_PORT = parseInt(Deno.env.get('SMTP_PORT') ?? '587', 10);
const SMTP_USER = Deno.env.get('SMTP_USER') ?? '';
const SMTP_PASS = Deno.env.get('SMTP_PASS') ?? '';
const SMTP_FROM = Deno.env.get('SMTP_FROM') ?? 'receipt@libriscafe.id';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { receipt_id, recipient, message } = await req.json();

    if (!recipient || !message) {
      return new Response(
        JSON.stringify({ error: 'recipient and message required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (!SMTP_HOST || !SMTP_USER) {
      // Fallback: use Supabase's built-in email (via Resend/Postmark if configured)
      // For now, log and mark as failed
      console.warn('SMTP not configured');
      await supabase
        .from('receipt')
        .update({ status: 'failed', error_message: 'Email not configured' })
        .eq('id', receipt_id);

      return new Response(
        JSON.stringify({ success: false, error: 'Email not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send email via SMTP using Deno's built-in network
    // Using a simple SMTP approach compatible with Deno Edge Functions
    const emailPayload = {
      from: SMTP_FROM,
      to: recipient,
      subject: 'Struk Pembelian - Libris Cafe',
      html: message,
    };

    // Use fetch-based email API (e.g., Resend, Mailgun, or similar)
    // This example uses a generic email API endpoint
    const emailApiUrl = Deno.env.get('EMAIL_API_URL') ?? `https://api.resend.com/emails`;
    const emailApiKey = Deno.env.get('EMAIL_API_KEY') ?? SMTP_PASS;

    const response = await fetch(emailApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${emailApiKey}`,
      },
      body: JSON.stringify(emailPayload),
    });

    if (response.ok) {
      await supabase
        .from('receipt')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', receipt_id);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      const errorText = await response.text();
      await supabase
        .from('receipt')
        .update({ status: 'failed', error_message: errorText })
        .eq('id', receipt_id);

      return new Response(
        JSON.stringify({ success: false, error: errorText }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (err) {
    console.error('send-receipt-email error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

- [ ] **Step 3: Update `.env.example` with receipt provider keys**

Append to `.env.example`:

```
# WhatsApp (Fonnte) — set in Supabase secrets
# FONNTE_API_KEY=your-fonnte-api-key

# Email — set in Supabase secrets
# EMAIL_API_URL=https://api.resend.com/emails
# EMAIL_API_KEY=re_xxxxx
# SMTP_FROM=receipt@libriscafe.id
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/send-receipt-wa/ supabase/functions/send-receipt-email/ .env.example
git commit -m "feat: add receipt Edge Functions — WhatsApp (Fonnte) and email sending"
```

---

## Task 6: Dashboard Module — Types, Service & Store

**Files:**
- Create: `src/lib/modules/dashboard/types.ts`
- Create: `src/lib/modules/dashboard/service.ts`
- Create: `src/lib/modules/dashboard/service.test.ts`
- Create: `src/lib/modules/dashboard/stores.svelte.ts`

- [ ] **Step 1: Write dashboard types**

Create `src/lib/modules/dashboard/types.ts`:

```typescript
export interface TodayMetrics {
  total_sales: number;
  transaction_count: number;
  total_margin: number;
  low_stock_count: number;
  out_of_stock_count: number;
  payment_breakdown: PaymentBreakdown[] | null;
}

export interface PaymentBreakdown {
  method: string;
  total: number;
  count: number;
}

export interface SalesTrendPoint {
  date: string;
  total_sales: number;
  transaction_count: number;
}

export interface TopBook {
  book_id: string;
  title: string;
  total_sold: number;
  total_revenue: number;
}

export type DateRange = '7d' | '30d' | '12m';

export interface DashboardState {
  metrics: TodayMetrics | null;
  salesTrend: SalesTrendPoint[];
  topBooks: TopBook[];
  dateRange: DateRange;
  loading: boolean;
  error: string | null;
}
```

- [ ] **Step 2: Write failing test for dashboard service**

Create `src/lib/modules/dashboard/service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRpc = vi.fn();

vi.mock('$lib/supabase/client', () => ({
  getSupabase: () => ({
    rpc: mockRpc,
  }),
}));

import { fetchTodayMetrics, fetchSalesTrend, fetchTopBooks } from './service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Dashboard service', () => {
  it('should fetch today metrics via RPC', async () => {
    mockRpc.mockResolvedValue({
      data: {
        total_sales: 1250000,
        transaction_count: 15,
        total_margin: 450000,
        low_stock_count: 3,
        out_of_stock_count: 1,
        payment_breakdown: [
          { method: 'cash', total: 750000, count: 10 },
          { method: 'qris', total: 500000, count: 5 },
        ],
      },
      error: null,
    });

    const metrics = await fetchTodayMetrics('outlet-1');
    expect(mockRpc).toHaveBeenCalledWith('get_today_metrics', { p_outlet_id: 'outlet-1' });
    expect(metrics.total_sales).toBe(1250000);
    expect(metrics.transaction_count).toBe(15);
    expect(metrics.payment_breakdown).toHaveLength(2);
  });

  it('should fetch sales trend via RPC', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { date: '2026-03-12', total_sales: 500000, transaction_count: 8 },
        { date: '2026-03-13', total_sales: 750000, transaction_count: 12 },
      ],
      error: null,
    });

    const trend = await fetchSalesTrend('outlet-1', '2026-03-12', '2026-03-18');
    expect(mockRpc).toHaveBeenCalledWith('get_sales_trend', {
      p_outlet_id: 'outlet-1',
      p_start_date: '2026-03-12',
      p_end_date: '2026-03-18',
    });
    expect(trend).toHaveLength(2);
  });

  it('should fetch top books via RPC', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { book_id: 'b-1', title: 'Atomic Habits', total_sold: 25, total_revenue: 2225000 },
      ],
      error: null,
    });

    const books = await fetchTopBooks('outlet-1', '2026-03-01', '2026-03-18', 10);
    expect(books).toHaveLength(1);
    expect(books[0].title).toBe('Atomic Habits');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run src/lib/modules/dashboard/service.test.ts
```

Expected: FAIL — functions not found.

- [ ] **Step 4: Implement dashboard service**

Create `src/lib/modules/dashboard/service.ts`:

```typescript
import { getSupabase } from '$lib/supabase/client';
import type { TodayMetrics, SalesTrendPoint, TopBook } from './types';

/**
 * Fetch today's dashboard metrics via Supabase RPC.
 */
export async function fetchTodayMetrics(outletId: string): Promise<TodayMetrics> {
  const supabase = getSupabase();

  const { data, error } = await supabase.rpc('get_today_metrics', {
    p_outlet_id: outletId,
  });

  if (error) throw new Error(`Failed to fetch metrics: ${error.message}`);

  return data as TodayMetrics;
}

/**
 * Fetch sales trend data for a date range.
 */
export async function fetchSalesTrend(
  outletId: string,
  startDate: string,
  endDate: string
): Promise<SalesTrendPoint[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase.rpc('get_sales_trend', {
    p_outlet_id: outletId,
    p_start_date: startDate,
    p_end_date: endDate,
  });

  if (error) throw new Error(`Failed to fetch sales trend: ${error.message}`);
  return (data ?? []) as SalesTrendPoint[];
}

/**
 * Fetch top selling books for a date range.
 */
export async function fetchTopBooks(
  outletId: string,
  startDate: string,
  endDate: string,
  limit: number = 10
): Promise<TopBook[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase.rpc('get_top_books', {
    p_outlet_id: outletId,
    p_start_date: startDate,
    p_end_date: endDate,
    p_limit: limit,
  });

  if (error) throw new Error(`Failed to fetch top books: ${error.message}`);
  return (data ?? []) as TopBook[];
}

/**
 * Calculate date range bounds from a preset.
 */
export function getDateRange(range: '7d' | '30d' | '12m'): { start: string; end: string } {
  const end = new Date();
  const start = new Date();

  switch (range) {
    case '7d':
      start.setDate(end.getDate() - 6);
      break;
    case '30d':
      start.setDate(end.getDate() - 29);
      break;
    case '12m':
      start.setMonth(end.getMonth() - 11);
      start.setDate(1);
      break;
  }

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

/**
 * Refresh materialized views (call periodically or after batch changes).
 */
export async function refreshDashboardViews(): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('refresh_dashboard_views');
  if (error) console.warn('Failed to refresh dashboard views:', error.message);
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run src/lib/modules/dashboard/service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Write dashboard store**

Create `src/lib/modules/dashboard/stores.svelte.ts`:

```typescript
import type { DashboardState, DateRange, TodayMetrics, SalesTrendPoint, TopBook } from './types';
import { fetchTodayMetrics, fetchSalesTrend, fetchTopBooks, getDateRange } from './service';

let state = $state<DashboardState>({
  metrics: null,
  salesTrend: [],
  topBooks: [],
  dateRange: '7d',
  loading: false,
  error: null,
});

export function getDashboardState(): DashboardState {
  return state;
}

export function setDateRange(range: DateRange): void {
  state = { ...state, dateRange: range };
}

/**
 * Load all dashboard data for the given outlet.
 */
export async function loadDashboard(outletId: string): Promise<void> {
  state = { ...state, loading: true, error: null };

  try {
    const { start, end } = getDateRange(state.dateRange);

    const [metrics, salesTrend, topBooks] = await Promise.all([
      fetchTodayMetrics(outletId),
      fetchSalesTrend(outletId, start, end),
      fetchTopBooks(outletId, start, end, 10),
    ]);

    state = {
      ...state,
      metrics,
      salesTrend,
      topBooks,
      loading: false,
    };
  } catch (err) {
    state = {
      ...state,
      loading: false,
      error: err instanceof Error ? err.message : 'Failed to load dashboard',
    };
  }
}

/**
 * Refresh only today's metrics (lighter call for realtime updates).
 */
export async function refreshMetrics(outletId: string): Promise<void> {
  try {
    const metrics = await fetchTodayMetrics(outletId);
    state = { ...state, metrics };
  } catch {
    // Silent fail for realtime refresh
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/modules/dashboard/
git commit -m "feat: add dashboard module — metrics, sales trend, top books via RPC"
```

---

## Task 7: i18n — Add Phase 2 Strings

**Files:**
- Modify: `src/lib/i18n/en.ts`
- Modify: `src/lib/i18n/id.ts`

- [ ] **Step 1: Add English strings**

Add to `src/lib/i18n/en.ts` (append to the existing object):

```typescript
// Payment
'payment.select_method': 'Select Payment Method',
'payment.cash': 'Cash',
'payment.qris': 'QRIS',
'payment.ewallet': 'E-Wallet',
'payment.bank_transfer': 'Bank Transfer',
'payment.card': 'Card',
'payment.processing': 'Processing payment...',
'payment.waiting': 'Waiting for payment...',
'payment.success': 'Payment successful!',
'payment.failed': 'Payment failed',
'payment.expired': 'Payment expired',
'payment.cancelled': 'Payment cancelled',
'payment.pending': 'Payment pending',
'payment.retry': 'Retry Payment',
'payment.digital_disabled_offline': 'Digital payment unavailable offline. Use cash.',

// Receipt
'receipt.title': 'Send Receipt',
'receipt.send_whatsapp': 'Send via WhatsApp',
'receipt.send_email': 'Send via Email',
'receipt.phone_placeholder': 'WhatsApp number (e.g. 08123...)',
'receipt.email_placeholder': 'Email address',
'receipt.sending': 'Sending...',
'receipt.sent': 'Receipt sent!',
'receipt.failed': 'Failed to send receipt',
'receipt.skip': 'Skip Receipt',
'receipt.resend': 'Resend',

// Dashboard
'dashboard.title': 'Dashboard',
'dashboard.today': "Today's Overview",
'dashboard.total_sales': 'Total Sales',
'dashboard.transactions': 'Transactions',
'dashboard.margin': 'Margin',
'dashboard.low_stock': 'Low Stock',
'dashboard.out_of_stock': 'Out of Stock',
'dashboard.sales_trend': 'Sales Trend',
'dashboard.top_books': 'Top Selling Books',
'dashboard.period_7d': '7 Days',
'dashboard.period_30d': '30 Days',
'dashboard.period_12m': '12 Months',
'dashboard.no_data': 'No data for this period',
'dashboard.sold': 'sold',
'dashboard.payment_breakdown': 'By Payment Method',
'dashboard.refresh': 'Refresh',

// Browse (pelanggan)
'browse.available': 'Available',
'browse.out_of_stock': 'Habis',
'browse.read_in_store': 'Read in Store',
'browse.also_read': 'Can read in store',
'browse.preloved': 'Preloved',
'browse.location': 'Location',

// Navigation (new)
'nav.dashboard': 'Dashboard',
```

- [ ] **Step 2: Add Indonesian strings**

Add matching keys to `src/lib/i18n/id.ts`:

```typescript
// Payment
'payment.select_method': 'Pilih Metode Pembayaran',
'payment.cash': 'Tunai',
'payment.qris': 'QRIS',
'payment.ewallet': 'E-Wallet',
'payment.bank_transfer': 'Transfer Bank',
'payment.card': 'Kartu',
'payment.processing': 'Memproses pembayaran...',
'payment.waiting': 'Menunggu pembayaran...',
'payment.success': 'Pembayaran berhasil!',
'payment.failed': 'Pembayaran gagal',
'payment.expired': 'Pembayaran kedaluwarsa',
'payment.cancelled': 'Pembayaran dibatalkan',
'payment.pending': 'Menunggu pembayaran',
'payment.retry': 'Coba Lagi',
'payment.digital_disabled_offline': 'Pembayaran digital tidak tersedia offline. Gunakan tunai.',

// Receipt
'receipt.title': 'Kirim Struk',
'receipt.send_whatsapp': 'Kirim via WhatsApp',
'receipt.send_email': 'Kirim via Email',
'receipt.phone_placeholder': 'Nomor WhatsApp (cth. 08123...)',
'receipt.email_placeholder': 'Alamat email',
'receipt.sending': 'Mengirim...',
'receipt.sent': 'Struk terkirim!',
'receipt.failed': 'Gagal mengirim struk',
'receipt.skip': 'Lewati Struk',
'receipt.resend': 'Kirim Ulang',

// Dashboard
'dashboard.title': 'Dashboard',
'dashboard.today': 'Ringkasan Hari Ini',
'dashboard.total_sales': 'Total Penjualan',
'dashboard.transactions': 'Transaksi',
'dashboard.margin': 'Margin',
'dashboard.low_stock': 'Stok Rendah',
'dashboard.out_of_stock': 'Habis',
'dashboard.sales_trend': 'Tren Penjualan',
'dashboard.top_books': 'Buku Terlaris',
'dashboard.period_7d': '7 Hari',
'dashboard.period_30d': '30 Hari',
'dashboard.period_12m': '12 Bulan',
'dashboard.no_data': 'Belum ada data untuk periode ini',
'dashboard.sold': 'terjual',
'dashboard.payment_breakdown': 'Per Metode Pembayaran',
'dashboard.refresh': 'Segarkan',

// Browse (pelanggan)
'browse.available': 'Tersedia',
'browse.out_of_stock': 'Habis',
'browse.read_in_store': 'Baca di Tempat',
'browse.also_read': 'Bisa dibaca di tempat',
'browse.preloved': 'Preloved',
'browse.location': 'Lokasi',

// Navigation (new)
'nav.dashboard': 'Dashboard',
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/i18n/
git commit -m "feat: add i18n strings for payment, receipt, dashboard, browse"
```

---

## Task 8: Update POS — Digital Payment Flow + Receipt

**Files:**
- Modify: `src/lib/modules/pos/types.ts`
- Modify: `src/lib/modules/pos/checkout.ts`
- Create: `src/lib/components/PaymentModal.svelte`
- Create: `src/lib/components/ReceiptSender.svelte`
- Modify: `src/routes/staff/pos/+page.svelte`

- [ ] **Step 1: Extend POS types for digital payments**

In `src/lib/modules/pos/types.ts`, update `CheckoutRequest`:

Replace:
```typescript
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

With:
```typescript
export type PaymentMethodType = 'cash' | 'qris' | 'ewallet' | 'bank_transfer' | 'card';

export interface CheckoutRequest {
  cart: Cart;
  paymentMethod: PaymentMethodType;
  staffId: string;
  outletId: string;
  customerName?: string;
  customerContact?: string;
  notes?: string;
}

export interface CheckoutResult {
  transactionId: string | null;
  offlineId: string;
  synced: boolean;
  requiresPayment: boolean;  // true for digital methods
  orderId?: string;
}
```

- [ ] **Step 2: Update checkout for digital payment methods**

In `src/lib/modules/pos/checkout.ts`, update the `checkout` function. Replace the entire file:

```typescript
import { getSupabase } from '$lib/supabase/client';
import { getQueue, getIsOnline } from '../sync/manager';
import type { CheckoutRequest } from './types';

export interface CheckoutResult {
  transactionId: string | null;
  offlineId: string;
  synced: boolean;
  requiresPayment: boolean;
  orderId?: string;
}

export async function checkout(request: CheckoutRequest): Promise<CheckoutResult> {
  const offlineId = crypto.randomUUID();
  const { cart, paymentMethod, staffId, outletId, customerName, customerContact, notes } = request;

  const isDigital = paymentMethod !== 'cash';
  const isCashPayment = paymentMethod === 'cash';

  const transactionPayload = {
    outlet_id: outletId,
    staff_id: staffId,
    type: 'sale' as const,
    subtotal: cart.subtotal,
    discount: cart.discount,
    tax: cart.tax,
    total: cart.total,
    payment_method: paymentMethod,
    payment_status: isCashPayment ? ('paid' as const) : ('pending' as const),
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

  // Digital payments require online
  if (isDigital && !getIsOnline()) {
    throw new Error('Digital payment requires internet connection');
  }

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

      // For cash: immediately record stock movements
      if (isCashPayment) {
        for (const item of cart.items) {
          await supabase.from('stock_movement').insert({
            inventory_id: item.inventory.id,
            type: 'sale_out',
            quantity: -item.quantity,
            reference_id: txData.id,
            staff_id: staffId,
          });
        }
      }
      // For digital: stock decrement happens in webhook after payment confirmed

      return {
        transactionId: txData.id,
        offlineId,
        synced: true,
        requiresPayment: isDigital,
        orderId: offlineId,  // used as Midtrans order_id base
      };
    } catch (err) {
      // For digital payments, don't fall back to offline — throw
      if (isDigital) throw err;
      // For cash, fall through to offline queue
    }
  }

  // Queue offline (cash only — digital already threw above)
  const queue = getQueue();
  await queue.enqueue('transaction', {
    ...transactionPayload,
    items: itemsPayload,
  });

  return { transactionId: null, offlineId, synced: false, requiresPayment: false };
}
```

- [ ] **Step 3: Create PaymentModal component**

Create `src/lib/components/PaymentModal.svelte`:

```svelte
<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import { loadSnapJs, openSnapPayment, isSnapReady } from '$lib/modules/payment/snap';
  import { createSnapPayment, generateOrderId } from '$lib/modules/payment/service';
  import { setActivePayment, clearActivePayment } from '$lib/modules/payment/stores.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import type { Cart } from '$lib/modules/pos/types';

  interface Props {
    transactionId: string;
    cart: Cart;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    onSuccess: (result: Record<string, string>) => void;
    onPending: () => void;
    onClose: () => void;
  }

  let { transactionId, cart, customerName, customerEmail, customerPhone, onSuccess, onPending, onClose }: Props = $props();

  let status = $state<'loading' | 'ready' | 'paying' | 'error'>('loading');
  let errorMsg = $state('');

  async function initPayment() {
    status = 'loading';
    try {
      // Load Snap.js
      await loadSnapJs();

      // Create payment token via Edge Function
      const orderId = generateOrderId();
      const items = cart.items.map(item => ({
        id: item.inventory.id,
        name: item.book.title,
        price: item.unitPrice,
        quantity: item.quantity,
      }));

      const response = await createSnapPayment({
        transactionId,
        orderId,
        grossAmount: cart.total,
        customerName,
        customerEmail,
        customerPhone,
        items,
      });

      setActivePayment({
        orderId: response.orderId,
        transactionId,
        status: 'pending',
        snapToken: response.snapToken,
      });

      // Open Snap popup
      status = 'paying';
      const result = await openSnapPayment(response.snapToken);

      if (result.success) {
        clearActivePayment();
        onSuccess(result.result!);
      } else if (result.pending) {
        onPending();
      } else {
        clearActivePayment();
        if (result.error === 'Payment popup closed') {
          onClose();
        } else {
          errorMsg = result.error ?? 'Payment failed';
          status = 'error';
        }
      }
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Payment initialization failed';
      status = 'error';
      clearActivePayment();
    }
  }

  // Auto-start on mount
  $effect(() => {
    initPayment();
  });
</script>

<div class="fixed inset-0 bg-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
  <div class="bg-surface rounded-2xl w-full max-w-sm p-6 shadow-xl">
    {#if status === 'loading'}
      <div class="text-center space-y-4">
        <div class="w-12 h-12 mx-auto rounded-full bg-accent/10 flex items-center justify-center">
          <svg class="w-6 h-6 text-accent animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
        </div>
        <p class="text-sm text-ink-muted">{t('payment.processing')}</p>
      </div>
    {:else if status === 'paying'}
      <div class="text-center space-y-4">
        <div class="w-12 h-12 mx-auto rounded-full bg-gold/10 flex items-center justify-center">
          <svg class="w-6 h-6 text-gold" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
        </div>
        <p class="text-sm text-ink-muted">{t('payment.waiting')}</p>
        <p class="text-xs text-ink-muted">
          Rp {cart.total.toLocaleString('id-ID')}
        </p>
      </div>
    {:else if status === 'error'}
      <div class="text-center space-y-4">
        <div class="w-12 h-12 mx-auto rounded-full bg-berry/10 flex items-center justify-center">
          <svg class="w-6 h-6 text-berry" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        </div>
        <p class="text-sm font-medium text-berry">{t('payment.failed')}</p>
        <p class="text-xs text-ink-muted">{errorMsg}</p>
        <div class="flex gap-2">
          <button
            class="flex-1 py-2.5 rounded-xl bg-accent text-cream text-sm font-medium"
            onclick={initPayment}
          >
            {t('payment.retry')}
          </button>
          <button
            class="flex-1 py-2.5 rounded-xl bg-warm-100 text-ink-muted text-sm font-medium"
            onclick={onClose}
          >
            {t('receipt.skip')}
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>
```

- [ ] **Step 4: Create ReceiptSender component**

Create `src/lib/components/ReceiptSender.svelte`:

```svelte
<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import { queueReceipt, sendReceipt } from '$lib/modules/receipt/service';
  import { formatReceiptText, formatReceiptHtml } from '$lib/modules/receipt/template';
  import { showToast } from '$lib/stores/toast.svelte';
  import type { ReceiptData, ReceiptChannel } from '$lib/modules/receipt/types';

  interface Props {
    receiptData: ReceiptData;
    onDone: () => void;
  }

  let { receiptData, onDone }: Props = $props();

  let channel = $state<ReceiptChannel>('whatsapp');
  let recipient = $state('');
  let sending = $state(false);

  async function handleSend() {
    if (!recipient.trim() || sending) return;

    sending = true;
    try {
      // Queue receipt record
      const receipt = await queueReceipt(receiptData.transactionId, channel, recipient);

      // Generate content
      const content = channel === 'whatsapp'
        ? formatReceiptText(receiptData)
        : formatReceiptHtml(receiptData);

      // Send via Edge Function
      const result = await sendReceipt(receipt.id, channel, recipient, content);

      if (result.success) {
        showToast(t('receipt.sent'), 'success');
        onDone();
      } else {
        showToast(`${t('receipt.failed')}: ${result.error}`, 'error');
      }
    } catch (err) {
      showToast(t('receipt.failed'), 'error');
    } finally {
      sending = false;
    }
  }
</script>

<div class="bg-surface rounded-2xl border border-warm-100 p-5 space-y-4">
  <h3 class="font-display text-lg font-bold text-ink">{t('receipt.title')}</h3>

  <!-- Channel Toggle -->
  <div class="flex gap-2">
    <button
      class="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors {channel === 'whatsapp' ? 'bg-sage/10 text-sage border-2 border-sage/30' : 'bg-warm-50 text-ink-muted'}"
      onclick={() => { channel = 'whatsapp'; recipient = ''; }}
    >
      WhatsApp
    </button>
    <button
      class="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors {channel === 'email' ? 'bg-accent/10 text-accent border-2 border-accent/30' : 'bg-warm-50 text-ink-muted'}"
      onclick={() => { channel = 'email'; recipient = ''; }}
    >
      Email
    </button>
  </div>

  <!-- Recipient Input -->
  <div>
    {#if channel === 'whatsapp'}
      <input
        type="tel"
        bind:value={recipient}
        placeholder={t('receipt.phone_placeholder')}
        class="w-full px-4 py-3 rounded-xl bg-cream border border-warm-100 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-sage/30 focus:border-sage transition-all"
      />
    {:else}
      <input
        type="email"
        bind:value={recipient}
        placeholder={t('receipt.email_placeholder')}
        class="w-full px-4 py-3 rounded-xl bg-cream border border-warm-100 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
      />
    {/if}
  </div>

  <!-- Summary Preview -->
  <div class="bg-cream rounded-xl p-3 text-xs text-ink-muted space-y-1">
    <p class="font-medium text-ink text-sm">Rp {receiptData.total.toLocaleString('id-ID')}</p>
    <p>{receiptData.items.length} item · {receiptData.date}</p>
  </div>

  <!-- Actions -->
  <div class="flex gap-2">
    <button
      class="flex-1 py-3 rounded-xl bg-accent text-cream font-semibold text-sm hover:bg-accent/90 transition-colors disabled:opacity-50"
      onclick={handleSend}
      disabled={!recipient.trim() || sending}
    >
      {sending ? t('receipt.sending') : (channel === 'whatsapp' ? t('receipt.send_whatsapp') : t('receipt.send_email'))}
    </button>
    <button
      class="px-4 py-3 rounded-xl bg-warm-50 text-ink-muted text-sm font-medium hover:bg-warm-100 transition-colors"
      onclick={onDone}
    >
      {t('receipt.skip')}
    </button>
  </div>
</div>
```

- [ ] **Step 5: Update POS page with payment method selection and receipt**

Replace `src/routes/staff/pos/+page.svelte` script section's `handleCheckout` function and add the payment modal and receipt sender. Add the following after the existing imports:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/index.svelte';
  import { searchBooks, getBookById } from '$lib/services/books';
  import BarcodeScanner from '$lib/components/BarcodeScanner.svelte';
  import PaymentModal from '$lib/components/PaymentModal.svelte';
  import ReceiptSender from '$lib/components/ReceiptSender.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import { showConfirm } from '$lib/stores/dialog.svelte';
  import { getCurrentStaff } from '$lib/modules/auth/stores.svelte';
  import { getInventoryByBookId } from '$lib/modules/inventory/service';
  import { addToCart, removeFromCart, updateQuantity, clearCart } from '$lib/modules/pos/cart';
  import { getCart, setCart, resetCart } from '$lib/modules/pos/stores.svelte';
  import { checkout } from '$lib/modules/pos/checkout';
  import { getIsOnline } from '$lib/modules/sync/manager';
  import type { Book } from '$lib/db';
  import type { PaymentMethodType } from '$lib/modules/pos/types';
  import type { ReceiptData } from '$lib/modules/receipt/types';

  let searchQuery = $state('');
  let searchResults = $state<Book[]>([]);
  let showScanner = $state(false);
  let processing = $state(false);
  let cart = $derived(getCart());
  let staff = $derived(getCurrentStaff());
  let online = $derived(getIsOnline());

  // Payment method selection
  let selectedPayment = $state<PaymentMethodType>('cash');
  let showPaymentModal = $state(false);
  let pendingTransactionId = $state<string | null>(null);

  // Receipt state
  let showReceipt = $state(false);
  let receiptData = $state<ReceiptData | null>(null);

  let searchTimeout: ReturnType<typeof setTimeout>;

  const paymentMethods: { value: PaymentMethodType; label: string; icon: string; digitalOnly: boolean }[] = [
    { value: 'cash', label: 'payment.cash', icon: '💵', digitalOnly: false },
    { value: 'qris', label: 'payment.qris', icon: '📱', digitalOnly: true },
    { value: 'ewallet', label: 'payment.ewallet', icon: '📲', digitalOnly: true },
    { value: 'bank_transfer', label: 'payment.bank_transfer', icon: '🏦', digitalOnly: true },
    { value: 'card', label: 'payment.card', icon: '💳', digitalOnly: true },
  ];

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

    // Check if digital payment is available
    if (selectedPayment !== 'cash' && !online) {
      showToast(t('payment.digital_disabled_offline'), 'error');
      return;
    }

    const confirmed = await showConfirm({
      title: `${t(`payment.${selectedPayment}`)} — Rp ${cart.total.toLocaleString('id-ID')}`,
      message: `${cart.items.length} item(s)`,
    });

    if (!confirmed) return;

    processing = true;
    try {
      const result = await checkout({
        cart,
        paymentMethod: selectedPayment,
        staffId: staff.id,
        outletId: staff.outlet_id,
      });

      if (result.requiresPayment && result.transactionId) {
        // Digital payment — show Snap modal
        pendingTransactionId = result.transactionId;
        showPaymentModal = true;
      } else if (result.synced) {
        // Cash payment — success
        showToast(t('pos.checkout_success'), 'success');
        prepareReceipt(result.transactionId, result.offlineId);
      } else {
        // Offline queued
        showToast(t('pos.checkout_offline'), 'info');
        resetCart();
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Checkout failed', 'error');
    } finally {
      processing = false;
    }
  }

  function handlePaymentSuccess(result: Record<string, string>) {
    showPaymentModal = false;
    showToast(t('payment.success'), 'success');
    prepareReceipt(pendingTransactionId, null);
  }

  function handlePaymentPending() {
    showPaymentModal = false;
    showToast(t('payment.pending'), 'info');
    prepareReceipt(pendingTransactionId, null);
  }

  function handlePaymentClose() {
    showPaymentModal = false;
    pendingTransactionId = null;
    showToast(t('payment.cancelled'), 'info');
  }

  function prepareReceipt(transactionId: string | null, offlineId: string | null) {
    if (!staff || !transactionId) {
      resetCart();
      return;
    }

    const now = new Date();
    receiptData = {
      transactionId,
      orderId: offlineId ?? transactionId.slice(0, 8),
      date: now.toLocaleDateString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }),
      items: cart.items.map(item => ({
        title: item.book.title,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.total,
      })),
      subtotal: cart.subtotal,
      tax: cart.tax,
      discount: cart.discount,
      total: cart.total,
      paymentMethod: selectedPayment,
      paymentReference: null,
      cafeName: 'Libris Cafe',
      cafeAddress: 'Alamat cafe di sini',
      staffName: staff.name,
    };
    showReceipt = true;
  }

  function handleReceiptDone() {
    showReceipt = false;
    receiptData = null;
    pendingTransactionId = null;
    resetCart();
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

      <!-- Payment Method Selection -->
      <div class="px-4 py-3 border-t border-warm-100">
        <p class="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">{t('payment.select_method')}</p>
        <div class="grid grid-cols-3 gap-2">
          {#each paymentMethods as method}
            <button
              class="py-2 px-2 rounded-xl text-xs font-medium transition-all {selectedPayment === method.value ? 'bg-accent text-cream shadow-sm' : 'bg-warm-50 text-ink-muted'} {method.digitalOnly && !online ? 'opacity-40 cursor-not-allowed' : ''}"
              onclick={() => { if (!method.digitalOnly || online) selectedPayment = method.value; }}
              disabled={method.digitalOnly && !online}
            >
              <span class="block text-base mb-0.5">{method.icon}</span>
              {t(method.label)}
            </button>
          {/each}
        </div>
        {#if !online}
          <p class="text-[11px] text-gold mt-1.5">{t('payment.digital_disabled_offline')}</p>
        {/if}
      </div>

      <!-- Checkout Button -->
      <div class="px-4 py-3 border-t border-warm-100">
        <button
          class="w-full py-3 rounded-xl bg-accent text-cream font-semibold text-sm hover:bg-accent/90 transition-colors disabled:opacity-50"
          onclick={handleCheckout}
          disabled={processing}
        >
          {processing ? '...' : `${t(`payment.${selectedPayment}`)} — ${formatPrice(cart.total)}`}
        </button>
      </div>
    {/if}
  </div>

  <!-- Receipt Sender (after checkout) -->
  {#if showReceipt && receiptData}
    <ReceiptSender
      {receiptData}
      onDone={handleReceiptDone}
    />
  {/if}
</div>

<!-- Payment Modal (digital payments) -->
{#if showPaymentModal && pendingTransactionId}
  <PaymentModal
    transactionId={pendingTransactionId}
    {cart}
    onSuccess={handlePaymentSuccess}
    onPending={handlePaymentPending}
    onClose={handlePaymentClose}
  />
{/if}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/modules/pos/ src/lib/components/PaymentModal.svelte src/lib/components/ReceiptSender.svelte src/routes/staff/pos/
git commit -m "feat: update POS — digital payment methods, Snap modal, receipt sender"
```

---

## Task 9: Dashboard Pages (Staff + Owner)

**Files:**
- Create: `src/lib/components/DashboardCard.svelte`
- Create: `src/lib/components/SalesChart.svelte`
- Create: `src/routes/staff/dashboard/+page.svelte`
- Create: `src/routes/owner/+layout.svelte`
- Create: `src/routes/owner/dashboard/+page.svelte`

- [ ] **Step 1: Install Chart.js**

```bash
npm install chart.js
```

- [ ] **Step 2: Create DashboardCard component**

Create `src/lib/components/DashboardCard.svelte`:

```svelte
<script lang="ts">
  interface Props {
    label: string;
    value: string;
    subtitle?: string;
    color?: 'accent' | 'sage' | 'berry' | 'gold';
  }

  let { label, value, subtitle, color = 'accent' }: Props = $props();

  const colorMap = {
    accent: 'bg-accent/10 text-accent',
    sage: 'bg-sage/10 text-sage',
    berry: 'bg-berry/10 text-berry',
    gold: 'bg-gold/10 text-gold',
  };
</script>

<div class="bg-surface rounded-xl border border-warm-100 p-4">
  <p class="text-xs font-semibold text-ink-muted uppercase tracking-wide">{label}</p>
  <p class="text-2xl font-bold text-ink mt-1 font-display">{value}</p>
  {#if subtitle}
    <span class="inline-block mt-1.5 text-[11px] px-2 py-0.5 rounded-full font-medium {colorMap[color]}">
      {subtitle}
    </span>
  {/if}
</div>
```

- [ ] **Step 3: Create SalesChart component**

Create `src/lib/components/SalesChart.svelte`:

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Chart, registerables } from 'chart.js';
  import type { SalesTrendPoint } from '$lib/modules/dashboard/types';

  Chart.register(...registerables);

  interface Props {
    data: SalesTrendPoint[];
  }

  let { data }: Props = $props();

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;

  function buildChart() {
    if (chart) chart.destroy();
    if (!canvas || data.length === 0) return;

    const labels = data.map(d => {
      const date = new Date(d.date);
      return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    });

    chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Penjualan',
          data: data.map(d => d.total_sales),
          borderColor: '#d4763c',
          backgroundColor: 'rgba(212, 118, 60, 0.1)',
          borderWidth: 2,
          tension: 0.3,
          fill: true,
          pointRadius: 3,
          pointBackgroundColor: '#d4763c',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `Rp ${ctx.parsed.y.toLocaleString('id-ID')}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              font: { size: 10, family: 'Source Sans 3' },
              color: '#8a857e',
            },
          },
          y: {
            grid: { color: '#f0ebe4' },
            ticks: {
              font: { size: 10, family: 'Source Sans 3' },
              color: '#8a857e',
              callback: (val) => `Rp ${(Number(val) / 1000).toFixed(0)}k`,
            },
          },
        },
      },
    });
  }

  onMount(() => {
    buildChart();
  });

  $effect(() => {
    // Rebuild chart when data changes
    if (data) buildChart();
  });

  onDestroy(() => {
    chart?.destroy();
  });
</script>

<div class="bg-surface rounded-xl border border-warm-100 p-4">
  <div style="height: 200px;">
    <canvas bind:this={canvas}></canvas>
  </div>
</div>
```

- [ ] **Step 4: Create staff dashboard page**

Create `src/routes/staff/dashboard/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/index.svelte';
  import { getCurrentStaff } from '$lib/modules/auth/stores.svelte';
  import { getDashboardState, loadDashboard, refreshMetrics } from '$lib/modules/dashboard/stores.svelte';
  import DashboardCard from '$lib/components/DashboardCard.svelte';

  let staff = $derived(getCurrentStaff());
  let dashboard = $derived(getDashboardState());

  onMount(async () => {
    if (staff) {
      await loadDashboard(staff.outlet_id);
    }
  });

  function formatRp(amount: number): string {
    if (amount >= 1_000_000) return `Rp ${(amount / 1_000_000).toFixed(1)}jt`;
    if (amount >= 1_000) return `Rp ${(amount / 1_000).toFixed(0)}rb`;
    return `Rp ${amount.toLocaleString('id-ID')}`;
  }

  async function handleRefresh() {
    if (staff) await loadDashboard(staff.outlet_id);
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h1 class="font-display text-xl font-bold text-ink">{t('dashboard.today')}</h1>
    <button
      class="text-xs text-accent font-medium px-3 py-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 transition-colors"
      onclick={handleRefresh}
      disabled={dashboard.loading}
    >
      {t('dashboard.refresh')}
    </button>
  </div>

  {#if dashboard.loading && !dashboard.metrics}
    <div class="py-8 text-center text-sm text-ink-muted">Loading...</div>
  {:else if dashboard.error}
    <div class="py-8 text-center text-sm text-berry">{dashboard.error}</div>
  {:else if dashboard.metrics}
    <!-- Metric Cards -->
    <div class="grid grid-cols-2 gap-3">
      <DashboardCard
        label={t('dashboard.total_sales')}
        value={formatRp(dashboard.metrics.total_sales)}
        subtitle="{dashboard.metrics.transaction_count} {t('dashboard.transactions').toLowerCase()}"
        color="accent"
      />
      <DashboardCard
        label={t('dashboard.margin')}
        value={formatRp(dashboard.metrics.total_margin)}
        color="sage"
      />
      <DashboardCard
        label={t('dashboard.low_stock')}
        value={String(dashboard.metrics.low_stock_count)}
        color="gold"
      />
      <DashboardCard
        label={t('dashboard.out_of_stock')}
        value={String(dashboard.metrics.out_of_stock_count)}
        color="berry"
      />
    </div>

    <!-- Payment Breakdown -->
    {#if dashboard.metrics.payment_breakdown && dashboard.metrics.payment_breakdown.length > 0}
      <div class="bg-surface rounded-xl border border-warm-100 p-4">
        <h3 class="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-3">{t('dashboard.payment_breakdown')}</h3>
        <div class="space-y-2">
          {#each dashboard.metrics.payment_breakdown as pb}
            <div class="flex items-center justify-between text-sm">
              <span class="text-ink-muted capitalize">{pb.method === 'cash' ? 'Tunai' : pb.method.toUpperCase()}</span>
              <div class="text-right">
                <span class="font-semibold text-ink">{formatRp(pb.total)}</span>
                <span class="text-xs text-ink-muted ml-1">({pb.count}x)</span>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>
```

- [ ] **Step 5: Create owner layout**

Create `src/routes/owner/+layout.svelte`:

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

- [ ] **Step 6: Create owner dashboard page**

Create `src/routes/owner/dashboard/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/index.svelte';
  import { getCurrentStaff } from '$lib/modules/auth/stores.svelte';
  import {
    getDashboardState,
    loadDashboard,
    setDateRange,
  } from '$lib/modules/dashboard/stores.svelte';
  import DashboardCard from '$lib/components/DashboardCard.svelte';
  import SalesChart from '$lib/components/SalesChart.svelte';
  import type { DateRange } from '$lib/modules/dashboard/types';

  let staff = $derived(getCurrentStaff());
  let dashboard = $derived(getDashboardState());

  onMount(async () => {
    if (staff) {
      await loadDashboard(staff.outlet_id);
    }
  });

  async function handleDateRange(range: DateRange) {
    setDateRange(range);
    if (staff) await loadDashboard(staff.outlet_id);
  }

  function formatRp(amount: number): string {
    if (amount >= 1_000_000) return `Rp ${(amount / 1_000_000).toFixed(1)}jt`;
    if (amount >= 1_000) return `Rp ${(amount / 1_000).toFixed(0)}rb`;
    return `Rp ${amount.toLocaleString('id-ID')}`;
  }

  async function handleRefresh() {
    if (staff) await loadDashboard(staff.outlet_id);
  }
</script>

<div class="space-y-4">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <h1 class="font-display text-xl font-bold text-ink">{t('dashboard.title')}</h1>
    <button
      class="text-xs text-accent font-medium px-3 py-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 transition-colors"
      onclick={handleRefresh}
      disabled={dashboard.loading}
    >
      {t('dashboard.refresh')}
    </button>
  </div>

  {#if dashboard.loading && !dashboard.metrics}
    <div class="py-8 text-center text-sm text-ink-muted">Loading...</div>
  {:else if dashboard.error}
    <div class="py-8 text-center text-sm text-berry">{dashboard.error}</div>
  {:else if dashboard.metrics}
    <!-- Today's Metrics -->
    <div>
      <h2 class="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">{t('dashboard.today')}</h2>
      <div class="grid grid-cols-2 gap-3">
        <DashboardCard
          label={t('dashboard.total_sales')}
          value={formatRp(dashboard.metrics.total_sales)}
          subtitle="{dashboard.metrics.transaction_count} {t('dashboard.transactions').toLowerCase()}"
          color="accent"
        />
        <DashboardCard
          label={t('dashboard.margin')}
          value={formatRp(dashboard.metrics.total_margin)}
          color="sage"
        />
        <DashboardCard
          label={t('dashboard.low_stock')}
          value={String(dashboard.metrics.low_stock_count)}
          color="gold"
        />
        <DashboardCard
          label={t('dashboard.out_of_stock')}
          value={String(dashboard.metrics.out_of_stock_count)}
          color="berry"
        />
      </div>
    </div>

    <!-- Payment Breakdown -->
    {#if dashboard.metrics.payment_breakdown && dashboard.metrics.payment_breakdown.length > 0}
      <div class="bg-surface rounded-xl border border-warm-100 p-4">
        <h3 class="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-3">{t('dashboard.payment_breakdown')}</h3>
        <div class="space-y-2">
          {#each dashboard.metrics.payment_breakdown as pb}
            <div class="flex items-center justify-between text-sm">
              <span class="text-ink-muted capitalize">{pb.method === 'cash' ? 'Tunai' : pb.method.toUpperCase()}</span>
              <div class="text-right">
                <span class="font-semibold text-ink">{formatRp(pb.total)}</span>
                <span class="text-xs text-ink-muted ml-1">({pb.count}x)</span>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Sales Trend -->
    <div>
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-xs font-semibold text-ink-muted uppercase tracking-wide">{t('dashboard.sales_trend')}</h2>
        <div class="flex gap-1">
          {#each (['7d', '30d', '12m'] as const) as range}
            <button
              class="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors {dashboard.dateRange === range ? 'bg-accent text-cream' : 'bg-warm-50 text-ink-muted'}"
              onclick={() => handleDateRange(range)}
            >
              {t(`dashboard.period_${range}`)}
            </button>
          {/each}
        </div>
      </div>

      {#if dashboard.salesTrend.length > 0}
        <SalesChart data={dashboard.salesTrend} />
      {:else}
        <div class="bg-surface rounded-xl border border-warm-100 p-8 text-center text-sm text-ink-muted">
          {t('dashboard.no_data')}
        </div>
      {/if}
    </div>

    <!-- Top Books -->
    {#if dashboard.topBooks.length > 0}
      <div class="bg-surface rounded-xl border border-warm-100">
        <div class="px-4 py-3 border-b border-warm-50">
          <h3 class="text-xs font-semibold text-ink-muted uppercase tracking-wide">{t('dashboard.top_books')}</h3>
        </div>
        <div class="divide-y divide-warm-50">
          {#each dashboard.topBooks as book, i}
            <div class="px-4 py-3 flex items-center gap-3">
              <span class="w-6 h-6 rounded-full bg-accent/10 text-accent text-xs font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-ink truncate">{book.title}</p>
                <p class="text-xs text-ink-muted">{book.total_sold} {t('dashboard.sold')}</p>
              </div>
              <p class="text-sm font-semibold text-ink">{formatRp(book.total_revenue)}</p>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/DashboardCard.svelte src/lib/components/SalesChart.svelte src/routes/staff/dashboard/ src/routes/owner/ package.json package-lock.json
git commit -m "feat: add dashboard pages — staff (today) and owner (full with charts)"
```

---

## Task 10: Pelanggan Browse — Availability Badges

**Files:**
- Create: `src/lib/components/AvailabilityBadge.svelte`
- Create: `src/lib/modules/inventory/public-availability.ts`
- Modify: `src/lib/components/BottomNav.svelte`

- [ ] **Step 1: Create public availability service**

Create `src/lib/modules/inventory/public-availability.ts`:

```typescript
import { supabase } from '$lib/supabase/client';

export interface PublicBookAvailability {
  book_id: string;
  type: 'for_sale' | 'read_in_store' | 'both';
  price: number | null;
  in_stock: boolean;
  is_preloved: boolean;
  location: string | null;
}

let availabilityCache: Map<string, PublicBookAvailability> = new Map();
let lastFetch = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let outletId: string | null = null;

/**
 * Set the outlet ID for availability queries.
 * Called once on app init (reads from first outlet or config).
 */
export function setAvailabilityOutlet(id: string): void {
  outletId = id;
}

/**
 * Fetch availability data from Supabase RPC (anonymous-accessible).
 * Cached for 5 minutes to reduce API calls.
 */
export async function fetchAvailability(): Promise<void> {
  if (!supabase || !outletId) return;
  if (Date.now() - lastFetch < CACHE_TTL && availabilityCache.size > 0) return;

  try {
    const { data, error } = await supabase.rpc('get_public_availability', {
      p_outlet_id: outletId,
    });

    if (error || !data) return;

    availabilityCache = new Map();
    for (const item of data as PublicBookAvailability[]) {
      availabilityCache.set(item.book_id, item);
    }
    lastFetch = Date.now();
  } catch {
    // Silently fail — availability is optional for browse
  }
}

/**
 * Get availability info for a single book.
 * Returns null if not in inventory or cache not loaded.
 */
export function getBookAvailability(bookId: string): PublicBookAvailability | null {
  return availabilityCache.get(bookId) ?? null;
}

/**
 * Check if availability data has been loaded.
 */
export function isAvailabilityLoaded(): boolean {
  return lastFetch > 0;
}

/**
 * Force refresh the availability cache.
 */
export async function refreshAvailability(): Promise<void> {
  lastFetch = 0;
  await fetchAvailability();
}
```

- [ ] **Step 2: Create AvailabilityBadge component**

Create `src/lib/components/AvailabilityBadge.svelte`:

```svelte
<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import { getBookAvailability, isAvailabilityLoaded } from '$lib/modules/inventory/public-availability';

  interface Props {
    bookId: string;
    compact?: boolean;
  }

  let { bookId, compact = false }: Props = $props();

  let availability = $derived(getBookAvailability(bookId));

  function formatPrice(amount: number): string {
    return `Rp ${amount.toLocaleString('id-ID')}`;
  }
</script>

{#if availability}
  <div class="flex flex-wrap items-center gap-1.5">
    <!-- Price / Type Badge -->
    {#if availability.type === 'read_in_store'}
      <span class="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full font-medium bg-sage/10 text-sage">
        {t('browse.read_in_store')}
      </span>
    {:else if availability.in_stock && availability.price}
      <span class="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full font-semibold bg-accent/10 text-accent">
        {formatPrice(availability.price)}
      </span>
    {:else if !availability.in_stock}
      <span class="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full font-medium bg-berry/10 text-berry">
        {t('browse.out_of_stock')}
      </span>
    {/if}

    <!-- Additional badges -->
    {#if !compact}
      {#if availability.type === 'both' && availability.in_stock}
        <span class="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full bg-sage/10 text-sage">
          {t('browse.also_read')}
        </span>
      {/if}

      {#if availability.is_preloved}
        <span class="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full bg-gold/10 text-gold">
          {t('browse.preloved')}
        </span>
      {/if}

      {#if availability.location && (availability.type === 'read_in_store' || availability.type === 'both')}
        <span class="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full bg-warm-100 text-ink-muted">
          {availability.location}
        </span>
      {/if}
    {/if}

    <!-- Stock indicator (green dot if available) -->
    {#if availability.in_stock && availability.type !== 'read_in_store'}
      <span class="w-1.5 h-1.5 rounded-full bg-sage" title={t('browse.available')}></span>
    {/if}
  </div>
{:else if isAvailabilityLoaded()}
  <!-- Book not in inventory — show nothing -->
{/if}
```

- [ ] **Step 3: Update BottomNav with dashboard tab**

In `src/lib/components/BottomNav.svelte`, update the `staffTabs` derived value to include dashboard:

Replace:
```typescript
  const staffTabs = $derived([
    { href: `${base}/`, label: t('nav.library'), icon: icons.book },
    { href: `${base}/staff/pos`, label: t('nav.pos'), icon: icons.pos },
    { href: `${base}/staff/inventory`, label: t('nav.inventory'), icon: icons.inventory },
    { href: `${base}/browse`, label: t('nav.browse'), icon: icons.grid },
    { href: `${base}/stats`, label: t('nav.stats'), icon: icons.chart },
  ]);
```

With:
```typescript
  // Staff tabs (includes dashboard)
  const staffTabs = $derived([
    { href: `${base}/staff/pos`, label: t('nav.pos'), icon: icons.pos },
    { href: `${base}/staff/inventory`, label: t('nav.inventory'), icon: icons.inventory },
    { href: `${base}/staff/dashboard`, label: t('nav.dashboard'), icon: icons.chart },
    { href: `${base}/`, label: t('nav.library'), icon: icons.book },
    { href: `${base}/browse`, label: t('nav.browse'), icon: icons.grid },
  ]);

  // Owner tabs (full dashboard)
  const ownerTabs = $derived([
    { href: `${base}/staff/pos`, label: t('nav.pos'), icon: icons.pos },
    { href: `${base}/staff/inventory`, label: t('nav.inventory'), icon: icons.inventory },
    { href: `${base}/owner/dashboard`, label: t('nav.dashboard'), icon: icons.chart },
    { href: `${base}/`, label: t('nav.library'), icon: icons.book },
    { href: `${base}/browse`, label: t('nav.browse'), icon: icons.grid },
  ]);

  let tabs = $derived(isOwner() ? ownerTabs : isStaff() ? staffTabs : guestTabs);
```

- [ ] **Step 4: Init availability loading in root layout**

In `src/routes/+layout.svelte`, add availability fetch after existing init code. Add after the sync manager init block:

```typescript
// Load public availability for guest browse (anonymous Supabase call)
try {
  const { setAvailabilityOutlet, fetchAvailability } = await import('$lib/modules/inventory/public-availability');
  // Default outlet — in production, this would come from config or URL
  const { supabase } = await import('$lib/supabase/client');
  if (supabase) {
    const { data } = await supabase.from('outlet').select('id').limit(1).single();
    if (data?.id) {
      setAvailabilityOutlet(data.id);
      fetchAvailability();
    }
  }
} catch {
  // Supabase not configured — browse works without availability
}
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/inventory/public-availability.ts src/lib/components/AvailabilityBadge.svelte src/lib/components/BottomNav.svelte src/routes/+layout.svelte
git commit -m "feat: add pelanggan browse — availability badges, public inventory cache, owner nav"
```

---

## Task 11: Integration — Wire AvailabilityBadge into Book Views

**Files:**
- Modify: Book list/detail components that display books to guests

- [ ] **Step 1: Identify book display components**

The AvailabilityBadge needs to be added wherever books are shown to guests. The main locations are:
- Library page book list items
- Book detail page
- Browse page results
- Search results

Find the relevant components:

```bash
grep -r "book.title" src/routes/ src/lib/components/ --include="*.svelte" -l
```

- [ ] **Step 2: Add AvailabilityBadge to book list items**

In the component that renders book cards/rows in the library or browse view, import and add the badge. For example, if there is a `BookCard.svelte` or similar, add after the title/author section:

```svelte
<script>
  // Add to imports:
  import AvailabilityBadge from '$lib/components/AvailabilityBadge.svelte';
</script>

<!-- Add after the book title/author area -->
<AvailabilityBadge bookId={book.id} compact />
```

- [ ] **Step 3: Add AvailabilityBadge to book detail page**

In the book detail page (e.g., `src/routes/(app)/book/[id]/+page.svelte` or similar), add the full (non-compact) badge:

```svelte
<script>
  import AvailabilityBadge from '$lib/components/AvailabilityBadge.svelte';
</script>

<!-- Add in the book detail section -->
<AvailabilityBadge bookId={book.id} />
```

- [ ] **Step 4: Test manually**

Verify:
- As guest, browse catalog and see availability badges on books
- Books with inventory show price badges (green for in stock, red for out of stock)
- Read-in-store books show sage "Baca di Tempat" badge
- Preloved books show gold "Preloved" tag
- Books not in inventory show no badge
- Badge data loads from Supabase and caches

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "feat: wire AvailabilityBadge into book list and detail views"
```

---

## Task 12: Integration Test & Final Wiring

**Files:**
- Modify: `src/lib/components/TopBar.svelte`
- Various verification

- [ ] **Step 1: Update TopBar with payment status indicator**

In `src/lib/components/TopBar.svelte`, add payment-in-progress indicator. After existing imports, add:

```typescript
import { isPaymentInProgress } from '$lib/modules/payment/stores.svelte';
```

Add to the topbar display area, next to the offline indicator:

```svelte
{#if isPaymentInProgress()}
  <span class="text-xs bg-gold/10 text-gold px-2 py-0.5 rounded-full font-medium animate-pulse">
    Payment...
  </span>
{/if}
```

- [ ] **Step 2: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass (existing + Phase 1 + Phase 2).

- [ ] **Step 3: Run dev server and smoke test**

```bash
npm run dev
```

Before testing, ensure Midtrans sandbox keys are configured:
1. In Supabase Dashboard → Project Settings → Edge Functions → Secrets, add:
   - `MIDTRANS_SERVER_KEY` = your sandbox server key
   - `FONNTE_API_KEY` = your Fonnte API key (optional for testing)
2. In `.env.local`, add:
   ```
   VITE_MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxx
   VITE_MIDTRANS_IS_PRODUCTION=false
   ```

Manual smoke test checklist:
- [ ] App loads, guest mode shows catalog with availability badges
- [ ] Badges correctly show: price + green for in-stock, red for out-of-stock, sage for read-in-store
- [ ] Preloved books show gold "Preloved" tag
- [ ] Login as staff → BottomNav shows POS, Inventory, Dashboard tabs
- [ ] POS: select book, choose QRIS → Snap popup opens (sandbox)
- [ ] POS: complete sandbox QRIS payment → success toast → receipt sender shown
- [ ] Receipt: enter WhatsApp number, click send (verify Edge Function called)
- [ ] Receipt: skip receipt → cart resets
- [ ] POS: cash payment still works (no Snap popup)
- [ ] POS: go offline → digital payment buttons disabled with message
- [ ] Staff dashboard: shows today's metrics (sales, transactions, margin, stock alerts)
- [ ] Login as owner → BottomNav shows owner dashboard tab
- [ ] Owner dashboard: shows metrics, sales trend chart (7d/30d/12m), top books
- [ ] Existing features still work: browse, search, shelves, stats, barcode scan

- [ ] **Step 4: Deploy Edge Functions**

```bash
npx supabase functions deploy create-payment
npx supabase functions deploy midtrans-webhook
npx supabase functions deploy check-payment
npx supabase functions deploy send-receipt-wa
npx supabase functions deploy send-receipt-email
```

- [ ] **Step 5: Configure Midtrans webhook URL**

In Midtrans Dashboard → Settings → Configuration:
- Payment Notification URL: `https://<your-project>.supabase.co/functions/v1/midtrans-webhook`
- Finish Redirect URL: your app URL
- Error Redirect URL: your app URL

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete Phase 2 — Midtrans payments, digital receipts, dashboards, pelanggan browse"
```

---

## Summary

| Task | What it builds | Tests |
|------|----------------|-------|
| 1 | DB migration — payment, receipt tables, dashboard RPCs, materialized views | Migration + types |
| 2 | Payment module — types, Snap.js loader, service, store | 4 unit tests |
| 3 | Midtrans Edge Functions — create-payment, webhook, check-payment | Manual (sandbox) |
| 4 | Receipt module — types, templates (text + HTML), service | 4 unit tests |
| 5 | Receipt Edge Functions — WhatsApp (Fonnte), email | Manual |
| 6 | Dashboard module — metrics, sales trend, top books via RPC | 3 unit tests |
| 7 | i18n strings — payment, receipt, dashboard, browse | — |
| 8 | Updated POS — digital payment flow, Snap modal, receipt sender | Manual |
| 9 | Dashboard pages — staff (today) + owner (full with charts) | Manual |
| 10 | Pelanggan browse — availability badges, public inventory cache | Manual |
| 11 | AvailabilityBadge wired into book views | Manual |
| 12 | TopBar updates + full integration test + Edge Function deploy | Full smoke test |

**Total: 12 tasks, ~11 unit tests, 5 Edge Functions, 1 integration smoke test**

After Phase 2 is complete, create plan for Phase 3 (supplier management, purchase orders, consignment, notifications, restock engine).
