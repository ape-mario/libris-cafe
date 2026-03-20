# Production Launch Checklist

## Phase A: Infrastructure Setup

- [ ] Create Supabase project (supabase.com)
- [ ] Copy project URL + anon key ke `.env`
- [ ] Run all 12 migrations: `npx supabase db push`
- [ ] Verify all tables created (outlet, staff, inventory, stock_movement, transaction, transaction_item, payment, receipt, supplier, purchase_order, purchase_order_item, consignor, consignment_settlement, notification, reading_session, outlet_transfer, outlet_transfer_item)
- [ ] Verify all RPC functions exist (checkout_transaction, process_payment_webhook, void_transaction, get_today_metrics, get_sales_trend, get_top_books, get_lending_stats, get_public_availability, check_outlet_access, etc)
- [ ] Verify RLS policies active on all tables
- [ ] Deploy 9 Edge Functions:
  - [ ] `npx supabase functions deploy create-payment`
  - [ ] `npx supabase functions deploy midtrans-webhook`
  - [ ] `npx supabase functions deploy check-payment`
  - [ ] `npx supabase functions deploy send-receipt-wa`
  - [ ] `npx supabase functions deploy send-receipt-email`
  - [ ] `npx supabase functions deploy export-pdf`
  - [ ] `npx supabase functions deploy export-excel`
  - [ ] `npx supabase functions deploy daily-summary`
  - [ ] `npx supabase functions deploy create-staff`
- [ ] Set Supabase secrets:
  - [ ] `MIDTRANS_SERVER_KEY`
  - [ ] `MIDTRANS_IS_PRODUCTION=false` (sandbox dulu)
  - [ ] `FONNTE_API_TOKEN`
  - [ ] `ALLOWED_ORIGIN=https://your-domain.com`
  - [ ] `CRON_SECRET` (random 32+ char string)
- [ ] Enable pg_cron extension (Database → Extensions)
- [ ] Enable Realtime for `notification` table (Database → Replication)
- [ ] Create first owner account:
  - [ ] Supabase Dashboard → Authentication → Add User (email + 6-digit PIN as password)
  - [ ] SQL: `INSERT INTO staff (id, name, email, role, outlet_id) VALUES ('<auth-uuid>', 'Owner Name', 'owner@cafe.com', 'owner', (SELECT id FROM outlet LIMIT 1))`

## Phase B: Smoke Test — Core Flows

### B1: Authentication
- [ ] Open app → see ProfilePicker with "Staff Login" link
- [ ] Navigate to /login → enter email + PIN → login success
- [ ] BottomNav switches to staff/owner tabs
- [ ] Logout → stores cleared, BottomNav reverts to guest
- [ ] Login again → session restored correctly
- [ ] Open second tab → logout in first tab → second tab detects logout

### B2: POS — Cash Sale
- [ ] Navigate to /staff/pos
- [ ] Search a book → appears in results
- [ ] Scan barcode → book found (if barcode matches ISBN)
- [ ] Add to cart → cart updates, totals correct
- [ ] Increase quantity → total recalculates
- [ ] Quantity cannot exceed available stock
- [ ] Apply discount (fixed amount) → total reduced correctly
- [ ] Apply discount (percentage) → total reduced correctly
- [ ] Discount capped at subtotal (cannot go negative)
- [ ] Click "Pay Cash" → confirm dialog → change calculator appears
- [ ] Enter cash tendered → change calculated correctly
- [ ] Quick amount buttons work (50k, 100k, 200k, 500k)
- [ ] Click "Done" → receipt sender appears
- [ ] Send WhatsApp receipt → message received on phone
- [ ] Send email receipt → email received
- [ ] Skip receipt → cart cleared
- [ ] Check inventory → stock decremented by sold quantity
- [ ] Check /staff/transactions → sale appears in history

### B3: POS — Digital Payment (Midtrans Sandbox)
- [ ] Add book to cart → select QRIS
- [ ] Midtrans Snap popup appears
- [ ] Complete test payment (use Midtrans sandbox test cards/QR)
- [ ] Snap closes → payment success toast
- [ ] Transaction marked as paid in history
- [ ] Stock decremented
- [ ] Close Snap without paying → pending payment banner appears
- [ ] Retry payment → Snap re-opens
- [ ] Cancel pending payment → transaction voided

### B4: POS — Offline
- [ ] Disconnect WiFi / DevTools → Network → Offline
- [ ] POS still works for cash sales
- [ ] Digital payment buttons disabled with offline message
- [ ] Make 2-3 cash sales offline → queued in IndexedDB
- [ ] Reconnect WiFi → queue syncs automatically
- [ ] Transactions appear in Supabase after sync
- [ ] Stock decremented correctly for all synced transactions

### B5: Void Transaction
- [ ] Go to /staff/transactions → click a recent sale
- [ ] Transaction detail shows items, totals, payment method
- [ ] Click "Void" (owner only) → enter reason → confirm
- [ ] Transaction marked as VOIDED with reason
- [ ] Stock restored (stock_movement type = void_restore)
- [ ] Staff role cannot void (button hidden)

### B6: Inventory Management
- [ ] Navigate to /staff/inventory → list loads
- [ ] Filter: All / Low Stock / Out of Stock → correct counts
- [ ] Click "+ Add to Inventory" → /staff/inventory/new
- [ ] Search/scan book → select → fill price, stock, type, source
- [ ] Submit → item appears in inventory list
- [ ] Click item → detail page shows all fields
- [ ] Click "Edit" → change price → save → price updated
- [ ] Click "Adjust Stock" → enter +5 → stock increased
- [ ] Stock movement history shows the adjustment
- [ ] Verify: negative stock adjustment rejected if would go below 0

### B7: Lending (Baca di Tempat)
- [ ] Navigate to /staff/lending
- [ ] Click "New Check-In" → search book → select
- [ ] Choose semi-formal or formal level
- [ ] Check-in → session appears in active list
- [ ] Check-out → session marked returned
- [ ] If formal with deposit → deposit refund/forfeit option shown
- [ ] If fee configured → reading fee shown, "Charge to POS" works
- [ ] Overdue sessions highlighted in red/berry

## Phase C: Owner Flows

### C1: Dashboard
- [ ] /staff/dashboard → today's metrics (sales, margin, stock alerts)
- [ ] /owner/dashboard → full dashboard with trend chart
- [ ] Date range buttons (7d, 30d, 12m) change chart
- [ ] Top selling books list populated
- [ ] Payment breakdown shows cash vs digital
- [ ] Yesterday comparison deltas shown

### C2: Suppliers & Purchase Orders
- [ ] /owner/manage → click Suppliers
- [ ] Add supplier → form submits, appears in list
- [ ] Click supplier → detail page shows info
- [ ] /owner/manage → click Purchase Orders
- [ ] Create PO → select supplier, add items with quantities and prices
- [ ] Submit → PO in draft status
- [ ] Mark as Ordered → status changes
- [ ] Receive Goods → enter received quantities → stock updated
- [ ] Cannot receive same PO twice (idempotency guard)

### C3: Consignment
- [ ] /owner/manage → click Consignment
- [ ] Add consignor → fill name, bank details, commission rate
- [ ] View consignor detail → see inventory tab (books on consignment)
- [ ] Create settlement → select period → preview sales → create draft
- [ ] Settlement total matches preview (no divergence)
- [ ] Confirm settlement → status changes
- [ ] Mark as paid → status changes
- [ ] Cannot create duplicate settlement for same period
- [ ] Cannot confirm already-confirmed settlement

### C4: Restock & Prediction
- [ ] /owner/manage → click Restock → suggestions sorted by urgency
- [ ] Critical (red), Urgent (orange), Warning (gold) badges
- [ ] Click "Create PO" → redirects to PO creation with pre-filled data
- [ ] /owner/manage → click Prediction → demand forecast page
- [ ] Velocity badges, stockout timeline chart

### C5: Multi-Outlet (if applicable)
- [ ] /owner/manage → click Outlets → list shows
- [ ] Add outlet → form submits
- [ ] OutletPicker in TopBar → switch outlet → data refreshes
- [ ] /owner/manage → click Transfers
- [ ] Create transfer → select source/destination outlets, items
- [ ] Approve → Ship (stock decremented at source) → Receive (stock added at destination)
- [ ] Cannot ship if stock insufficient
- [ ] Cannot receive already-received transfer
- [ ] Consolidated reporting shows cross-outlet data

### C6: Reports & Backup
- [ ] /owner/manage → click Staff Reports → report builder
- [ ] Select report type → date range → export CSV → file downloads
- [ ] Export PDF → file downloads
- [ ] Export Excel → file downloads
- [ ] /owner/manage → click Backup → export JSON → file downloads
- [ ] Export SQL → file downloads with INSERT statements

### C7: Staff Management
- [ ] /owner/manage → click Staff
- [ ] Create new staff account → form validates 6-digit PIN
- [ ] New staff can login at /login
- [ ] Deactivate staff → cannot login anymore
- [ ] Max 50 staff per outlet enforced

## Phase D: Guest / Pelanggan Experience

- [ ] Open app without login → ProfilePicker shown
- [ ] Browse catalog → books visible with covers
- [ ] AvailabilityBadge shows: price, "Baca di Tempat", "Habis"
- [ ] Search works → results show availability
- [ ] Kiosk mode (/kiosk) → fullscreen, auto-reset after idle
- [ ] Kiosk shows real books with availability badges
- [ ] Settings → change language EN ↔ ID → all strings switch

## Phase E: Security Verification

- [ ] Try accessing /staff/pos as guest → redirected to /login
- [ ] Try accessing /owner/dashboard as staff → redirected
- [ ] Try calling checkout_transaction RPC with wrong outlet_id → rejected
- [ ] Try calling get_today_metrics with another outlet's ID → rejected
- [ ] Verify ALLOWED_ORIGIN is set (not wildcard) in production
- [ ] Verify HTTPS enforced on hosting platform
- [ ] Verify Midtrans webhook URL configured in Midtrans dashboard
- [ ] Test with wrong webhook signature → rejected (403)

## Phase F: Monitoring & Go-Live

- [ ] Add error tracking (Sentry, LogRocket, or similar)
- [ ] Configure uptime monitoring (UptimeRobot, Checkly, etc)
- [ ] Set up daily backup cron or manual backup schedule
- [ ] Deploy to production hosting (Cloudflare Pages, Vercel, Netlify)
- [ ] Set `MIDTRANS_IS_PRODUCTION=true` and swap to production Midtrans keys
- [ ] Train staff (login, POS flow, inventory adjustment)
- [ ] Run parallel with manual process for 1 week (paper backup)
- [ ] Monitor error tracking for issues
- [ ] Full launch after 1 week stable operation

## Phase G: Post-Launch (Week 1-4)

- [ ] Review error tracking daily
- [ ] Check offline queue sync status
- [ ] Verify daily summary notifications working
- [ ] Review consignment settlements for accuracy
- [ ] Check stock levels match physical inventory
- [ ] Gather staff feedback on UX pain points
- [ ] Plan iteration based on real usage data
