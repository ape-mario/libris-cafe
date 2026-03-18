# Libris CRDT Migration: Dexie → Yjs

## Overview

Migrate Libris from Dexie.js (IndexedDB) to Yjs CRDTs for conflict-free real-time sync across devices. The app continues to work fully offline; sync is opt-in via room codes.

## Goals

- Conflict-free sync between any number of devices
- Zero data loss when editing offline on multiple devices simultaneously
- No user accounts or auth backend required
- Support both managed (PartyKit) and self-hosted (Hocuspocus) sync servers
- Seamless one-time migration from existing Dexie data
- App works identically for users who never enable sync

## Non-Goals

- User authentication (email/password, OAuth)
- Server-side data processing or analytics
- Real-time collaborative editing of the same notes field simultaneously (field-level LWW is acceptable for this app's use case — family members rarely edit the same book's notes at the same time)

---

## 1. CRDT Document Structure

All data lives in a single `Y.Doc`. Top-level collections are `Y.Map`s keyed by entity ID. Each entity value is itself a **nested `Y.Map`** (not a plain JSON object) to enable field-level merge on concurrent edits.

```
Y.Doc ("libris")
│
├── books (Y.Map<string, Y.Map>)
│   key: book.id (UUID)
│   value (Y.Map): {
│     id, title, authors: string[], isbn?, coverUrl?,
│     categories: string[], seriesId?, seriesOrder?,
│     dateAdded: string (ISO), dateModified: string (ISO)
│   }
│   Note: coverBase64 is NOT stored here. See Section 1.1.
│
├── userBookData (Y.Map<string, Y.Map>)
│   key: "${userId}:${bookId}" (compound key)
│   value (Y.Map): {
│     userId, bookId, status: 'unread'|'reading'|'read'|'dnf',
│     rating?, notes?, lentTo?, lentDate?: string (ISO),
│     isWishlist: boolean, currentPage?, totalPages?
│   }
│   Note: The old standalone `id` field is removed.
│   The compound key replaces it as the unique identifier.
│
├── users (Y.Map<string, Y.Map>)
│   key: user.id (UUID)
│   value (Y.Map): { id, name, avatar? }
│
├── series (Y.Map<string, Y.Map>)
│   key: series.id (UUID)
│   value (Y.Map): { id, name, description? }
│
├── shelves (Y.Map<string, Y.Map>)
│   key: shelf.id (UUID)
│   value (Y.Map): {
│     id, userId, name, dateCreated: string (ISO)
│   }
│   Note: bookIds stored as a nested Y.Map<string, true>
│   (set semantics) instead of an array, to allow concurrent
│   add/remove without conflict. See Section 1.2.
│
├── goals (Y.Map<string, Y.Map>)
│   key: "${userId}:${year}"
│   value (Y.Map): { target: number }
│
└── meta (Y.Map)
    roomCode?: string
    createdAt?: string (ISO)
    schemaVersion: number (initially 1)
```

### 1.1 Cover Images — Outside the CRDT

Cover images (coverBase64) are **not stored in the Y.Doc**. Reasons:
- A 500-book library with inline covers would produce a ~15MB+ CRDT document
- Yjs sync sends the full document state on first connect — 15MB over mobile WebSocket is unacceptable
- CRDT metadata overhead (tombstones, vector clocks) amplifies the size further
- PartyKit free tier has message size limits that may reject large sync payloads

**Instead, covers are handled separately:**
- `coverBase64` remains in a **separate IndexedDB store** (extending the existing `coverCache.ts`)
- Covers are NOT synced between devices automatically
- When a device displays a book without a cached cover, it falls back to `coverUrl` (Open Library URL)
- Future enhancement: optional cover sync via a separate mechanism (e.g., HTTP upload/download to the sync server)

### 1.2 Shelf BookIds — Set Semantics

Shelf `bookIds` uses a nested `Y.Map<string, true>` instead of a plain array:

```
shelf.bookIds (Y.Map):
  "book-uuid-1": true
  "book-uuid-2": true
```

This way, if Device A adds book X and Device B adds book Y to the same shelf concurrently, both additions merge without conflict. With a plain array, one device's changes would be lost.

The query layer converts this to `string[]` for service consumers.

### 1.3 Nested Y.Map Merge Semantics

Each entity is a nested Y.Map. When two devices concurrently edit the same entity:
- **Different fields** → both changes merge (e.g., Device A changes `rating`, Device B changes `notes` → both applied)
- **Same field** → Yjs uses document-level vector clocks for ordering. The "last" write wins, but unlike record-level LWW, other field changes are preserved.

This is the core advantage over storing plain JSON objects in the outer Y.Map.

### 1.4 Schema Evolution

The `meta.schemaVersion` field tracks the document schema version (initially `1`). Future changes:
- **Adding new fields**: Set defaults in the query layer when a field is missing from a Y.Map entry. No migration needed.
- **Adding new collections**: Create the new top-level Y.Map on first access. Old clients ignore unknown maps.
- **Removing/renaming fields**: Perform a one-time migration similar to Dexie version upgrades, gated on `meta.schemaVersion`.

### 1.5 Design Decisions Summary

- **Nested Y.Map per entity**: Enables field-level merge instead of record-level LWW.
- **Y.Map over Y.Array**: Maps use ID as key, so concurrent inserts never conflict.
- **Compound keys for per-user data**: `${userId}:${bookId}` eliminates compound indexes.
- **Dates as ISO strings**: Yjs serializes primitives only.
- **Covers outside CRDT**: Keeps sync payload small and fast.
- **Set semantics for bookIds**: Prevents concurrent shelf edit conflicts.

---

## 2. Query Helpers Layer

A thin synchronous wrapper over Yjs nested Y.Maps that replaces Dexie's async query API.

### File: `src/lib/db/query.ts`

```typescript
interface QueryHelpers {
  // Read — converts nested Y.Map to plain objects
  getItem<T>(mapName: string, id: string): T | undefined
  getAll<T>(mapName: string): T[]
  filter<T>(mapName: string, predicate: (item: T) => boolean): T[]
  search<T>(mapName: string, query: string, fields: (keyof T)[]): T[]

  // Write — converts plain objects to nested Y.Map updates
  setItem(mapName: string, id: string, data: Record<string, any>): void
  updateItem(mapName: string, id: string, partial: Record<string, any>): void
  deleteItem(mapName: string, id: string): void

  // Observe
  observe(mapName: string, callback: () => void): () => void
}
```

### Key Behaviors

- All read operations are **synchronous** — data is already in memory via Yjs.
- Read operations convert nested Y.Map entries to plain JS objects for consumers.
- Write operations wrap changes in `doc.transact()` for batching.
- `setItem()` creates a nested Y.Map for the entity, setting each field individually (enabling field-level merge).
- `updateItem()` only updates specified fields in the nested Y.Map, leaving other fields untouched.
- `search()` performs case-insensitive substring matching. Multi-word queries use AND logic. Array fields (like `authors`) are joined to a string before matching.
- `observe()` returns an unsubscribe function; used by the reactive layer.

### Special Handling

- **Shelf bookIds**: `getItem` for shelves converts the nested `bookIds` Y.Map to a `string[]`. `setItem`/`updateItem` for shelves converts `bookIds: string[]` back to Y.Map entries.
- **Date fields**: Returned as strings; service layer converts to Date objects where needed.

### Performance

For a library of ~1,000 books (generous upper bound), `getAll()` + JS `.filter()` + `.sort()` completes in <1ms. No indexing needed.

---

## 3. Reactive Layer (Svelte ↔ Yjs)

Svelte store wrappers that automatically update when Yjs data changes (local or remote).

### File: `src/lib/db/reactive.ts`

```typescript
// Returns a Svelte-readable store that re-emits
// whenever the underlying Y.Map changes
function liveQuery<T>(mapName: string): Readable<T[]>

// Single item observation
function liveItem<T>(mapName: string, id: string): Readable<T | undefined>
```

### Usage in Components

```svelte
<!-- Before (Dexie) -->
<script>
  let books = $state<Book[]>([]);
  onMount(async () => {
    books = await getBooks();
  });
  afterNavigate(() => { loadBooks(); });
</script>

<!-- After (Yjs) -->
<script>
  import { liveQuery } from '$lib/db/reactive';
  const booksStore = liveQuery<Book>('books');
  let books = $derived(
    $booksStore.sort((a, b) =>
      new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime()
    )
  );
  // Automatically reactive. No onMount, no afterNavigate.
</script>
```

### How It Works

1. `liveQuery('books')` creates a Svelte `readable` store.
2. Inside the store's `start` function, it subscribes to the `books` Y.Map's `observeDeep` event.
3. On any change (local write or remote sync), the store `set()`s the new value: `[...map.values()].map(yMapToPlainObject)`.
4. Components access the store via Svelte's `$` syntax, which triggers re-render on updates.
5. The store's `stop` function unsubscribes from `observeDeep` when no subscribers remain.

This uses Svelte's standard `Readable` store contract, which is fully compatible with `$derived`.

---

## 4. Sync Architecture

### Provider Abstraction

```
src/lib/sync/
├── provider.ts        # SyncProvider interface
├── partykit.ts        # PartyKit WebSocket provider
├── hocuspocus.ts      # Hocuspocus WebSocket provider
└── room.ts            # Room code generation & validation
```

### Interface: `src/lib/sync/provider.ts`

```typescript
interface SyncProvider {
  connect(doc: Y.Doc, roomCode: string): void
  disconnect(): void
  readonly status: 'disconnected' | 'connecting' | 'connected' | 'offline'
  onStatusChange(cb: (status: SyncStatus) => void): () => void
}

type SyncStatus = 'disconnected' | 'connecting' | 'connected' | 'offline'
```

### Status States

- **disconnected**: No room configured, or user left room
- **connecting**: WebSocket handshake in progress
- **connected**: Active sync connection
- **offline**: Room configured but device has no network (`navigator.onLine === false`)

### Provider Implementations

**PartyKit** (`partykit.ts`):
- Uses `y-partykit/provider` package
- Connects to a PartyKit project URL
- Room code maps to a PartyKit room name
- Free tier: 100K requests/day, sufficient for personal use

**Hocuspocus** (`hocuspocus.ts`):
- Uses `@hocuspocus/provider` package
- Connects to user-specified server URL
- Room code maps to a Hocuspocus document name
- Self-hosted on any VPS with Node.js
- Recommended rate limit: max 10 connection attempts per IP per minute

### Sync Lifecycle

```
App start
  └─ Load Y.Doc from y-indexeddb (always)
      └─ Check meta.roomCode
          ├─ null → offline-only, done
          └─ exists → read provider config from localStorage
              └─ navigator.onLine?
                  ├─ no → status = 'offline', listen for 'online' event
                  └─ yes → connect(doc, roomCode)
                      └─ WebSocket established
                          └─ Yjs handles sync protocol automatically
                              └─ On disconnect → auto-reconnect with backoff
```

### Error Handling

- **Invalid room code / room not found**: Show toast error, set status to 'disconnected', clear roomCode from meta
- **Server unavailable**: Set status to 'offline', auto-retry with exponential backoff (1s, 2s, 4s, max 30s)
- **WebSocket rejected**: Show toast with server error message, set status to 'disconnected'
- **All failures**: App continues working offline. Data is never lost — it's in local IndexedDB.

### Room Codes

**File: `src/lib/sync/room.ts`**

- Format: `XXXX-XXXX` (8 alphanumeric chars, uppercase, no ambiguous chars like 0/O, 1/I/L)
- Character set: `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (30 chars)
- Entropy: 30^8 ≈ 6.5 × 10^11 combinations
- Generated client-side via `crypto.getRandomValues()`

**Create Room flow:**
1. Generate room code
2. Write to `meta.roomCode` in Y.Doc
3. Connect to sync server with that room code
4. Display code + shareable link in Settings UI

**Join Room flow:**
1. User enters room code (or opens shareable link)
2. Connect to sync server with that room code FIRST (before writing to local doc)
3. Yjs sync protocol merges remote state into local doc
4. Once sync completes, write `meta.roomCode` to local Y.Doc
5. UI updates automatically via liveQuery
6. Both devices now have the union of all books, userBookData, etc.

**Leave Room flow:**
1. Disconnect from sync server
2. Delete `meta.roomCode`
3. Local data remains (user keeps their books)
4. No longer receives updates from other devices

---

## 5. Migration: Dexie → Yjs

One-time, automatic migration when the app first loads with the new code.

### File: `src/lib/db/migrate.ts`

### Flow

```
App start
  └─ Check localStorage: 'libris_migrated_at'
      ├─ exists → check Y.Doc has data?
      │   ├─ yes → skip, use Yjs
      │   └─ no → clear flag, re-run migration
      └─ null → check: Dexie 'MyBooksDB' exists?
          ├─ no → fresh install, skip
          └─ yes → check: Y.Doc already has data?
              ├─ yes → skip (Y.Doc populated by sync), set flag
              └─ no → run migration:
                  1. Open Dexie DB
                  2. Read all tables (users, books, userBookData,
                     series, shelves)
                  3. Read categories table; log warning if
                     non-empty (color data will not be migrated)
                  4. Convert coverBlob → store in coverCache
                     (NOT in CRDT)
                  5. Migrate goals from localStorage
                     (keys: reading_goal_${userId}_${year})
                  6. Drop UserBookData.id field, use compound key
                  7. Convert shelf bookIds arrays to Y.Map entries
                  8. Write all data to Y.Doc in a single transact()
                  9. Set localStorage 'libris_migrated_at' = ISO date
                  10. Log migration stats to console
```

### Safety

- Dexie database is NOT deleted after migration. It remains as a fallback.
- After 90 days (checked on app start, gated on `libris_migrated_at` timestamp), Dexie DB is deleted to free storage.
- If migration fails mid-way, the flag is not set, so it retries on next load.
- If migration re-runs into a non-empty Y.Doc (edge case: localStorage cleared but Y.Doc exists), migration is skipped and the flag is re-set.
- SyncConfig table data is NOT migrated (old CouchDB sync is removed). If user had CouchDB sync configured, they will see the new Sync UI with room-based sync instead.

### Goals Migration

Current goals are in localStorage keys: `reading_goal_${userId}_${year}`.
Migration scans all localStorage keys with this prefix and writes to the `goals` Y.Map as `${userId}:${year}` entries.

---

## 6. Services Adaptation

Every service file changes from async Dexie calls to synchronous query helper calls.

### Summary of Changes

| Service | Key Changes |
|---------|-------------|
| `books.ts` | `db.books.add()` → `setItem('books', id, data)`. `db.books.where('isbn')` → `filter('books', b => b.isbn === isbn)`. All functions become synchronous. Cover blob handling moves to coverCache. |
| `userbooks.ts` | `db.userBookData.where('[userId+bookId]')` → `getItem('userBookData', \`${userId}:${bookId}\`)`. The standalone `id` field is removed; compound key is the identifier. |
| `stats.ts` | `db.books.toArray()` → `getAll('books')`. `db.userBookData.where('userId')` → `filter('userBookData', d => d.userId === userId)`. |
| `shelves.ts` | `db.shelves.where('userId')` → `filter('shelves', s => s.userId === userId)`. `addBookToShelf`/`removeBookFromShelf` operate on the nested bookIds Y.Map. |
| `series.ts` | `db.series.add/get/toArray` → `setItem/getItem/getAll`. |
| `goals.ts` | Rewrite from localStorage to `getItem/setItem('goals', ...)`. |
| `backup.ts` | Export reads from Y.Doc maps, includes coverBase64 from coverCache. Import writes to Y.Doc maps + coverCache. Backup format version bumped to 4. Old versions (1-3) still importable. |
| `sync.ts` | **Deleted.** Replaced by `src/lib/sync/` module. |
| `coverCache.ts` | Extended to store custom cover base64 data. Separate from CRDT. |
| `openlibrary.ts` | Unchanged — API calls only. |
| `goodreads.ts` | Minor: writes via `setItem` instead of `db.books.add`. |
| `recommendations.ts` | Minor: reads via `getAll/filter` instead of Dexie queries. |
| `errorHandler.ts` | Unchanged. |

### Component Changes

All page components that use `onMount` + `afterNavigate` for data loading switch to `liveQuery` Svelte stores with `$` syntax + `$derived` for computed values. The `loading` state pattern (`let loading = $state(true)`) is no longer needed for CRDT data — it's instantly available.

Loading states are still needed for:
- OpenLibrary API searches
- Recommendation fetching
- Cover image loading

---

## 7. Settings UI Changes

The Sync section in Settings is redesigned:

```
Sync
┌─────────────────────────────────────────┐
│  Status: ● Connected                    │
│  Room: LIBR-7X2K  [Copy Link]          │
│                                         │
│  Provider: [PartyKit ▾]                │
│                                         │
│  [Leave Room]                           │
└─────────────────────────────────────────┘

-- OR (no room) --

Sync
┌─────────────────────────────────────────┐
│  Sync your library across devices.      │
│                                         │
│  [Create Room]  [Join Room]             │
└─────────────────────────────────────────┘

-- OR (join mode) --

Sync
┌─────────────────────────────────────────┐
│  Enter room code:                       │
│  [____-____]                            │
│                                         │
│  Provider:                              │
│  ○ PartyKit (managed, free)            │
│  ○ Self-hosted                         │
│    Server URL: [_____________________] │
│                                         │
│  [Join]  [Cancel]                       │
└─────────────────────────────────────────┘

-- Status indicator --

● Connected  (green)
● Connecting... (amber, pulse)
○ Disconnected (gray)
◌ Offline (gray, with "waiting for network" subtext)
```

### i18n Keys (new)

```
sync.title: 'Sync'
sync.status: 'Status'
sync.status.connected: 'Connected'
sync.status.connecting: 'Connecting...'
sync.status.disconnected: 'Disconnected'
sync.status.offline: 'Offline'
sync.status.offline_hint: 'Waiting for network...'
sync.room: 'Room'
sync.copy_link: 'Copy Link'
sync.provider: 'Provider'
sync.provider.partykit: 'PartyKit (managed, free)'
sync.provider.selfhosted: 'Self-hosted'
sync.server_url: 'Server URL'
sync.create_room: 'Create Room'
sync.join_room: 'Join Room'
sync.join_room.placeholder: 'Enter room code'
sync.leave_room: 'Leave Room'
sync.description: 'Sync your library across devices.'
sync.error.invalid_room: 'Invalid room code'
sync.error.server_unavailable: 'Server unavailable'
toast.room_created: 'Room created'
toast.room_joined: 'Joined room'
toast.room_left: 'Left room'
toast.link_copied: 'Link copied'
```

---

## 8. New Dependencies

| Package | Purpose | Size |
|---------|---------|------|
| `yjs` | CRDT core | ~15KB gzipped |
| `y-indexeddb` | Local persistence | ~3KB gzipped |
| `y-partykit` | PartyKit sync provider | ~5KB gzipped |
| `@hocuspocus/provider` | Hocuspocus sync provider | ~8KB gzipped |

### Removed Dependencies

| Package | Reason |
|---------|--------|
| `dexie` | Replaced by Yjs. Kept as dependency until migration code is removed. Only imported by `migrate.ts`, tree-shaken from production builds after migration grace period. |

---

## 9. File Structure (Final)

```
src/lib/
├── db/
│   ├── index.ts          # Y.Doc initialization + y-indexeddb persistence
│   ├── query.ts          # Query helpers (getAll, filter, setItem, etc.)
│   ├── reactive.ts       # Svelte store wrappers (liveQuery, liveItem)
│   ├── migrate.ts        # One-time Dexie → Yjs migration
│   └── types.ts          # Type definitions (updated: no UserBookData.id)
├── sync/
│   ├── provider.ts       # SyncProvider interface + factory
│   ├── partykit.ts       # PartyKit implementation
│   ├── hocuspocus.ts     # Hocuspocus implementation
│   └── room.ts           # Room code generation, validation, link parsing
├── services/             # All rewritten: async Dexie → sync query helpers
├── stores/               # Unchanged
├── i18n/                 # New sync-related keys added
└── components/           # Unchanged
```

---

## 10. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Room code guessed/brute-forced | Unauthorized access to library data | 30^8 = 6.5×10^11 combinations. Hocuspocus: rate limit 10 attempts/IP/min. PartyKit: managed rate limiting. Data is books, not sensitive. |
| Yjs library has breaking changes | Build failures | Pin exact versions in package.json. |
| User loses room code | Cannot reconnect from new device | Room code displayed in Settings on connected devices. Can always create new room. |
| Migration fails for edge-case data | Data not migrated | Migration retries on next load. Dexie DB preserved as fallback. Console logging. |
| PartyKit free tier exceeded | Sync stops working | App works fully offline. User can switch to self-hosted. Toast notification. |
| Nested Y.Map overhead | Slightly more memory per entity | Negligible for <1000 entities. Yjs is optimized for this pattern. |
| Categories with color data lost | Users who set category colors lose them | Migration logs warning. Category colors were not displayed in UI (unused feature). |
| Old CouchDB sync users confused | Old sync method gone | Settings shows new Sync UI. Old syncConfig data ignored. |
| Re-migration into populated Y.Doc | Duplicate or conflicting data | Migration checks Y.Doc emptiness; skips if already populated. |
