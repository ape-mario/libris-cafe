# Libris Cafe — Design Specification

**Date:** 2026-03-19
**Status:** Draft
**Base:** Libris personal book tracker → Libris Cafe (book cafe management)

## 1. Overview

Libris Cafe transforms the existing Libris personal book tracker into a full book cafe management system. The app manages book inventory (for sale + read-in-store), POS transactions, digital payments (Midtrans), supplier management, consignment tracking, and provides an analytics dashboard — all while maintaining offline-first capability.

### Key Users
- **Owner**: Full access — inventory, POS, dashboard, suppliers, consignment, staff management, settings
- **Staff**: POS, inventory management, limited dashboard (today only)
- **Pelanggan (guest)**: Browse catalog, see availability & prices, no login required

### Core Decisions
| Aspect | Decision |
|--------|----------|
| Users | Staff + pelanggan browse (no auth for customers) |
| Read-in-store | Free/no tracking now; modular for formal tracking later |
| POS | Full — inventory, transactions, payment gateway |
| Payment | Midtrans (QRIS, GoPay, OVO, VA, card) |
| Stock sourcing | Manual + bulk import + supplier API + preloved + consignment |
| Receipt | Digital required (WhatsApp/email), thermal printer optional |
| Multi-outlet | Single cafe now, structure ready for multi-outlet |
| Dashboard | Advanced (prediction, restock suggestions, export) |
| Offline | Offline-first with queue for online-dependent features |
| Tech stack | Hybrid: Yjs (catalog) + Supabase (business data) |

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    LIBRIS CAFE CLIENT                       │
│                   (SvelteKit PWA)                           │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Catalog UI  │  │   POS UI     │  │  Dashboard UI    │  │
│  │  (browse,    │  │  (cart,      │  │  (reports,       │  │
│  │   search,    │  │   checkout,  │  │   analytics,     │  │
│  │   scan)      │  │   receipt)   │  │   inventory)     │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                 │                    │             │
│  ┌──────┴───────┐  ┌──────┴───────────────────┴──────────┐  │
│  │  Yjs Layer   │  │         Supabase Client             │  │
│  │  (Y.Doc +    │  │  (supabase-js + offline queue)      │  │
│  │  IndexedDB)  │  │                                     │  │
│  └──────┬───────┘  └──────┬──────────────────────────────┘  │
│         │                 │                                  │
│         │           ┌─────┴──────┐                           │
│         │           │  Offline   │  ← IndexedDB queue       │
│         │           │  Queue     │                           │
│         │           └─────┬──────┘                           │
└─────────┼─────────────────┼─────────────────────────────────┘
          │                 │
     ┌────┴────┐      ┌────┴─────────────────────────┐
     │PartyKit │      │         SUPABASE              │
     │(Yjs     │      │  ┌─────────┐ ┌────────────┐  │
     │ sync)   │      │  │Postgres │ │ Auth       │  │
     │         │      │  │(bisnis  │ │ (roles,    │  │
     │         │      │  │ data)   │ │  staff PIN)│  │
     │         │      │  └─────────┘ └────────────┘  │
     └─────────┘      │  ┌─────────┐ ┌────────────┐  │
                      │  │Edge     │ │ Realtime   │  │
                      │  │Functions│ │ (live      │  │
                      │  │(Midtrans│ │  updates)  │  │
                      │  │ webhook)│ │            │  │
                      │  └─────────┘ └────────────┘  │
                      └───────────────────────────────┘
```

### Principles
- **Yjs domain** = read-heavy, offline OK, eventual consistency → book catalog
- **Supabase domain** = write-critical, ACID required → transactions, stock, payment
- **Bridge** = Book UUID (generated in Yjs, used as FK in Supabase)
- **Offline queue** = POS transactions saved in IndexedDB, auto-sync when online

---

## 3. Data Model

### Yjs Layer (existing, unchanged)

```typescript
Book { id, title, authors, isbn, coverUrl, categories,
       publisher, publishYear, edition, seriesId, seriesOrder,
       dateAdded, dateModified }
Series { id, name, description }
User { id, name, avatar }  // reading profile, not staff auth
UserBookData { userId, bookId, status, rating, notes,
               dateRead, isWishlist, currentPage, totalPages,
               progressHistory }
Shelf { id, userId, name, bookIds, dateCreated }  // virtual reading list
ReadingGoal { userId, year, target }
```

### Supabase Layer (new)

```sql
-- STAFF & AUTH
staff (
  id uuid PK,
  name text,
  email text UNIQUE,
  role enum('owner', 'staff'),
  pin_hash text,
  outlet_id uuid FK,
  created_at timestamptz
)

-- OUTLET (multi-outlet ready, start with 1)
outlet (
  id uuid PK,
  name text,
  address text,
  phone text,
  created_at timestamptz
)

-- INVENTORY (bridge to Yjs via book_id)
inventory (
  id uuid PK,
  book_id text NOT NULL,          -- Yjs Book.id
  outlet_id uuid FK,
  type enum('for_sale', 'read_in_store', 'both'),
  source enum('supplier', 'owner', 'consignment', 'buyback'),
  consignor_id uuid FK NULL,
  commission_rate decimal(5,2),
  is_preloved boolean DEFAULT false,
  price decimal(12,2),
  cost_price decimal(12,2),
  stock int DEFAULT 0,
  min_stock int DEFAULT 1,
  location text,
  condition enum('new', 'good', 'fair'),
  created_at timestamptz,
  updated_at timestamptz
)

-- STOCK MOVEMENT (audit trail)
stock_movement (
  id uuid PK,
  inventory_id uuid FK,
  type enum('purchase_in', 'sale_out', 'return_in', 'return_out',
            'adjustment', 'void_restore', 'consignment_in',
            'consignment_return', 'buyback_in'),
  quantity int,
  reference_id text,
  reason text,
  staff_id uuid FK,
  created_at timestamptz
)

-- SUPPLIER
supplier (
  id uuid PK,
  name text,
  contact_name text,
  phone text,
  email text,
  api_endpoint text,
  api_key_encrypted text,
  created_at timestamptz
)

-- PURCHASE ORDER
purchase_order (
  id uuid PK,
  supplier_id uuid FK,
  outlet_id uuid FK,
  status enum('draft', 'ordered', 'received', 'cancelled'),
  total decimal(12,2),
  notes text,
  ordered_at timestamptz,
  received_at timestamptz,
  created_at timestamptz
)

purchase_order_item (
  id uuid PK,
  purchase_order_id uuid FK,
  book_id text,
  isbn text,
  quantity int,
  unit_price decimal(12,2),
  received_quantity int DEFAULT 0
)

-- CONSIGNOR (book owners who consign)
consignor (
  id uuid PK,
  name text,
  phone text,
  email text,
  bank_account text,
  bank_name text,
  notes text,
  created_at timestamptz
)

-- CONSIGNMENT SETTLEMENT
consignment_settlement (
  id uuid PK,
  consignor_id uuid FK,
  period_start date,
  period_end date,
  total_sales decimal(12,2),
  commission decimal(12,2),
  payout decimal(12,2),
  status enum('draft', 'confirmed', 'paid'),
  paid_at timestamptz,
  created_at timestamptz
)

-- TRANSACTION (POS)
transaction (
  id uuid PK,
  outlet_id uuid FK,
  staff_id uuid FK,
  type enum('sale', 'return', 'void'),
  subtotal decimal(12,2),
  discount decimal(12,2) DEFAULT 0,
  tax decimal(12,2) DEFAULT 0,
  total decimal(12,2),
  payment_method enum('cash', 'qris', 'ewallet', 'bank_transfer', 'card'),
  payment_status enum('pending', 'paid', 'failed', 'refunded'),
  midtrans_order_id text,
  midtrans_transaction_id text,
  customer_name text,
  customer_contact text,
  notes text,
  offline_id text UNIQUE,
  created_at timestamptz
)

transaction_item (
  id uuid PK,
  transaction_id uuid FK,
  inventory_id uuid FK,
  book_id text,
  title text,
  quantity int,
  unit_price decimal(12,2),
  discount decimal(12,2) DEFAULT 0,
  total decimal(12,2)
)

-- PAYMENT (Midtrans)
payment (
  id uuid PK,
  transaction_id uuid FK,
  midtrans_order_id text,
  midtrans_transaction_id text,
  payment_type text,
  gross_amount decimal(12,2),
  status enum('pending', 'capture', 'settlement', 'deny',
              'cancel', 'expire', 'refund'),
  raw_response jsonb,
  created_at timestamptz,
  updated_at timestamptz
)

-- RECEIPT
receipt (
  id uuid PK,
  transaction_id uuid FK,
  type enum('whatsapp', 'email'),
  recipient text,
  status enum('queued', 'sent', 'failed'),
  sent_at timestamptz,
  created_at timestamptz
)

-- NOTIFICATION
notification (
  id uuid PK,
  outlet_id uuid FK,
  recipient_id uuid FK,
  type text,
  title text,
  body text,
  read boolean DEFAULT false,
  created_at timestamptz
)
```

### Bridge Pattern

```
Yjs Book.id  ──→  inventory.book_id
             ──→  transaction_item.book_id
             ──→  purchase_order_item.book_id

Flow:
1. Staff adds book → enters Yjs (Book) + Supabase (inventory)
2. Customer browses → reads from Yjs (offline OK)
3. Staff sells book → Supabase (transaction + stock decrement)
4. Dashboard → queries Supabase (joins, aggregates)

One-way sync only: Yjs → Supabase (book_id). No sync back.
```

---

## 4. User Roles & Access Control

### Role Matrix

| Feature | Owner | Staff | Pelanggan (guest) |
|---------|-------|-------|--------------------|
| Browse catalog | Yes | Yes | Yes |
| Search/scan | Yes | Yes | Yes |
| See prices | Yes | Yes | Yes |
| See stock (detail) | Yes | Yes | Available/not only |
| POS / sell | Yes | Yes | No |
| Void/return | Yes | No | No |
| Add books | Yes | Yes | No |
| Edit stock | Yes | Yes | No |
| Delete books | Yes | No | No |
| Purchase orders | Yes | No | No |
| Supplier mgmt | Yes | No | No |
| Staff mgmt | Yes | No | No |
| Dashboard (full) | Yes | Limited (today) | No |
| Settings | Yes | No | No |

### Auth Flow

- **Pelanggan**: No login. Browse directly from Yjs. Zero friction.
- **Staff**: PIN entry (4-6 digit). Verified via Supabase Edge Function → JWT.
- **Owner**: Same PIN flow, role = 'owner' in staff table.
- PIN chosen over email/password for speed in cafe environment.
- Max 5 PIN attempts, 5-minute lockout.

---

## 5. POS & Transaction Flow

### Transaction State Machine

```
draft → pending → paid/settlement → completed
                → failed
                → expired (15 min timeout)
completed → void (owner only, stock restored)
completed → return (owner only, partial/full)
```

### Cash Flow
Cart → Staff clicks "Pay" → Select "Cash" → Mark paid → Stock decremented → Receipt queued

### Digital Payment Flow
Cart → Staff clicks "Pay" → Select QRIS/eWallet/Card → Edge Function creates Midtrans Snap token → Show Snap popup/QR → Midtrans webhook → Update transaction + stock → Receipt queued

### Midtrans Integration
- Edge Function `create-payment`: creates Snap token
- Edge Function `midtrans-webhook`: receives callback, updates status
- Edge Function `check-payment`: polling fallback
- Client never talks to Midtrans directly (security)

### Offline POS
- Cash only when offline
- Transactions queued in IndexedDB with `offline_id`
- Auto-sync on reconnect, deduplicated via UNIQUE constraint
- QRIS/eWallet/Card disabled offline with clear UI message
- Oversold stock: transactions kept (already happened), alert owner

---

## 6. Inventory Management

### Stock Sources
1. **Supplier** — via Purchase Order
2. **Owner personal** — owner's own collection (cost_price = 0)
3. **Consignment** — third-party books, cafe takes commission
4. **Buyback** — preloved bought from customers

### Stock Lifecycle
- Every change creates a `stock_movement` record (audit trail)
- `inventory.stock` maintained as cache via trigger on movement insert
- Periodic reconciliation: SUM(movements) vs inventory.stock

### Inventory Types
- `for_sale`: has price, POS-enabled, shows "Rp XX.XXX"
- `read_in_store`: no price, not POS-enabled, shows "Baca di tempat"
- `both`: has price, POS-enabled, shows price + "Bisa dibaca di tempat"

### Low Stock Alerts
- stock <= 0 → "out_of_stock", customers see "Habis"
- stock <= min_stock → "low_stock", push notification to owner
- Notifications: in-app badge + WhatsApp to owner

### Purchase Order Flow
Owner creates PO → Status "ordered" → Staff receives goods (scan/checklist) → Status "received" → Stock movements created → Inventory updated → New books added to Yjs catalog

### Consignment
- Consignor tracked in `consignor` table
- Sales auto-recorded in consignment ledger
- Monthly settlement: total sales - commission = payout to consignor
- Settlement flow: draft → confirmed → paid

### Supplier API Integration
Abstract `SupplierAdapter` interface for checkAvailability, createOrder, checkOrderStatus. Concrete implementations per supplier.

### Restock Suggestion Engine
Heuristic-based (not ML):
- days_until_stockout = current_stock / avg_daily_sales_30d
- If < supplier lead time → URGENT
- If < 2x lead time → WARNING
- Suggested quantity = avg_daily_sales × (lead_time + buffer)

---

## 7. Dashboard & Reporting

### Owner Dashboard
- Today's overview: sales, margin, transactions, low stock count
- Sales trend (7d / 30d / 12m) with period comparison
- Top performers: books, categories
- Inventory alerts: out of stock, low stock, restock suggestions, pending POs
- Consignment summary: unsettled amounts, due settlements

### Staff Dashboard
- Today only: sales total, my transactions, low stock reminders

### Report Types
- Sales: daily, weekly, monthly (per-transaction, per-hour, per-staff)
- Inventory: status, stock movement, dead stock (>90 days unsold)
- Profit margin: per book, per category, per source (new/preloved/consignment)
- Consignment: per consignor, settlement history
- Supplier: per supplier, lead time, reliability
- Prediction: restock timing, demand forecast

### Export
CSV (for accounting), PDF (print/share), Excel (owner preference)
Manual export + scheduled monthly auto-generate via Edge Function cron

### Tech
- Materialized views for pre-aggregation
- Supabase Realtime for live dashboard updates
- RPC functions for complex queries
- Chart.js or uPlot for visualization

---

## 8. Digital Receipt & Notifications

### Receipt Channels
- **WhatsApp** (primary): via Fonnte/Wablas API initially, abstract interface for switching to official WhatsApp Business API later
- **Email**: HTML template, branded
- **Thermal printer** (optional, future): abstract PrinterProvider interface ready

### Receipt Content
Transaction details, items with prices, payment method, reference number, cafe branding.

### Notification System
| Event | Channel | Recipient |
|-------|---------|-----------|
| Low stock alert | In-app + WhatsApp | Owner, Staff |
| Daily summary | WhatsApp | Owner |
| PO received | In-app | Owner |
| Consignment settlement due | WhatsApp | Owner + Consignor |
| Payment failed | In-app | Staff |
| Offline queue synced | In-app | Staff |

In-app: Supabase Realtime → badge counter in TopBar + Toast for urgent.

---

## 9. Pelanggan Browse Experience

### Guest Mode
- No login required, browse directly from Yjs (offline capable)
- See: catalog, search, barcode scan, prices, availability, book location
- Not see: POS, inventory management, dashboard, cost price, margin, consignor info
- Simplified BottomNav: Browse, Search, Kategori

### Availability Badges
- `for_sale` + in stock → "Rp XX.XXX" + green badge
- `read_in_store` → "Baca di tempat" + sage badge + location
- `both` + in stock → price + "Bisa dibaca di tempat"
- Out of stock → red "Habis" badge
- Preloved → "preloved" tag on badge

### Kiosk Mode (future)
PWA fullscreen on cafe tablet, auto-reset after 2 min idle, locked to guest mode.

---

## 10. Offline Queue & Sync Strategy

### Data Partitioning
- **Always offline**: Book catalog, covers, search, categories, series, reading tracker, shelves, goals (Yjs + IndexedDB)
- **Offline with queue**: Cash POS transactions, stock adjustments (Supabase + IndexedDB queue)
- **Online only**: Midtrans payment, receipt sending, supplier API, dashboard realtime, staff auth

### Queue Architecture
- IndexedDB store for pending operations
- Each entry: id (becomes offline_id), type, payload, status, retries
- Processing: oldest first, exponential backoff on failure, max 20 retries
- Deduplication: offline_id UNIQUE constraint in Supabase

### Conflict Resolution
- **Stock oversold**: Both transactions kept (already happened), alert owner, manual adjust
- **Price changed while offline**: Transaction uses price at time of sale (snapshot in payload)
- **Book deleted while offline**: transaction_item has denormalized title+price, transaction remains valid

### Network Status UI
TopBar indicator: Online (green), Offline (yellow, shows available features + pending count), Syncing (progress bar)

### Yjs ↔ Supabase Sync
One-way only: Yjs → Supabase (book_id on inventory creation). No sync back. Inventory data fetched on-demand from Supabase, cached in memory/localStorage, invalidated via Realtime subscription.

---

## 11. Modular Architecture & Phased Delivery

### Phases

**Phase 1 — Foundation (MVP)**
- Extend existing catalog (Yjs)
- Supabase setup (auth, tables, RLS)
- Staff auth (PIN login)
- Role-based navigation (guest vs staff vs owner)
- Inventory management (CRUD, book_id bridge)
- POS — cash only
- Basic offline queue
- Reading tracker continues working (existing)

**Phase 2 — Payments & Visibility**
- Midtrans integration (QRIS, eWallet, card, VA)
- Digital receipt (WhatsApp + email)
- Owner + staff dashboard
- Pelanggan browse (availability badges, prices)

**Phase 3 — Supply Chain & Consignment**
- Supplier management + Purchase orders
- Supplier API integration (abstract adapter)
- Consignment management + settlement
- Notification system (in-app + WhatsApp)
- Restock suggestion engine

**Phase 4 — Advanced Features**
- Lending module (read-in-store tracking)
- Kiosk mode
- Thermal printer support
- Advanced reports (export CSV/PDF/Excel)
- Prediction engine

**Phase 5 — Scale**
- Multi-outlet support
- Inter-outlet transfer
- Consolidated cross-outlet reporting

### Code Structure

```
src/lib/
├── db/                     # existing Yjs layer (unchanged)
├── services/               # existing services (extended)
├── modules/                # NEW — business modules
│   ├── auth/               # PIN login, session, role guard
│   ├── inventory/          # CRUD, stock, bridge to Yjs
│   ├── pos/                # Cart, checkout, offline queue
│   ├── payment/            # Midtrans provider
│   ├── receipt/            # WhatsApp + email providers
│   ├── supplier/           # Supplier CRUD, PO, API adapters
│   ├── consignment/        # Consignment + settlement
│   ├── dashboard/          # Reports, prediction
│   ├── notification/       # In-app + WhatsApp providers
│   └── sync/               # Offline queue, sync manager
├── supabase/               # Client config, generated types, RLS
└── shared/                 # Shared utilities (book-id bridge)

src/routes/
├── (existing)              # Becomes guest browse
├── staff/                  # Staff-only routes (POS, inventory)
├── owner/                  # Owner-only routes (dashboard, settings)
├── login/                  # PIN entry
└── ...

supabase/
├── migrations/             # SQL migrations
├── functions/              # Edge Functions (payment, webhook, receipt)
└── config.toml
```

### Design Principles
1. **Module independence**: Each module has own types, service, stores. Communicate via interfaces.
2. **Provider pattern**: Payment, receipt, notification, printer, supplier — all use abstract interface + concrete provider. Swappable.
3. **Phase gates**: Feature flags per module. Later-phase features can be hidden.
4. **Existing code preserved**: Yjs layer, components, design system, i18n, PWA — all kept. Extend, don't replace.
5. **Clear data ownership**: Yjs owns book metadata. Supabase owns business data. Never duplicate ownership.

---

## 12. Implementation Notes

Clarifications from spec review to guide planning:

### RLS (Row Level Security) Strategy
- All business tables scoped by `outlet_id` (future multi-outlet isolation)
- Staff can only read/write data for their assigned outlet
- Owner can read/write all outlets
- Guest (pelanggan) has no Supabase access — browse is Yjs-only
- `inventory` read access for authenticated staff only (prices, stock detail)

### Tax Handling
- Indonesian PPN (Pajak Pertambahan Nilai) 11% — configurable in outlet settings
- Applied per-transaction (not per-item)
- `outlet.tax_rate decimal(5,2) DEFAULT 11.00` — new field on outlet table
- POS shows subtotal + tax + total breakdown
- Tax can be set to 0 for cafes not registered as PKP

### WhatsApp Provider
- Start with **Fonnte** (simpler API, cheaper, widely used by Indonesian UMKM)
- Abstract `MessagingProvider` interface from day one
- API key stored in Supabase secrets (not in client code)

### Midtrans Environment
- Use Midtrans **Sandbox** for all development and testing
- API keys (server key, client key) stored as Supabase secrets
- Edge Functions access via `Deno.env.get('MIDTRANS_SERVER_KEY')`
- Toggle sandbox/production via environment variable `MIDTRANS_IS_PRODUCTION`
- Snap.js loaded from sandbox URL in dev, production URL in prod
