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
- **Cloud sync** — Optional sync across devices via CouchDB
- **Offline-first** — Works fully offline with IndexedDB storage and cover caching
- **Bilingual** — English and Bahasa Indonesia

## Tech Stack

- [SvelteKit](https://svelte.dev) (Svelte 5 with runes)
- [Tailwind CSS](https://tailwindcss.com) v4
- [Dexie.js](https://dexie.org) (IndexedDB wrapper)
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
| `npm run test:e2e` | Run end-to-end tests (Playwright) |

## Project Structure

```
src/
├── lib/
│   ├── components/    # Reusable UI components
│   ├── db/            # Dexie database schema & types
│   ├── i18n/          # Translations (en, id)
│   ├── services/      # Business logic (books, stats, sync, etc.)
│   └── stores/        # Svelte stores (user, theme, toast, dialog)
├── routes/
│   ├── add/           # Add book (search, manual, scan)
│   ├── book/[id]/     # Book detail & editing
│   ├── browse/        # Browse by category, series, author
│   ├── mine/          # Per-user reading status
│   ├── settings/      # Settings, backup, sync
│   ├── shelves/       # Custom shelves
│   └── stats/         # Reading statistics & goals
└── static/            # PWA icons & assets
```

## License

Private
