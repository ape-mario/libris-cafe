# Libris Cafe

Sistem manajemen toko buku kafe — kelola inventori buku (dijual, baca di tempat, preloved, konsinyasi), POS dengan pembayaran digital (Midtrans), supply chain, dan dashboard analitik. Offline-first PWA yang bisa jalan di tablet kasir tanpa internet stabil.

## Fitur

**POS & Pembayaran**
- Kasir dengan barcode scan, search, cart
- Cash + digital payment (QRIS, GoPay, OVO, kartu, bank transfer) via Midtrans Snap
- Cash change calculator dengan quick amount buttons
- Diskon per-item dan per-cart (fixed atau persen)
- Void/return transaksi (owner only, dengan stock restore)
- Pending payment recovery (retry/cancel pembayaran digital yang terpotong)
- Offline POS — transaksi cash tetap jalan tanpa internet, auto-sync saat online
- Digital receipt via WhatsApp (Fonnte) atau email
- Transaction history dengan detail + void action

**Inventori**
- Stok tracking dengan audit trail (stock movements)
- Add, edit, adjust stock dari UI
- Sumber buku: supplier, owner, konsinyasi, preloved (buyback)
- Tipe buku: dijual, baca di tempat, atau keduanya
- Low stock alerts + restock suggestion engine
- Demand forecast (prediksi berdasarkan sales velocity)

**Supply Chain**
- Manajemen supplier + purchase orders (draft → ordered → received)
- Konsinyasi — tracking penitip buku, settlement bulanan, komisi otomatis, inventory per consignor
- Notifikasi real-time (in-app via Supabase Realtime + WhatsApp)
- Daily summary otomatis ke owner

**Dashboard & Laporan**
- Owner dashboard: penjualan, margin, trend, top books, payment breakdown, vs kemarin
- Staff dashboard: ringkasan hari ini
- Export laporan: CSV, PDF, Excel (10 jenis laporan)
- Consolidated reporting lintas outlet

**Baca di Tempat**
- Lending module: check-in/out dengan level semi-formal dan formal (deposit)
- Overdue detection + alerts
- Reading fee calculation + charge ke POS
- Kiosk mode untuk tablet di cafe (fullscreen, auto-reset, browse-only)

**Multi-Outlet**
- Kelola beberapa outlet dari satu dashboard
- Transfer stok antar outlet (request → approve → ship → receive)
- Per-outlet staff management + reassignment
- Consolidated cross-outlet reporting

**Infrastruktur**
- Offline-first PWA (IndexedDB + service worker + queue loss detection)
- Role-based access: owner, staff, pelanggan (guest)
- First-time setup wizard untuk owner non-teknis
- Staff account creation dari app (owner)
- Full data backup (JSON + SQL export)
- Bilingual: English + Bahasa Indonesia
- Thermal printer support (ESC/POS via Web Bluetooth/USB, Chrome only)
- Katalog sync antar perangkat via room code (Yjs CRDTs)
- Content Security Policy (CSP) configured

## Arsitektur

```
┌──────────────────────────────────────────────────────────────┐
│                    CLIENT (SvelteKit PWA)                    │
│                                                              │
│  Pelanggan (guest)     Staff              Owner              │
│  ├─ Browse katalog     ├─ POS + cart      ├─ Semua staff +   │
│  ├─ Search + scan      ├─ Inventori       ├─ Manage hub      │
│  └─ Lihat harga        ├─ Lending         ├─ Suppliers + PO  │
│                        ├─ Transactions    ├─ Consignment     │
│                        ├─ Notifications   ├─ Multi-outlet    │
│                        └─ Reports         └─ Dashboard penuh │
├──────────────────────────────────────────────────────────────┤
│  Yjs + IndexedDB              │  Supabase Client             │
│  (katalog, offline)           │  (bisnis, auth)              │
│       │                       │       │                      │
│       │                  ┌────┴────┐  │                      │
│       │                  │ Offline │  │                      │
│       │                  │ Queue   │  │                      │
│       │                  │ (IDB)   │  │                      │
└───────┼──────────────────┴────┬────┘──┼──────────────────────┘
        │                       │       │
   ┌────┴────┐            ┌─────┴───────┴──────────────────┐
   │PartyKit │            │          SUPABASE               │
   │(katalog │            │  Postgres (12 migrations)       │
   │ sync)   │            │  Auth (PIN login, 6+ digits)    │
   │         │            │  Edge Functions (9 functions)    │
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
| Charts | [Chart.js](https://www.chartjs.org) (lazy-loaded) |
| PWA | [Vite PWA](https://vite-pwa-org.netlify.app) |
| Testing | [Vitest](https://vitest.dev) (150 tests) |

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

# 3. Push semua migrations (12 files)
npx supabase db push

# 4. Deploy 9 Edge Functions
npx supabase functions deploy create-payment
npx supabase functions deploy midtrans-webhook
npx supabase functions deploy check-payment
npx supabase functions deploy send-receipt-wa
npx supabase functions deploy send-receipt-email
npx supabase functions deploy export-pdf
npx supabase functions deploy export-excel
npx supabase functions deploy daily-summary
npx supabase functions deploy create-staff

# 5. Set secrets
npx supabase secrets set MIDTRANS_SERVER_KEY=your-server-key
npx supabase secrets set MIDTRANS_IS_PRODUCTION=false
npx supabase secrets set FONNTE_API_TOKEN=your-fonnte-token
npx supabase secrets set ALLOWED_ORIGIN=https://your-app-domain.com
npx supabase secrets set CRON_SECRET=$(openssl rand -hex 32)

# 6. Enable extensions
# Dashboard → Database → Extensions → enable pg_cron
# Dashboard → Database → Replication → enable notification table
```

### Buat Staff Account

```sql
-- 1. Di Supabase Dashboard → Authentication → Add User
--    Email: owner@cafe.com, Password: 123456 (PIN minimal 6 digit)

-- 2. Copy UUID user, lalu di SQL Editor:
INSERT INTO staff (id, name, email, role, outlet_id)
VALUES (
  'UUID-DARI-STEP-1',
  'Nama Owner',
  'owner@cafe.com',
  'owner',
  (SELECT id FROM outlet LIMIT 1)
);
```

Atau gunakan **Setup Wizard** di `/setup` (pertama kali) atau buat staff dari `/owner/staff/new` (setelah login sebagai owner).

### Midtrans Setup (Opsional)

1. Daftar di [midtrans.com](https://midtrans.com)
2. Ambil Server Key dari Dashboard → Settings → Access Keys
3. Set di Supabase secrets: `MIDTRANS_SERVER_KEY`
4. Set webhook URL di Midtrans: `https://<project>.supabase.co/functions/v1/midtrans-webhook`
5. Untuk testing, gunakan Sandbox mode (`MIDTRANS_IS_PRODUCTION=false`)

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
| `npm run test` | Jalankan 150 unit test (Vitest) |

## Struktur Proyek

```
src/lib/
├── components/              # UI Components
│   ├── BookCard.svelte      # Card buku + availability badge
│   ├── TopBar.svelte        # Header: profil, outlet picker, notif bell, printer
│   ├── BottomNav.svelte     # Nav: guest / staff / owner tabs
│   ├── BarcodeScanner.svelte
│   ├── AvailabilityBadge.svelte
│   ├── PaymentModal.svelte  # Midtrans Snap popup
│   ├── ReceiptSender.svelte # WhatsApp/email receipt
│   ├── DashboardCard.svelte # Metric card
│   ├── SalesChart.svelte    # Chart.js (lazy-loaded)
│   ├── OutletPicker.svelte  # Dropdown ganti outlet
│   ├── TransferStatusBadge.svelte
│   ├── ConsolidatedChart.svelte
│   ├── kiosk/               # Kiosk mode components
│   ├── lending/             # Check-in/out dialogs, session cards
│   ├── prediction/          # Restock table, velocity badge, stockout chart
│   ├── printer/             # Printer setup, print button
│   └── reports/             # Report builder, export button
│
├── modules/                 # Business Modules
│   ├── auth/                # PIN login, role store, route guard, admin
│   ├── inventory/           # CRUD, stock movements, Yjs bridge, public availability
│   ├── pos/                 # Cart, atomic checkout, void, stores
│   ├── sync/                # Offline queue (IndexedDB), sync manager
│   ├── payment/             # Midtrans Snap, payment service
│   ├── receipt/             # Templates (text/HTML), messaging provider
│   ├── dashboard/           # Metrics, sales trend, top books via RPC
│   ├── supplier/            # Supplier CRUD, PO lifecycle
│   ├── consignment/         # Consignor CRUD, settlement, sales ledger
│   ├── notification/        # In-app (Realtime), WhatsApp dispatch
│   ├── restock/             # Heuristic engine: sales velocity, urgency
│   ├── lending/             # Check-in/out, overdue, reading fee
│   ├── kiosk/               # Idle timer, fullscreen, auto-reset
│   ├── printer/             # ESC/POS builder, Bluetooth/USB providers
│   ├── prediction/          # Demand forecast, velocity analysis
│   ├── reports/             # CSV export, report schemas (10 types)
│   ├── backup/              # Full JSON + SQL export
│   ├── outlet/              # Multi-outlet CRUD, transfer state machine
│   └── reporting/           # Consolidated cross-outlet aggregation
│
├── db/                      # Yjs Y.Doc, query helpers, migration
├── services/                # Book CRUD, search, stats, backup, covers
├── stores/                  # User, theme, toast, dialog (reactive getters)
├── shared/                  # Book ID utilities
├── supabase/                # Client config
├── i18n/                    # Bilingual EN/ID (550+ strings)
└── sync/                    # PartyKit/Hocuspocus room sync

src/routes/
├── setup/                   # First-time setup wizard
├── login/                   # Staff PIN login (6+ digit)
├── kiosk/                   # Kiosk mode (fullscreen, auto-reset)
├── staff/                   # Auth-guarded staff routes
│   ├── pos/                 # Point of Sale (cash, digital, discount, change)
│   ├── inventory/           # Inventory list, add new, detail, edit
│   ├── lending/             # Reading sessions, check-in/out, fees
│   ├── transactions/        # Transaction history, detail, void
│   ├── dashboard/           # Staff dashboard (today)
│   ├── notifications/       # Notification center
│   └── reports/             # Report builder + CSV/PDF/Excel export
├── owner/                   # Auth-guarded owner routes
│   ├── manage/              # Hub: links to all owner features
│   ├── dashboard/           # Full dashboard with charts + vs yesterday
│   ├── staff/               # Staff account management (create, deactivate)
│   ├── suppliers/           # Supplier management
│   ├── purchase-orders/     # PO lifecycle (create, receive)
│   ├── consignment/         # Consignor + settlement + inventory view
│   ├── restock/             # Restock suggestions by urgency
│   ├── prediction/          # Demand forecast + stockout timeline
│   ├── outlets/             # Multi-outlet management + staff assignment
│   ├── transfers/           # Inter-outlet transfers
│   ├── backup/              # Full data export (JSON + SQL)
│   └── reports/             # Consolidated cross-outlet reporting
└── (existing)               # Browse, mine, shelves, stats, book detail, add, settings

supabase/
├── migrations/              # 12 SQL migrations
│   ├── 00001_foundation.sql
│   ├── 00002_payments_visibility.sql
│   ├── 00003_supply_chain.sql
│   ├── 00004_advanced_features.sql
│   ├── 00005_multi_outlet.sql
│   ├── 00006_production_fixes.sql
│   ├── 00007_nice_to_have.sql
│   ├── 00008_performance_indexes.sql
│   ├── 00009_senior_review.sql
│   ├── 00010_security_fixes.sql
│   ├── 00011_void_rpc.sql
│   └── 00012_standards_compliance.sql
├── functions/               # 9 Edge Functions (Deno)
│   ├── create-payment/      # Midtrans Snap token (amount verified from DB)
│   ├── midtrans-webhook/    # Payment notification (idempotent RPC)
│   ├── check-payment/       # Poll payment status (outlet-scoped)
│   ├── send-receipt-wa/     # WhatsApp via Fonnte (authenticated)
│   ├── send-receipt-email/  # Email receipt (authenticated, sanitized)
│   ├── export-pdf/          # PDF report (authenticated, 10k row limit)
│   ├── export-excel/        # Excel report (authenticated, 10k row limit)
│   ├── daily-summary/       # Daily summary notification (CRON_SECRET)
│   ├── create-staff/        # Staff account creation (owner only, 50/outlet cap)
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
# ALLOWED_ORIGIN          — App domain untuk CORS (wajib di production)
# CRON_SECRET             — Random 32+ char untuk daily-summary auth
```

## Dokumentasi

- [CLAUDE.md](CLAUDE.md) — Development rules (selalu dibaca saat develop)
- [Coding Standards](docs/coding-standards.md) — Patterns, anti-patterns, checklists
- [Production Checklist](docs/production-checklist.md) — 150+ checkpoints sebelum launch
- [Design Spec](docs/superpowers/specs/2026-03-19-libris-cafe-design.md) — Arsitektur, data model, flow
- [Implementation Plans](docs/superpowers/plans/) — Phase 1-5 + remaining improvements

## Lisensi

[MIT](LICENSE)
