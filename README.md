# Libris

A personal book collection manager built as a Progressive Web App. Track your reading, organize with shelves, and share a single library across family profiles — all offline-first with no account required.

**[Live Demo](https://ape-mario.github.io/libris/)** — demo berjalan di GitHub Pages. Semua fitur berfungsi secara offline. Untuk sync antar perangkat, kamu perlu deploy sync server sendiri (lihat bagian [Sinkronisasi](#sinkronisasi)).

## Fitur

- **Multi-profil** — Satu katalog buku bersama, tracking bacaan per orang ("Siapa yang membaca hari ini?")
- **Kelola koleksi** — Tambah buku manual, cari via Open Library API, atau scan barcode pakai kamera
- **Bulk import ISBN** — Paste daftar ISBN, auto-fetch metadata dari Open Library sekaligus
- **Metadata lengkap** — Penerbit, tahun terbit, cetakan, kategori, seri — otomatis terisi dari Open Library
- **Deteksi duplikat** — Cek ISBN dan fuzzy matching judul saat tambah buku
- **Banyak kopi** — Simpan buku duplikat (edisi berbeda atau kopi tambahan) dengan tracking terpisah
- **Status bacaan** — Tandai buku sebagai sedang dibaca, selesai, DNF, atau wishlist per profil
- **Quick status** — Long-press cover buku untuk ubah status langsung tanpa buka detail
- **Bulk actions** — Pilih banyak buku sekaligus, ubah status atau tambah ke rak secara batch
- **Rak buku** — Buat rak kustom untuk mengatur buku sesukamu
- **Seri buku** — Kelompokkan buku berdasarkan seri dengan urutan baca
- **Jelajahi** — Telusuri koleksi berdasarkan kategori, seri, atau penulis
- **Filter & sort lanjutan** — Filter by status, rating minimum, kategori. Sort by judul, penulis, rating, tahun terbit, penerbit
- **Pencarian cepat** — Cari by judul, penulis, penerbit, atau ISBN dengan prefix index
- **Buku terkait** — Lihat rekomendasi buku terkait berdasarkan seri, penulis, dan kategori yang sama
- **Statistik** — Statistik per user dengan filter tahunan: buku selesai, halaman, rating, genre, progres bulanan, dan penulis favorit
- **Target membaca** — Atur dan pantau target bacaan tahunan dengan confetti saat tercapai
- **Rekomendasi** — Dapat saran buku berdasarkan riwayat bacaan (via Open Library)
- **Peminjaman** — Catat siapa yang meminjam bukumu
- **Catatan & rating** — Tambah catatan pribadi dan beri rating
- **Progres baca** — Tandai halaman, lihat grafik riwayat progres harian
- **Ekspor/Impor** — Backup dan restore koleksi sebagai JSON atau CSV
- **Impor Goodreads** — Migrasi koleksi dari file CSV ekspor Goodreads (termasuk penerbit, tahun, cetakan)
- **Sync antar perangkat** — Sync real-time via room code menggunakan Yjs CRDTs
- **Offline-first** — Berfungsi penuh tanpa internet, data di IndexedDB dengan cache sampul (LRU eviction)
- **PWA** — Installable sebagai app di HP dan desktop
- **Bilingual** — English dan Bahasa Indonesia

## Tech Stack

- [SvelteKit](https://svelte.dev) (Svelte 5 with runes)
- [Tailwind CSS](https://tailwindcss.com) v4
- [Yjs](https://yjs.dev) (CRDT-based data layer with y-indexeddb persistence)
- [PartyKit](https://partykit.io) / [Hocuspocus](https://tiptap.dev/hocuspocus) (WebSocket sync providers)
- [QuaggaJS](https://github.com/ericblade/quagga2) (barcode scanning)
- [Vite PWA](https://vite-pwa-org.netlify.app) (service worker & manifest)
- Static adapter (deploy anywhere)

## Mulai

```sh
npm install
npm run dev
```

App langsung bisa dipakai tanpa sync server — semua data disimpan lokal di browser.

## Skrip

| Perintah | Keterangan |
|----------|------------|
| `npm run dev` | Jalankan dev server (terbuka ke jaringan lokal) |
| `npm run build` | Build produksi ke `build/` |
| `npm run preview` | Preview build produksi |
| `npm run check` | Type-check dengan svelte-check |
| `npm run test` | Jalankan unit test (Vitest) |

## Struktur Proyek

```
src/
├── lib/
│   ├── components/    # Komponen UI
│   ├── db/            # Yjs Y.Doc, query helpers, reactive stores, migrasi
│   ├── i18n/          # Terjemahan (en, id)
│   ├── services/      # Business logic (books, stats, backup, dll.)
│   ├── stores/        # Svelte stores (user, theme, toast, dialog)
│   └── sync/          # Room codes, provider interface, PartyKit/Hocuspocus
├── routes/
│   ├── add/           # Tambah buku (cari, manual, scan)
│   ├── book/[id]/     # Detail & edit buku
│   ├── browse/        # Jelajahi per kategori, seri, penulis
│   ├── join/[code]/   # Link join room yang bisa dibagikan
│   ├── mine/          # Status bacaan per user
│   ├── settings/      # Pengaturan, backup, sync
│   ├── shelves/       # Rak buku kustom
│   └── stats/         # Statistik & target membaca
├── static/            # Ikon PWA & aset
partykit/              # PartyKit sync server
```

## Sinkronisasi

> **Penting:** Fitur sync membutuhkan sync server. Tanpa server, app tetap berfungsi penuh secara offline — data tersimpan lokal di browser. Deploy sync server hanya diperlukan jika kamu ingin sync data antar perangkat (misalnya laptop dan HP).

Data disimpan lokal di IndexedDB via Yjs CRDTs. Sync bersifat opsional — buat atau join room dengan kode (format: `XXXX-XXXX`) untuk sync antar device secara real-time.

Buka **Settings > Device Sync**, lalu **Create Room** atau **Join Room**.

### Pilihan Provider

| Provider | Biaya | Kelebihan | Kekurangan |
|----------|-------|-----------|------------|
| **PartyKit** (default) | Free tier (20 koneksi) | Data persist di cloud, offline-to-online sync | Perlu deploy server |
| **Hocuspocus** | Self-hosted | Full kontrol, unlimited | Perlu VPS sendiri |

### PartyKit (Rekomendasi)

PartyKit menyimpan Y.Doc di cloud, jadi device bisa sync meskipun tidak online bersamaan. Free tier cukup untuk penggunaan pribadi/keluarga (20 concurrent connections, 1GB storage).

```
Device A  ←──WebSocket──→  PartyKit Server  ←──WebSocket──→  Device B
                                ↕
                         Durable Storage
                        (data persist di cloud)
```

**Cara kerja:**

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

Lalu buka Settings → **Create Room** atau **Join Room**.

#### Deploy dengan GitHub Pages

Kalau kamu deploy frontend ke GitHub Pages, set `VITE_PARTYKIT_HOST` sebagai repository secret:

1. Buka repo Settings → Secrets and variables → Actions
2. Tambah secret: `VITE_PARTYKIT_HOST` = `libris-sync.<username>.partykit.dev`
3. GitHub Actions workflow akan otomatis pakai secret ini saat build

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

## Lisensi

[MIT](LICENSE)
