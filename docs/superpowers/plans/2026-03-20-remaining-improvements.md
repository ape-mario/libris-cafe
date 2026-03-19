# Remaining Improvements Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete all remaining product gaps identified in the product owner review — POS UX, inventory management, staff management, onboarding, and business workflows.

**Priority Order:** Sorted by business impact. Each task is independent and can be implemented in any order.

---

## Task 1: Cash Change Calculator (POS)

**Effort:** Small (1 file modify)
**Impact:** Every cash transaction — staff needs this 50+ times/day

**Files:**
- Modify: `src/routes/staff/pos/+page.svelte`
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/id.ts`

After staff clicks "Pay Cash" and confirms, show a change calculator modal:

- [ ] Add `cashTendered` state and `showChangeModal` state
- [ ] After checkout success (cash), show modal with:
  - Total: Rp 164.000
  - Cash tendered input (numeric, auto-focus)
  - Quick amount buttons: Rp 50.000, Rp 100.000, Rp 200.000, Rp 500.000
  - Change: Rp 36.000 (auto-calculated, large font, green)
- [ ] "Done" button dismisses and shows receipt sender
- [ ] Add i18n keys: `pos.cash_tendered`, `pos.change`, `pos.done`

---

## Task 2: Discount Entry (POS)

**Effort:** Medium (2 files modify)
**Impact:** Promotions, member discounts, damaged book markdowns

**Files:**
- Modify: `src/lib/modules/pos/cart.ts`
- Modify: `src/routes/staff/pos/+page.svelte`
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/id.ts`

- [ ] Add `setCartDiscount(cart, amount)` and `setItemDiscount(cart, inventoryId, amount)` to cart.ts
- [ ] Add discount UI in cart summary area:
  - "Add Discount" button → shows input
  - Two modes: fixed amount (Rp) or percentage (%)
  - Per-cart discount (applies to subtotal)
  - Per-item discount (tap item → discount input)
- [ ] Discount reflected in subtotal → tax → total calculation
- [ ] Add i18n keys: `pos.add_discount`, `pos.discount_amount`, `pos.discount_percent`, `pos.remove_discount`
- [ ] Add tests for setCartDiscount and setItemDiscount in cart.test.ts

---

## Task 3: Void/Return Transaction

**Effort:** Medium (3 files create, 1 modify)
**Impact:** Critical for error correction — "customer wants refund"

**Files:**
- Create: `src/lib/modules/pos/void.ts`
- Create: `src/routes/staff/transactions/[id]/+page.svelte`
- Modify: `src/routes/staff/transactions/+page.svelte`
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/id.ts`

- [ ] `void.ts` service:
  - `voidTransaction(txId, staffId, reason)` — requires owner role
    - Sets transaction.type = 'void', payment_status = 'refunded'
    - Creates reverse stock_movement entries (void_restore, +quantity)
    - Records void reason
  - `returnItems(txId, items[], staffId, reason)` — partial return
    - Creates new 'return' transaction with negative totals
    - Restores stock for returned items only
- [ ] Transaction detail page (`/staff/transactions/[id]`):
  - Shows full transaction details
  - "Void" button (owner only) → confirm with reason → void
  - "Return Items" → select items to return → confirm → partial return
  - Show void/return history if already voided
- [ ] Update transactions list: show void/return badge on affected transactions
- [ ] Add i18n keys: `pos.void`, `pos.void_confirm`, `pos.void_reason`, `pos.return`, `pos.return_items`, `pos.select_return_items`, `pos.voided`, `pos.returned`
- [ ] Add tests for voidTransaction and returnItems

---

## Task 4: Edit Inventory Item

**Effort:** Small (1 file create)
**Impact:** Owner needs to update prices, locations regularly

**Files:**
- Create: `src/routes/staff/inventory/[id]/edit/+page.svelte`
- Modify: `src/routes/staff/inventory/[id]/+page.svelte` (add Edit button)
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/id.ts`

- [ ] Edit page with form for: price, cost_price, type, source, condition, is_preloved, location, min_stock
- [ ] Pre-populated with current values from Supabase
- [ ] On submit: call `updateInventoryItem()` (already exists)
- [ ] Redirect back to detail page with success toast
- [ ] Add "Edit" button on inventory detail page linking to edit page
- [ ] Add i18n keys: `inventory.edit`, `inventory.save`, `inventory.saved`

---

## Task 5: Staff Account Management (Owner)

**Effort:** Medium (2 files create, 1 modify)
**Impact:** Owner currently needs Supabase dashboard access to create staff

**Files:**
- Create: `src/routes/owner/staff/+page.svelte`
- Create: `src/routes/owner/staff/new/+page.svelte`
- Create: `src/lib/modules/auth/admin.ts`
- Modify: `src/routes/owner/manage/+page.svelte` (add Staff link)
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/id.ts`

- [ ] `admin.ts` service:
  - `createStaffAccount(name, email, pin, role, outletId)`:
    - Calls Supabase Edge Function (needs new function) to create auth user + staff record
    - Returns created staff object
  - `deactivateStaff(staffId)`: sets is_active = false
  - `resetPin(staffId, newPin)`: updates auth password
- [ ] Create Edge Function `supabase/functions/create-staff/index.ts`:
  - Accepts name, email, pin, role, outlet_id
  - Validates caller is owner (JWT check)
  - Creates Supabase Auth user with email + pin as password
  - Inserts staff record with auth user's UUID
  - Returns staff data
- [ ] Staff list page: shows all staff grouped by outlet, active/inactive filter
- [ ] Create staff page: form with name, email, PIN (4-6 digit), role (staff/owner), outlet selector
- [ ] Add link from owner manage hub
- [ ] Add i18n keys: `staff.title`, `staff.create`, `staff.name`, `staff.email`, `staff.pin`, `staff.role`, `staff.deactivate`, `staff.reset_pin`, `staff.created`, `staff.no_staff`

---

## Task 6: First-Time Setup / Onboarding

**Effort:** Medium (2 files create, 1 modify)
**Impact:** First impression — non-technical owner installing the app

**Files:**
- Create: `src/routes/setup/+page.svelte`
- Modify: `src/routes/+layout.svelte`
- Modify: `src/lib/supabase/client.ts`
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/id.ts`

- [ ] Detect first-run: if no Supabase configured AND no localStorage flag `libris_setup_done`
- [ ] Show setup wizard at `/setup`:
  - Step 1: "Welcome to Libris Cafe" — choose language
  - Step 2: "Connect Database" — input Supabase URL + anon key → test connection → save to localStorage
  - Step 3: "Create Owner Account" — name, email, PIN → create via Edge Function
  - Step 4: "Setup Complete" → redirect to login
- [ ] Modify `client.ts`: check localStorage for Supabase credentials before env vars
  ```typescript
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    ?? localStorage.getItem('libris_supabase_url') ?? '';
  ```
- [ ] In root layout: if supabase is null AND no setup flag, redirect to `/setup`
- [ ] Add i18n keys for all setup steps

---

## Task 7: Pending Digital Payment Recovery

**Effort:** Small (1 file modify)
**Impact:** Staff UX when Snap popup is closed without paying

**Files:**
- Modify: `src/routes/staff/pos/+page.svelte`
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/id.ts`

- [ ] When Snap popup is closed (cancelled/error), show a "pending payment" banner:
  - "Payment pending for Order #XXX — Rp 164.000"
  - "Retry Payment" button → re-open Snap with same token
  - "Cancel" button → void the pending transaction
- [ ] Store pending payment info in component state (orderId, snapToken, transactionId)
- [ ] Banner persists until resolved (paid, retried, or cancelled)
- [ ] Add i18n keys: `payment.pending_banner`, `payment.retry`, `payment.cancel_pending`

---

## Task 8: Reading Fee Integration (Lending → POS)

**Effort:** Medium (3 files modify)
**Impact:** Revenue from in-store reading — common cafe business model

**Files:**
- Modify: `src/lib/modules/lending/types.ts`
- Modify: `src/lib/modules/lending/service.ts`
- Modify: `src/routes/staff/lending/+page.svelte`
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/id.ts`

- [ ] Add `fee_per_session` or `fee_per_hour` to inventory type (for read_in_store books)
- [ ] On check-out, calculate fee based on duration × rate
- [ ] Show fee to staff: "Reading fee: Rp 15.000 (2 hours × Rp 7.500/hr)"
- [ ] "Charge to POS" button → creates a transaction of type 'reading_fee'
- [ ] Skip fee option for formal sessions where deposit covers it
- [ ] Add i18n keys: `lending.fee`, `lending.fee_per_hour`, `lending.charge_fee`, `lending.fee_waived`

---

## Task 9: Dashboard Comparison Metrics

**Effort:** Small (1 file modify, 1 RPC)
**Impact:** Owner wants "how's today vs yesterday?"

**Files:**
- Modify: `src/routes/owner/dashboard/+page.svelte`
- Add to: `supabase/migrations/00010_dashboard_comparison.sql`

- [ ] New RPC `get_yesterday_metrics(p_outlet_id)` — same as today_metrics but for yesterday
- [ ] On dashboard, show delta under each metric card:
  - "▲ +15% vs yesterday" (green/sage)
  - "▼ -8% vs yesterday" (red/berry)
  - "— same as yesterday" (muted)
- [ ] Add i18n keys: `dashboard.vs_yesterday`, `dashboard.up`, `dashboard.down`, `dashboard.same`

---

## Task 10: Inventory Consignor View

**Effort:** Small (1 file modify)
**Impact:** Owner needs to audit "what books from supplier X are on our shelves?"

**Files:**
- Modify: `src/routes/owner/consignment/[id]/+page.svelte`

- [ ] Add "Inventory" tab/section showing all inventory records where `consignor_id = this consignor`
- [ ] For each: book title, price, stock, condition, date added
- [ ] Total: X books, Rp Y total value

---

## Summary

| # | Task | Effort | Priority |
|---|------|--------|----------|
| 1 | Cash change calculator | Small | Highest — every cash sale |
| 2 | Discount entry | Medium | High — promotions |
| 3 | Void/return flow | Medium | High — error correction |
| 4 | Edit inventory item | Small | High — daily price changes |
| 5 | Staff account management | Medium | High — owner self-service |
| 6 | First-time setup wizard | Medium | High — first impression |
| 7 | Pending payment recovery | Small | Medium — edge case UX |
| 8 | Reading fee → POS | Medium | Medium — revenue feature |
| 9 | Dashboard comparison | Small | Low — nice analytics |
| 10 | Consignor inventory view | Small | Low — audit convenience |

**Estimated total: ~10 tasks, mix of small and medium effort.**
