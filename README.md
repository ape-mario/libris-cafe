# Libris

A personal book collection manager built as a Progressive Web App. Track your reading, organize with shelves, and share a single library across family profiles — all offline-first with no account required.

## Features

- **Multi-profile support** — One shared book catalog, individual reading tracking per person ("Who's reading today?")
- **Library management** — Add books manually, search via Open Library API, or scan barcodes with your camera
- **Multiple copies** — Own duplicate books (different editions or extra copies) with independent tracking per copy
- **Reading status** — Track books as reading, read, DNF, or wishlist per profile
- **Shelves** — Create custom shelves to organize books your way
- **Series tracking** — Group books by series with reading order
- **Browse** — Explore your catalog by category, series, or author
- **Reading stats** — Per-user statistics: books read, pages, ratings, genre breakdown, monthly progress, and top authors
- **Reading goals** — Set and track yearly reading targets
- **Recommendations** — Get book suggestions based on your reading history (via Open Library)
- **Lending tracker** — Keep track of who you've lent books to
- **Notes & ratings** — Add personal notes and rate your books
- **Reading progress** — Track current page for books you're reading
- **Export/Import** — Backup and restore your library as JSON
- **Goodreads import** — Migrate your existing library from a Goodreads CSV export
- **Device sync** — Real-time sync across devices using room codes and Yjs CRDTs
- **Offline-first** — Works fully offline with IndexedDB storage and cover caching
- **Bilingual** — English and Bahasa Indonesia

## Tech Stack

- [SvelteKit](https://svelte.dev) (Svelte 5 with runes)
- [Tailwind CSS](https://tailwindcss.com) v4
- [Yjs](https://yjs.dev) (CRDT-based data layer with y-indexeddb persistence)
- [y-webrtc](https://github.com/nicoth-in/y-webrtc) (peer-to-peer sync, free)
- [PartyKit](https://partykit.io) / [Hocuspocus](https://tiptap.dev/hocuspocus) (WebSocket sync providers)
- [QuaggaJS](https://github.com/ericblade/quagga2) (barcode scanning)
- [Vite PWA](https://vite-pwa-org.netlify.app) (service worker & manifest)
- Static adapter (deploy anywhere)

## Getting Started

```sh
npm install
npm run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build to `build/` |
| `npm run preview` | Preview production build |
| `npm run check` | Type-check with svelte-check |
| `npm run test` | Run unit tests (Vitest) |

## Project Structure

```
src/
├── lib/
│   ├── components/    # Reusable UI components
│   ├── db/            # Yjs Y.Doc, query helpers, reactive stores, migration
│   ├── i18n/          # Translations (en, id)
│   ├── services/      # Business logic (books, stats, backup, etc.)
│   ├── stores/        # Svelte stores (user, theme, toast, dialog)
│   └── sync/          # Room codes, provider interface, WebRTC/PartyKit/Hocuspocus
├── routes/
│   ├── add/           # Add book (search, manual, scan)
│   ├── book/[id]/     # Book detail & editing
│   ├── browse/        # Browse by category, series, author
│   ├── join/[code]/   # Shareable room code join link
│   ├── mine/          # Per-user reading status
│   ├── settings/      # Settings, backup, sync
│   ├── shelves/       # Custom shelves
│   └── stats/         # Reading statistics & goals
├── static/            # PWA icons & assets
partykit/              # PartyKit sync server (optional)
```

## Sync

Data disimpan lokal di IndexedDB via Yjs CRDTs. Sync bersifat opsional — buat atau join room dengan kode (format: `XXXX-XXXX`) untuk sync antar device secara real-time.

Buka **Settings > Device Sync**, pilih provider, lalu **Create Room** atau **Join Room**.

### Pilihan Provider

| Provider | Biaya | Kelebihan | Kekurangan |
|----------|-------|-----------|------------|
| **WebRTC** (default) | Gratis, tanpa server | Langsung jalan, peer-to-peer | Kedua device harus online bersamaan |
| **PartyKit** | Free tier (20 koneksi) | Data persist di cloud, offline-to-online sync | Perlu deploy server |
| **Hocuspocus** | Self-hosted | Full kontrol, unlimited | Perlu VPS sendiri |

### WebRTC (Gratis, Tanpa Server)

Langsung pakai — tidak perlu setup apapun. Browser sync langsung ke browser lain via WebRTC menggunakan signaling server publik gratis.

```
Device A (Chrome)  ←──WebRTC──→  Device B (HP)
       ↕                              ↕
   IndexedDB                      IndexedDB
```

**Cara pakai:**
1. Buka Settings → Device Sync
2. Provider: WebRTC (Free) — sudah default
3. Klik **Create Room** → catat kode (misal `ABCD-EF23`)
4. Di device lain, buka Settings → **Join Room** → masukkan kode
5. Selesai — data sync otomatis selama kedua device online

**Limitasi:** Kedua device harus online bersamaan. Kalau satu offline, sync terjadi saat keduanya kembali online.

### PartyKit (Cloud, Free Tier)

PartyKit menyimpan Y.Doc di cloud, jadi device bisa sync meskipun tidak online bersamaan.

```
Device A  ←──WebSocket──→  PartyKit Server  ←──WebSocket──→  Device B
                                ↕
                         Durable Storage
                        (data persist di cloud)
```

**Cara kerja koneksi:**

1. Client membuat WebSocket connection ke `wss://<project>.partykit.dev/party/<room-code>`
2. PartyKit server (`partykit/server.ts`) menggunakan `y-partykit` yang handle:
   - **Initial sync:** Saat client baru connect, server kirim full Y.Doc state
   - **Incremental updates:** Setiap perubahan dikirim sebagai binary diff ke semua client di room yang sama
   - **Persistence:** Y.Doc state disimpan di Cloudflare Durable Objects (persist antar restart)
3. Room code jadi room ID — semua device dengan code yang sama terhubung ke Y.Doc yang sama

**Setup:**

```sh
# 1. Install PartyKit CLI & login
npm install -g partykit
npx partykit login

# 2. Deploy server
cd partykit
npm install
npm run deploy
# Output: https://libris-sync.<username>.partykit.dev
```

```sh
# 3. Build app dengan PartyKit host
VITE_PARTYKIT_HOST=libris-sync.<username>.partykit.dev npm run build
```

Atau untuk development lokal:
```sh
# Terminal 1: jalankan PartyKit server lokal
cd partykit && npm install && npm run dev
# Server jalan di localhost:1999

# Terminal 2: jalankan app (otomatis connect ke localhost:1999)
npm run dev
```

Lalu di Settings, pilih provider **PartyKit** dan buat/join room seperti biasa.

**Free tier limits:** 20 concurrent connections, 1GB storage — cukup untuk penggunaan pribadi/keluarga.

### Hocuspocus (Self-Hosted)

Untuk yang punya VPS dan mau full kontrol.

```sh
# Di VPS
mkdir hocuspocus && cd hocuspocus
npm init -y
npm install @hocuspocus/server

cat > index.js << 'EOF'
import { Hocuspocus } from "@hocuspocus/server";
new Hocuspocus({ port: 1234 }).listen();
EOF

node index.js
```

Di Settings, pilih **Self-hosted** → masukkan `wss://your-vps:1234` → Create/Join Room.

## License

Private
