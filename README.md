# Libris Cafe

> **Status: Work In Progress** — Transformasi dari Libris (personal book tracker) menjadi sistem manajemen toko buku kafe.

Sistem manajemen toko buku kafe — kelola inventori buku (dijual, baca di tempat, preloved, konsinyasi), POS dengan pembayaran digital, dan dashboard analitik. Offline-first PWA yang bisa jalan di tablet kasir tanpa internet stabil.

## Progress

### Phase 1: Foundation (MVP) — Done
- [x] Supabase setup (6 tabel, RLS, triggers)
- [x] Staff auth (PIN login, role-based access)
- [x] Inventory module (CRUD, stock movements, Yjs bridge)
- [x] Offline queue (IndexedDB, auto-sync)
- [x] POS — cash only (cart, checkout, barcode scan)
- [x] Login page, staff layout, conditional navigation
- [x] i18n bilingual (EN/ID)

### Phase 2: Payments & Visibility — Done
- [x] Integrasi Midtrans (QRIS, eWallet, kartu, VA)
- [x] Digital receipt (WhatsApp + email)
- [x] Dashboard owner + staff
- [x] Pelanggan browse (availability badges, harga)

### Phase 3: Supply Chain & Consignment — Done
- [x] Manajemen supplier + purchase orders
- [x] Integrasi API supplier (abstract adapter)
- [x] Konsinyasi (consignor, settlement)
- [x] Notifikasi (in-app + WhatsApp)
- [x] Restock suggestion engine

### Phase 4: Advanced Features — Done
- [x] Lending module (tracking baca di tempat)
- [x] Kiosk mode (tablet di cafe)
- [x] Thermal printer
- [x] Export laporan (CSV/PDF/Excel)
- [x] Prediction engine (demand forecast)

### Phase 5: Scale — Planned
- [ ] Multi-outlet
- [ ] Transfer antar outlet
- [ ] Consolidated reporting

## Arsitektur

Hybrid data layer — dua sumber data yang jelas terpisah:

```
┌─────────────────────────────────────────────┐
│           Yjs + IndexedDB (existing)        │
│  Katalog buku, cover, search, categories,   │
│  seri, reading tracker, shelves, goals      │
│  → Offline-first, eventual consistency      │
├─────────────────────────────────────────────┤
│              Supabase (new)                 │
│  Inventori, transaksi, pembayaran,          │
│  auth/roles, supplier, konsinyasi           │
│  → ACID, server-authoritative               │
├─────────────────────────────────────────────┤
│           Bridge: Book UUID                 │
│  Yjs Book.id = Supabase inventory.book_id   │
└─────────────────────────────────────────────┘
```

## User Roles

| Fitur | Owner | Staff | Pelanggan (guest) |
|-------|-------|-------|--------------------|
| Browse katalog | Ya | Ya | Ya |
| Lihat harga & ketersediaan | Ya | Ya | Ya |
| POS / jual buku | Ya | Ya | Tidak |
| Kelola inventori | Ya | Ya | Tidak |
| Dashboard penuh | Ya | Terbatas | Tidak |
| Settings & supplier | Ya | Tidak | Tidak |

## Tech Stack

- [SvelteKit](https://svelte.dev) (Svelte 5 with runes)
- [Tailwind CSS](https://tailwindcss.com) v4
- [Supabase](https://supabase.com) (Postgres, Auth, Edge Functions, Realtime)
- [Yjs](https://yjs.dev) (CRDT-based catalog with y-indexeddb persistence)
- [PartyKit](https://partykit.io) / [Hocuspocus](https://tiptap.dev/hocuspocus) (catalog sync)
- [Midtrans](https://midtrans.com) (payment gateway — Phase 2)
- [QuaggaJS](https://github.com/ericblade/quagga2) (barcode scanning)
- [Vite PWA](https://vite-pwa-org.netlify.app) (service worker & manifest)

## Mulai

```sh
npm install
npm run dev
```

### Supabase Setup

Untuk fitur bisnis (POS, inventori, auth), kamu perlu Supabase:

1. Buat project di [supabase.com](https://supabase.com)
2. Copy `.env.example` ke `.env` dan isi URL + anon key
3. Jalankan migration: `npx supabase db push`
4. Buat staff account di Supabase Auth + tabel staff

Tanpa Supabase, app tetap jalan dalam mode guest (browse katalog saja).

## Skrip

| Perintah | Keterangan |
|----------|------------|
| `npm run dev` | Jalankan dev server |
| `npm run build` | Build produksi |
| `npm run preview` | Preview build produksi |
| `npm run check` | Type-check dengan svelte-check |
| `npm run test` | Jalankan unit test (Vitest) |

## Struktur Proyek

```
src/
├── lib/
│   ├── components/        # Komponen UI (BookCard, TopBar, BottomNav, dll)
│   ├── db/                # Yjs Y.Doc, query helpers, migrasi
│   ├── i18n/              # Terjemahan (en, id)
│   ├── modules/           # Modul bisnis (baru)
│   │   ├── auth/          # PIN login, role store, route guard
│   │   ├── inventory/     # CRUD, stock movements, Yjs bridge
│   │   ├── pos/           # Cart logic, checkout, offline fallback
│   │   └── sync/          # Offline queue, sync manager
│   ├── services/          # Business logic (books, stats, backup, dll)
│   ├── shared/            # Shared utilities (book-id bridge)
│   ├── stores/            # Svelte stores (user, theme, toast, dialog)
│   ├── supabase/          # Supabase client & types
│   └── sync/              # Room codes, provider, PartyKit/Hocuspocus
├── routes/
│   ├── add/               # Tambah buku
│   ├── book/[id]/         # Detail & edit buku
│   ├── browse/            # Jelajahi per kategori, seri, penulis
│   ├── login/             # Staff PIN login
│   ├── mine/              # Status bacaan per user
│   ├── settings/          # Pengaturan, backup, sync
│   ├── shelves/           # Rak buku kustom
│   ├── staff/             # Staff-only routes (auth guarded)
│   │   ├── pos/           # Point of Sale
│   │   └── inventory/     # Inventory management
│   └── stats/             # Statistik & target membaca
supabase/
├── migrations/            # SQL migrations
└── config.toml            # Supabase project config
partykit/                  # PartyKit sync server (catalog)
```

## Sinkronisasi Katalog

Data katalog buku (Yjs) bisa di-sync antar perangkat via room code. Lihat [docs sync](docs/) untuk setup PartyKit atau Hocuspocus.

## Dokumentasi

- [Design Spec](docs/superpowers/specs/2026-03-19-libris-cafe-design.md) — Arsitektur, data model, flow lengkap
- [Phase 1 Plan](docs/superpowers/plans/2026-03-19-phase1-foundation.md)
- [Phase 2 Plan](docs/superpowers/plans/2026-03-19-phase2-payments-visibility.md)
- [Phase 3 Plan](docs/superpowers/plans/2026-03-19-phase3-supply-chain.md)
- [Phase 4 Plan](docs/superpowers/plans/2026-03-19-phase4-advanced.md)
- [Phase 5 Plan](docs/superpowers/plans/2026-03-19-phase5-scale.md)

## Lisensi

[MIT](LICENSE)
