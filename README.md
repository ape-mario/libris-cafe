# Libris Cafe

Sistem manajemen toko buku kafe — kelola inventori buku (dijual, baca di tempat, preloved, konsinyasi), POS dengan pembayaran digital (Midtrans), supply chain, dan dashboard analitik. Offline-first PWA yang bisa jalan di tablet kasir tanpa internet stabil.

## Fitur

**POS & Pembayaran**
- Kasir dengan barcode scan, search, cart
- Cash + digital payment (QRIS, GoPay, OVO, kartu, bank transfer) via Midtrans Snap
- Offline POS — transaksi cash tetap jalan tanpa internet, auto-sync saat online
- Digital receipt via WhatsApp (Fonnte) atau email

**Inventori**
- Stok tracking dengan audit trail (stock movements)
- Sumber buku: supplier, owner, konsinyasi, preloved (buyback)
- Tipe buku: dijual, baca di tempat, atau keduanya
- Low stock alerts + restock suggestion engine
- Demand forecast (prediksi berdasarkan sales velocity)

**Supply Chain**
- Manajemen supplier + purchase orders (draft → ordered → received)
- Konsinyasi — tracking penitip buku, settlement bulanan, komisi otomatis
- Notifikasi real-time (in-app via Supabase Realtime + WhatsApp)
- Daily summary otomatis ke owner

**Dashboard & Laporan**
- Owner dashboard: penjualan, margin, trend, top books, payment breakdown
- Staff dashboard: ringkasan hari ini
- Export laporan: CSV, PDF, Excel (10 jenis laporan)
- Consolidated reporting lintas outlet

**Baca di Tempat**
- Lending module: check-in/out dengan level semi-formal dan formal (deposit)
- Overdue detection + alerts
- Kiosk mode untuk tablet di cafe (fullscreen, auto-reset, browse-only)

**Multi-Outlet**
- Kelola beberapa outlet dari satu dashboard
- Transfer stok antar outlet (request → approve → ship → receive)
- Per-outlet staff management + reassignment
- Consolidated cross-outlet reporting

**Infrastruktur**
- Offline-first PWA (IndexedDB + service worker)
- Role-based access: owner, staff, pelanggan (guest)
- Bilingual: English + Bahasa Indonesia
- Thermal printer support (ESC/POS via Web Bluetooth/USB, Chrome only)
- Katalog sync antar perangkat via room code (Yjs CRDTs)

## Arsitektur

```
┌──────────────────────────────────────────────────────────────┐
│                    CLIENT (SvelteKit PWA)                    │
│                                                              │
│  Pelanggan (guest)     Staff              Owner              │
│  ├─ Browse katalog     ├─ POS + cart      ├─ Semua staff +   │
│  ├─ Search + scan      ├─ Inventori       ├─ Suppliers       │
│  └─ Lihat harga        ├─ Lending         ├─ Purchase orders │
│                        ├─ Notifications   ├─ Consignment     │
│                        └─ Reports         ├─ Multi-outlet    │
│                                           └─ Dashboard penuh │
├──────────────────────────────────────────────────────────────┤
│  Yjs + IndexedDB              │  Supabase Client             │
│  (katalog, offline)           │  (bisnis, auth)              │
│       │                       │       │                      │
│       │                  ┌────┴────┐  │                      │
│       │                  │ Offline │  │                      │
│       │                  │ Queue   │  │                      │
│       │                  │(IDB)   │  │                      │
└───────┼──────────────────┴────┬────┘──┼──────────────────────┘
        │                       │       │
   ┌────┴────┐            ┌─────┴───────┴──────────────────┐
   │PartyKit │            │          SUPABASE               │
   │(katalog │            │  Postgres (7 migrations)        │
   │ sync)   │            │  Auth (PIN login)               │
   │         │            │  Edge Functions (8 functions)    │
   └─────────┘            │  Realtime (notifications)       │
                          └────────────────────────────────┘
                                      │
                          ┌───────────┴───────────┐
                          │      Midtrans         │
                          │  (QRIS, eWallet,      │
                          │   kartu, VA)          │
                          └───────────────────────┘
```

**Data ownership terpisah jelas:**
- **Yjs** owns: katalog buku, cover, search index, reading tracker, shelves
- **Supabase** owns: inventori, transaksi, pembayaran, auth, supplier, konsinyasi
- **Bridge**: `Book.id` (UUID dari Yjs) = `inventory.book_id` (FK di Supabase)

## Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Frontend | [SvelteKit](https://svelte.dev) 2 + Svelte 5 (runes) |
| Styling | [Tailwind CSS](https://tailwindcss.com) v4 |
| Database | [Supabase](https://supabase.com) (Postgres + Auth + Edge Functions + Realtime) |
| Catalog CRDT | [Yjs](https://yjs.dev) + y-indexeddb |
| Catalog sync | [PartyKit](https://partykit.io) / [Hocuspocus](https://tiptap.dev/hocuspocus) |
| Payment | [Midtrans](https://midtrans.com) Snap |
| WhatsApp | [Fonnte](https://fonnte.com) API |
| Barcode | [QuaggaJS](https://github.com/ericblade/quagga2) |
| Charts | [Chart.js](https://www.chartjs.org) |
| PWA | [Vite PWA](https://vite-pwa-org.netlify.app) |
| Testing | [Vitest](https://vitest.dev) (135 tests) |

## Mulai

### Prerequisites

- Node.js 18+
- npm
- Supabase account (untuk fitur bisnis)
- Midtrans account (untuk pembayaran digital, opsional)
- Fonnte account (untuk WhatsApp receipt, opsional)

### Development

```sh
# 1. Clone & install
git clone https://github.com/ape-mario/libris-cafe.git
cd libris-cafe
npm install

# 2. Setup environment
cp .env.example .env
# Edit .env — isi Supabase URL + anon key

# 3. Run dev server
npm run dev
```

App langsung bisa dipakai dalam **mode guest** (browse katalog) tanpa Supabase.

### Supabase Setup

Untuk fitur bisnis (POS, inventori, auth, pembayaran):

```sh
# 1. Login ke Supabase CLI
npx supabase login

# 2. Link ke project
npx supabase link --project-ref YOUR_PROJECT_REF

# 3. Push semua migrations (7 files)
npx supabase db push

# 4. Deploy Edge Functions
npx supabase functions deploy create-payment
npx supabase functions deploy midtrans-webhook
npx supabase functions deploy check-payment
npx supabase functions deploy send-receipt-wa
npx supabase functions deploy send-receipt-email
npx supabase functions deploy export-pdf
npx supabase functions deploy export-excel
npx supabase functions deploy daily-summary

# 5. Set secrets
npx supabase secrets set MIDTRANS_SERVER_KEY=your-server-key
npx supabase secrets set MIDTRANS_IS_PRODUCTION=false
npx supabase secrets set FONNTE_API_TOKEN=your-fonnte-token
npx supabase secrets set ALLOWED_ORIGIN=https://your-app-domain.com
```

### Buat Staff Account

```sql
-- 1. Di Supabase Dashboard → Authentication → Add User
--    Email: owner@cafe.com, Password: 123456 (PIN 6 digit)

-- 2. Copy UUID user, lalu di SQL Editor:
INSERT INTO staff (id, name, email, role, pin_hash, outlet_id)
VALUES (
  'UUID-DARI-STEP-1',
  'Nama Owner',
  'owner@cafe.com',
  'owner',
  '',
  (SELECT id FROM outlet LIMIT 1)
);
```

### Midtrans Setup (Opsional)

1. Daftar di [midtrans.com](https://midtrans.com)
2. Ambil Server Key dari Dashboard → Settings → Access Keys
3. Set di Supabase secrets: `MIDTRANS_SERVER_KEY`
4. Untuk testing, gunakan Sandbox mode (`MIDTRANS_IS_PRODUCTION=false`)

### PartyKit Sync (Opsional)

Untuk sync katalog antar perangkat:

```sh
cd partykit
npm install
npm run deploy
# Output: https://libris-sync.<username>.partykit.dev

# Set di .env:
VITE_PARTYKIT_HOST=libris-sync.<username>.partykit.dev
```

## Skrip

| Perintah | Keterangan |
|----------|------------|
| `npm run dev` | Jalankan dev server |
| `npm run build` | Build produksi |
| `npm run preview` | Preview build produksi |
| `npm run check` | Type-check dengan svelte-check |
| `npm run test` | Jalankan 135 unit test (Vitest) |

## Struktur Proyek

```
src/lib/
├── components/              # UI Components
│   ├── BookCard.svelte      # Card buku dengan cover, status, availability
│   ├── TopBar.svelte        # Header: profil, outlet picker, notif bell, printer status
│   ├── BottomNav.svelte     # Nav: guest tabs vs staff tabs vs owner tabs
│   ├── BarcodeScanner.svelte
│   ├── AvailabilityBadge.svelte  # Badge harga/stok untuk pelanggan
│   ├── PaymentModal.svelte  # Midtrans Snap popup
│   ├── ReceiptSender.svelte # WhatsApp/email receipt form
│   ├── DashboardCard.svelte # Metric card reusable
│   ├── SalesChart.svelte    # Chart.js line chart
│   ├── OutletPicker.svelte  # Dropdown ganti outlet (owner)
│   ├── kiosk/               # Kiosk mode components
│   ├── lending/             # Check-in/out dialogs, session cards
│   ├── prediction/          # Restock table, velocity badge, stockout chart
│   ├── printer/             # Printer setup, print button
│   └── reports/             # Report builder, export button
│
├── modules/                 # Business Modules
│   ├── auth/                # PIN login, role store, route guard
│   ├── inventory/           # CRUD, stock movements, Yjs bridge, public availability
│   ├── pos/                 # Cart logic, atomic checkout, stores
│   ├── sync/                # Offline queue (IndexedDB), sync manager
│   ├── payment/             # Midtrans Snap, payment service, stores
│   ├── receipt/             # Templates (text/HTML), messaging provider
│   ├── dashboard/           # Metrics, sales trend, top books via RPC
│   ├── supplier/            # Supplier CRUD, PO lifecycle
│   ├── consignment/         # Consignor CRUD, settlement, sales ledger
│   ├── notification/        # In-app (Realtime), WhatsApp dispatch, stores
│   ├── restock/             # Heuristic engine: sales velocity, urgency scoring
│   ├── lending/             # Check-in/out, overdue detection, stats
│   ├── kiosk/               # Idle timer, fullscreen, auto-reset
│   ├── printer/             # ESC/POS builder, Bluetooth/USB providers
│   ├── prediction/          # Demand forecast, velocity analysis
│   ├── reports/             # CSV export, report schemas
│   ├── outlet/              # Multi-outlet CRUD, transfer state machine
│   └── reporting/           # Consolidated cross-outlet aggregation
│
├── db/                      # Yjs Y.Doc, query helpers, migration
├── services/                # Book CRUD, search, stats, backup, covers
├── stores/                  # User, theme, toast, dialog
├── supabase/                # Client config
├── i18n/                    # Bilingual EN/ID (500+ strings)
└── sync/                    # PartyKit/Hocuspocus room sync

src/routes/
├── login/                   # Staff PIN login
├── kiosk/                   # Kiosk mode (guest browse, fullscreen)
├── staff/                   # Auth-guarded staff routes
│   ├── pos/                 # Point of Sale
│   ├── inventory/           # Inventory management
│   ├── lending/             # Reading session management
│   ├── dashboard/           # Staff dashboard (today)
│   ├── notifications/       # Notification center
│   └── reports/             # Report builder + export
├── owner/                   # Auth-guarded owner routes
│   ├── dashboard/           # Full dashboard with charts
│   ├── suppliers/           # Supplier management
│   ├── purchase-orders/     # PO lifecycle
│   ├── consignment/         # Consignor + settlement
│   ├── restock/             # Restock suggestions
│   ├── outlets/             # Multi-outlet management
│   ├── transfers/           # Inter-outlet transfers
│   ├── reports/             # Consolidated reporting
│   └── prediction/          # Demand forecast
└── (existing)               # Browse, mine, shelves, stats, book detail, add, settings

supabase/
├── migrations/              # 7 SQL migrations
│   ├── 00001_foundation.sql          # outlet, staff, inventory, stock_movement, transaction
│   ├── 00002_payments_visibility.sql # payment, receipt, dashboard RPCs, mat views
│   ├── 00003_supply_chain.sql        # supplier, PO, consignor, settlement, notification
│   ├── 00004_advanced_features.sql   # reading_session, prediction views
│   ├── 00005_multi_outlet.sql        # outlet_transfer, consolidated RPCs
│   ├── 00006_production_fixes.sql    # atomic checkout, idempotent webhook, missing RPCs
│   └── 00007_nice_to_have.sql        # pg_cron, lending stats RPC
├── functions/               # 8 Edge Functions (Deno)
│   ├── create-payment/      # Midtrans Snap token
│   ├── midtrans-webhook/    # Payment notification (idempotent)
│   ├── check-payment/       # Poll payment status
│   ├── send-receipt-wa/     # WhatsApp via Fonnte
│   ├── send-receipt-email/  # Email receipt
│   ├── export-pdf/          # PDF report generation
│   ├── export-excel/        # Excel report generation
│   ├── daily-summary/       # Daily summary notification
│   └── _shared/             # Auth helper, CORS config
└── config.toml

partykit/                    # Catalog sync server
```

## Environment Variables

```sh
# Supabase (required untuk fitur bisnis)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# PartyKit (opsional, untuk catalog sync)
VITE_PARTYKIT_HOST=libris-sync.username.partykit.dev

# Supabase Edge Function secrets (set via supabase secrets set):
# MIDTRANS_SERVER_KEY     — Midtrans server key
# MIDTRANS_IS_PRODUCTION  — "true" atau "false"
# FONNTE_API_TOKEN        — Fonnte API token untuk WhatsApp
# ALLOWED_ORIGIN          — App domain untuk CORS (default: *)
```

## Dokumentasi

- [Design Spec](docs/superpowers/specs/2026-03-19-libris-cafe-design.md) — Arsitektur, data model, flow lengkap
- [Phase 1-5 Plans](docs/superpowers/plans/) — Implementation plans detail

## Lisensi

[MIT](LICENSE)
