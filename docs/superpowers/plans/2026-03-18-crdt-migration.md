# CRDT Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Libris from Dexie.js to Yjs CRDTs with PartyKit + Hocuspocus sync providers.

**Architecture:** Replace Dexie with a Yjs Y.Doc using nested Y.Maps per entity for field-level merge. A query helpers layer provides synchronous read/write. A reactive layer bridges Yjs → Svelte stores. Sync is opt-in via room codes, with pluggable providers (PartyKit managed, Hocuspocus self-hosted). One-time migration converts existing Dexie data.

**Tech Stack:** Yjs, y-indexeddb, y-partykit, @hocuspocus/provider, SvelteKit 5, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-18-crdt-migration-design.md`

---

## File Structure

```
src/lib/
├── db/
│   ├── index.ts          # REWRITE: Y.Doc init + y-indexeddb persistence (replaces Dexie init)
│   ├── query.ts           # CREATE: query helpers (getAll, filter, setItem, etc.)
│   ├── reactive.ts        # CREATE: Svelte store wrappers (liveQuery, liveItem)
│   ├── migrate.ts         # CREATE: one-time Dexie → Yjs migration
│   └── types.ts           # MODIFY: remove UserBookData.id, remove SyncConfig, update Date→string
├── sync/
│   ├── provider.ts        # CREATE: SyncProvider interface + factory
│   ├── partykit.ts        # CREATE: PartyKit implementation
│   ├── hocuspocus.ts      # CREATE: Hocuspocus implementation
│   └── room.ts            # CREATE: room code generation, validation, link parsing
├── services/
│   ├── books.ts           # REWRITE: Dexie → query helpers
│   ├── userbooks.ts       # REWRITE: Dexie → query helpers
│   ├── series.ts          # REWRITE: Dexie → query helpers
│   ├── shelves.ts         # REWRITE: Dexie → query helpers
│   ├── goals.ts           # REWRITE: localStorage → query helpers
│   ├── stats.ts           # REWRITE: Dexie → query helpers
│   ├── backup.ts          # REWRITE: Dexie → Y.Doc + coverCache
│   ├── coverCache.ts      # MODIFY: extend to store custom cover base64
│   ├── goodreads.ts       # MODIFY: Dexie → query helpers for writes
│   ├── recommendations.ts # MODIFY: Dexie → query helpers for reads
│   ├── sync.ts            # DELETE: replaced by src/lib/sync/
│   └── covers.ts          # UNCHANGED
│   └── openlibrary.ts     # UNCHANGED
│   └── errorHandler.ts    # UNCHANGED
├── stores/
│   └── user.svelte.ts     # REWRITE: Dexie → query helpers
├── i18n/
│   ├── en.ts              # MODIFY: add sync i18n keys, remove old sync keys
│   └── id.ts              # MODIFY: add sync i18n keys, remove old sync keys
├── routes/
│   ├── +layout.svelte     # MODIFY: init Y.Doc + sync on app start
│   ├── +page.svelte       # MODIFY: liveQuery reactive pattern
│   ├── add/+page.svelte   # MODIFY: sync service calls
│   ├── book/[id]/+page.svelte  # MODIFY: liveQuery + sync service calls
│   ├── mine/+page.svelte  # MODIFY: liveQuery reactive pattern
│   ├── browse/+page.svelte # MODIFY: liveQuery reactive pattern
│   ├── browse/category/[name]/+page.svelte # MODIFY: sync service calls
│   ├── browse/author/[name]/+page.svelte   # MODIFY: sync service calls
│   ├── browse/series/[id]/+page.svelte     # MODIFY: sync service calls
│   ├── shelves/+page.svelte # MODIFY: liveQuery reactive pattern
│   ├── stats/+page.svelte   # MODIFY: liveQuery reactive pattern
│   ├── settings/+page.svelte # REWRITE: new sync UI
│   └── join/[code]/+page.svelte # CREATE: shareable link handler
```

---

## Task 1: Install Dependencies & Update Types

**Files:**
- Modify: `package.json`
- Modify: `src/lib/db/types.ts`

- [ ] **Step 1: Install Yjs packages**

```bash
npm install yjs y-indexeddb
```

Note: y-partykit and @hocuspocus/provider installed later in Task 7 (sync providers).

- [ ] **Step 2: Update types.ts**

Remove `UserBookData.id` field (compound key replaces it). Remove `SyncConfig` interface. Remove `Category` interface (unused after migration). Change `Date` fields to `string` for Yjs compatibility. Remove `coverBlob` from `Book` (covers stored separately in coverCache).

```typescript
// src/lib/db/types.ts
export interface User {
  id: string;
  name: string;
  avatar?: string;
}

export interface Book {
  id: string;
  title: string;
  authors: string[];
  isbn?: string;
  coverUrl?: string;
  categories: string[];
  seriesId?: string;
  seriesOrder?: number;
  dateAdded: string;     // ISO string
  dateModified: string;  // ISO string
}

export interface UserBookData {
  userId: string;
  bookId: string;
  status: 'unread' | 'reading' | 'read' | 'dnf';
  rating?: number;
  notes?: string;
  lentTo?: string;
  lentDate?: string;     // ISO string
  isWishlist: boolean;
  currentPage?: number;
  totalPages?: number;
}

export interface Series {
  id: string;
  name: string;
  description?: string;
}

export interface Shelf {
  id: string;
  userId: string;
  name: string;
  bookIds: string[];     // query layer converts from Y.Map set
  dateCreated: string;   // ISO string
}

export interface ReadingGoal {
  target: number;
}
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json src/lib/db/types.ts
git commit -m "feat: install yjs dependencies and update types for CRDT migration"
```

---

## Task 2: Y.Doc Initialization & Query Helpers

**Files:**
- Rewrite: `src/lib/db/index.ts`
- Create: `src/lib/db/query.ts`
- Test: `src/lib/db/query.test.ts`

- [ ] **Step 1: Write query helpers tests**

Create `src/lib/db/query.test.ts`. Tests run against an in-memory Y.Doc (no IndexedDB needed).

```typescript
// src/lib/db/query.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import * as Y from 'yjs';
import { createQueryHelpers } from './query';

let doc: Y.Doc;
let q: ReturnType<typeof createQueryHelpers>;

beforeEach(() => {
  doc = new Y.Doc();
  q = createQueryHelpers(doc);
});

describe('Query helpers', () => {
  it('setItem and getItem roundtrip', () => {
    q.setItem('books', 'b1', { id: 'b1', title: 'Dune', authors: ['Frank Herbert'] });
    const item = q.getItem<any>('books', 'b1');
    expect(item).toEqual({ id: 'b1', title: 'Dune', authors: ['Frank Herbert'] });
  });

  it('getAll returns all items', () => {
    q.setItem('books', 'b1', { id: 'b1', title: 'Dune' });
    q.setItem('books', 'b2', { id: 'b2', title: '1984' });
    expect(q.getAll('books')).toHaveLength(2);
  });

  it('getItem returns undefined for missing key', () => {
    expect(q.getItem('books', 'nope')).toBeUndefined();
  });

  it('filter returns matching items', () => {
    q.setItem('books', 'b1', { id: 'b1', title: 'Dune', categories: ['sci-fi'] });
    q.setItem('books', 'b2', { id: 'b2', title: '1984', categories: ['dystopia'] });
    const results = q.filter<any>('books', b => b.categories.includes('sci-fi'));
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Dune');
  });

  it('search matches case-insensitive across fields', () => {
    q.setItem('books', 'b1', { id: 'b1', title: 'Dune', authors: ['Frank Herbert'] });
    q.setItem('books', 'b2', { id: 'b2', title: '1984', authors: ['George Orwell'] });
    const results = q.search<any>('books', 'frank', ['title', 'authors']);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Dune');
  });

  it('search with multi-word query uses AND logic', () => {
    q.setItem('books', 'b1', { id: 'b1', title: 'Dune Messiah', authors: ['Frank Herbert'] });
    q.setItem('books', 'b2', { id: 'b2', title: 'Dune', authors: ['Frank Herbert'] });
    const results = q.search<any>('books', 'dune messiah', ['title']);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Dune Messiah');
  });

  it('updateItem merges fields without overwriting others', () => {
    q.setItem('books', 'b1', { id: 'b1', title: 'Duen', authors: ['Frank Herbert'] });
    q.updateItem('books', 'b1', { title: 'Dune' });
    const item = q.getItem<any>('books', 'b1');
    expect(item!.title).toBe('Dune');
    expect(item!.authors).toEqual(['Frank Herbert']);
  });

  it('deleteItem removes the entry', () => {
    q.setItem('books', 'b1', { id: 'b1', title: 'Dune' });
    q.deleteItem('books', 'b1');
    expect(q.getItem('books', 'b1')).toBeUndefined();
    expect(q.getAll('books')).toHaveLength(0);
  });

  it('observe fires callback on changes', () => {
    let callCount = 0;
    q.observe('books', () => callCount++);
    q.setItem('books', 'b1', { id: 'b1', title: 'Dune' });
    expect(callCount).toBeGreaterThan(0);
  });

  it('shelf bookIds stored as Y.Map set, returned as string[]', () => {
    q.setItem('shelves', 's1', { id: 's1', name: 'Favorites', bookIds: ['b1', 'b2'] });
    const shelf = q.getItem<any>('shelves', 's1');
    expect(shelf!.bookIds).toEqual(expect.arrayContaining(['b1', 'b2']));
    expect(shelf!.bookIds).toHaveLength(2);
  });

  it('concurrent shelf bookIds edits merge correctly', () => {
    const doc2 = new Y.Doc();
    const q2 = createQueryHelpers(doc2);

    q.setItem('shelves', 's1', { id: 's1', name: 'Favs', bookIds: ['b1'] });
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc));

    // Device 1 adds b2, Device 2 adds b3
    const entry1 = q.getRawEntry('shelves', 's1')!;
    const bookIds1 = entry1.get('bookIds') as Y.Map<any>;
    bookIds1.set('b2', true);

    const entry2 = q2.getRawEntry('shelves', 's1')!;
    const bookIds2 = entry2.get('bookIds') as Y.Map<any>;
    bookIds2.set('b3', true);

    // Sync both ways
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc));
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(doc2));

    const shelf = q.getItem<any>('shelves', 's1');
    expect(shelf!.bookIds).toEqual(expect.arrayContaining(['b1', 'b2', 'b3']));
    expect(shelf!.bookIds).toHaveLength(3);
  });

  it('nested Y.Map enables field-level merge', () => {
    // Simulate two concurrent edits on different fields
    const doc2 = new Y.Doc();
    const q2 = createQueryHelpers(doc2);

    q.setItem('books', 'b1', { id: 'b1', title: 'Dune', rating: 3 });

    // Sync doc → doc2
    const state1 = Y.encodeStateAsUpdate(doc);
    Y.applyUpdate(doc2, state1);

    // Concurrent edits
    q.updateItem('books', 'b1', { title: 'Dune Messiah' }); // doc changes title
    q2.updateItem('books', 'b1', { rating: 5 });             // doc2 changes rating

    // Sync both ways
    const update1 = Y.encodeStateAsUpdate(doc);
    const update2 = Y.encodeStateAsUpdate(doc2);
    Y.applyUpdate(doc2, update1);
    Y.applyUpdate(doc, update2);

    // Both changes should be present
    const item1 = q.getItem<any>('books', 'b1');
    const item2 = q2.getItem<any>('books', 'b1');
    expect(item1!.title).toBe('Dune Messiah');
    expect(item1!.rating).toBe(5);
    expect(item2!.title).toBe('Dune Messiah');
    expect(item2!.rating).toBe(5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/lib/db/query.test.ts
```

Expected: FAIL — `./query` module does not exist yet.

- [ ] **Step 3: Implement query.ts**

Create `src/lib/db/query.ts`:

```typescript
import * as Y from 'yjs';

// Shared utility: convert nested Y.Map to plain JS object
// Exported for use by reactive.ts
export function yMapToObject(ymap: Y.Map<any>): Record<string, any> {
  const obj: Record<string, any> = {};
  ymap.forEach((value, key) => {
    if (value instanceof Y.Map) {
      // Check if this is a "set" Y.Map (all values are `true`) → convert to string[]
      // This handles shelf bookIds stored as Y.Map<string, true>
      let isSet = true;
      const keys: string[] = [];
      value.forEach((v, k) => {
        if (v !== true) isSet = false;
        keys.push(k);
      });
      if (isSet && keys.length > 0) {
        obj[key] = keys;
      } else if (isSet && keys.length === 0) {
        obj[key] = [];
      } else {
        // Regular nested Y.Map → plain object
        const inner: Record<string, any> = {};
        value.forEach((v, k) => { inner[k] = v; });
        obj[key] = inner;
      }
    } else {
      obj[key] = value;
    }
  });
  return obj;
}

// Fields that should be stored as Y.Map set semantics (array ↔ Y.Map<string, true>)
const SET_FIELDS: Record<string, string[]> = {
  shelves: ['bookIds'],
};

function objectToYMap(mapName: string, data: Record<string, any>): Y.Map<any> {
  const ymap = new Y.Map<any>();
  const setFields = SET_FIELDS[mapName] || [];

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;

    if (setFields.includes(key) && Array.isArray(value)) {
      // Convert string[] to Y.Map<string, true> for set semantics
      const setMap = new Y.Map<any>();
      for (const item of value) {
        setMap.set(item, true);
      }
      ymap.set(key, setMap);
    } else {
      ymap.set(key, value);
    }
  }
  return ymap;
}

export function createQueryHelpers(doc: Y.Doc) {
  function getMap(mapName: string): Y.Map<any> {
    return doc.getMap(mapName);
  }

  function getItem<T>(mapName: string, id: string): T | undefined {
    const map = getMap(mapName);
    const entry = map.get(id);
    if (!entry || !(entry instanceof Y.Map)) return undefined;
    return yMapToObject(entry) as T;
  }

  function getAll<T>(mapName: string): T[] {
    const map = getMap(mapName);
    const items: T[] = [];
    map.forEach((value) => {
      if (value instanceof Y.Map) {
        items.push(yMapToObject(value) as T);
      }
    });
    return items;
  }

  function filter<T>(mapName: string, predicate: (item: T) => boolean): T[] {
    return getAll<T>(mapName).filter(predicate);
  }

  function search<T>(mapName: string, query: string, fields: (keyof T)[]): T[] {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return getAll<T>(mapName);

    return filter<T>(mapName, (item) => {
      return terms.every(term => {
        return fields.some(field => {
          const val = item[field];
          if (Array.isArray(val)) {
            return val.join(' ').toLowerCase().includes(term);
          }
          return String(val ?? '').toLowerCase().includes(term);
        });
      });
    });
  }

  function setItem(mapName: string, id: string, data: Record<string, any>): void {
    doc.transact(() => {
      const map = getMap(mapName);
      const ymap = objectToYMap(mapName, data);
      map.set(id, ymap);
    });
  }

  function updateItem(mapName: string, id: string, partial: Record<string, any>): void {
    const setFields = SET_FIELDS[mapName] || [];
    doc.transact(() => {
      const map = getMap(mapName);
      let entry = map.get(id);
      if (!entry || !(entry instanceof Y.Map)) {
        entry = new Y.Map<any>();
        map.set(id, entry);
      }
      for (const [key, value] of Object.entries(partial)) {
        if (value === undefined) {
          entry.delete(key);
        } else if (setFields.includes(key) && Array.isArray(value)) {
          // Convert string[] to Y.Map set
          const setMap = new Y.Map<any>();
          for (const item of value) setMap.set(item, true);
          entry.set(key, setMap);
        } else {
          entry.set(key, value);
        }
      }
    });
  }

  function deleteItem(mapName: string, id: string): void {
    doc.transact(() => {
      getMap(mapName).delete(id);
    });
  }

  function observe(mapName: string, callback: () => void): () => void {
    const map = getMap(mapName);
    map.observeDeep(callback);
    return () => map.unobserveDeep(callback);
  }

  // Direct access to nested Y.Map for special operations (e.g., shelf bookIds)
  function getRawEntry(mapName: string, id: string): Y.Map<any> | undefined {
    const entry = getMap(mapName).get(id);
    return entry instanceof Y.Map ? entry : undefined;
  }

  return { getItem, getAll, filter, search, setItem, updateItem, deleteItem, observe, getRawEntry };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/lib/db/query.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Rewrite db/index.ts**

Replace the Dexie initialization with Y.Doc + y-indexeddb persistence + query helpers export.

```typescript
// src/lib/db/index.ts
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { createQueryHelpers } from './query';

export const doc = new Y.Doc();
export const q = createQueryHelpers(doc);

let persistence: IndexeddbPersistence | null = null;

export function initDoc(): Promise<void> {
  return new Promise((resolve) => {
    persistence = new IndexeddbPersistence('libris-crdt', doc);
    persistence.once('synced', () => {
      // Set schema version if not present
      const meta = doc.getMap('meta');
      if (!meta.get('schemaVersion')) {
        meta.set('schemaVersion', 1);
        meta.set('createdAt', new Date().toISOString());
      }
      resolve();
    });
  });
}

export function isDocEmpty(): boolean {
  return doc.getMap('books').size === 0 && doc.getMap('users').size === 0;
}

export type { User, Book, UserBookData, Series, Shelf, ReadingGoal } from './types';
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/index.ts src/lib/db/query.ts src/lib/db/query.test.ts src/lib/db/types.ts
git commit -m "feat: add Yjs Y.Doc initialization and query helpers with tests"
```

---

## Task 3: Reactive Layer

**Files:**
- Create: `src/lib/db/reactive.ts`
- Test: `src/lib/db/reactive.test.ts`

- [ ] **Step 1: Write reactive layer tests**

```typescript
// src/lib/db/reactive.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import * as Y from 'yjs';
import { createQueryHelpers } from './query';
import { createLiveQuery, createLiveItem } from './reactive';

let doc: Y.Doc;
let q: ReturnType<typeof createQueryHelpers>;

beforeEach(() => {
  doc = new Y.Doc();
  q = createQueryHelpers(doc);
});

describe('liveQuery', () => {
  it('emits initial data on subscribe', () => {
    q.setItem('books', 'b1', { id: 'b1', title: 'Dune' });

    const store = createLiveQuery<any>(doc, 'books');
    let value: any[] = [];
    const unsub = store.subscribe(v => { value = v; });

    expect(value).toHaveLength(1);
    expect(value[0].title).toBe('Dune');
    unsub();
  });

  it('re-emits on Y.Map change', () => {
    const store = createLiveQuery<any>(doc, 'books');
    let value: any[] = [];
    const unsub = store.subscribe(v => { value = v; });

    expect(value).toHaveLength(0);

    q.setItem('books', 'b1', { id: 'b1', title: 'Dune' });
    expect(value).toHaveLength(1);

    q.setItem('books', 'b2', { id: 'b2', title: '1984' });
    expect(value).toHaveLength(2);

    unsub();
  });

  it('stops observing after unsubscribe', () => {
    const store = createLiveQuery<any>(doc, 'books');
    let callCount = 0;
    const unsub = store.subscribe(() => { callCount++; });

    callCount = 0; // reset after initial emit
    unsub();

    q.setItem('books', 'b1', { id: 'b1', title: 'Dune' });
    expect(callCount).toBe(0);
  });

  it('re-emits on remote sync (Y.applyUpdate)', () => {
    const store = createLiveQuery<any>(doc, 'books');
    let value: any[] = [];
    const unsub = store.subscribe(v => { value = v; });

    // Simulate remote device adding a book
    const doc2 = new Y.Doc();
    const q2 = createQueryHelpers(doc2);
    q2.setItem('books', 'b1', { id: 'b1', title: 'Dune' });

    Y.applyUpdate(doc, Y.encodeStateAsUpdate(doc2));
    expect(value).toHaveLength(1);
    expect(value[0].title).toBe('Dune');
    unsub();
  });
});

describe('liveItem', () => {
  it('emits item on subscribe', () => {
    q.setItem('books', 'b1', { id: 'b1', title: 'Dune' });

    const store = createLiveItem<any>(doc, 'books', 'b1');
    let value: any;
    const unsub = store.subscribe(v => { value = v; });

    expect(value?.title).toBe('Dune');
    unsub();
  });

  it('emits undefined for missing item', () => {
    const store = createLiveItem<any>(doc, 'books', 'nope');
    let value: any = 'initial';
    const unsub = store.subscribe(v => { value = v; });

    expect(value).toBeUndefined();
    unsub();
  });

  it('re-emits on item change', () => {
    q.setItem('books', 'b1', { id: 'b1', title: 'Duen' });
    const store = createLiveItem<any>(doc, 'books', 'b1');
    let value: any;
    const unsub = store.subscribe(v => { value = v; });

    q.updateItem('books', 'b1', { title: 'Dune' });
    expect(value?.title).toBe('Dune');
    unsub();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/lib/db/reactive.test.ts
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement reactive.ts**

```typescript
// src/lib/db/reactive.ts
import * as Y from 'yjs';
import { readable, type Readable } from 'svelte/store';
import { yMapToObject } from './query';

function getAllFromMap<T>(map: Y.Map<any>): T[] {
  const items: T[] = [];
  map.forEach((value) => {
    if (value instanceof Y.Map) {
      items.push(yMapToObject(value) as T);
    }
  });
  return items;
}

export function createLiveQuery<T>(doc: Y.Doc, mapName: string): Readable<T[]> {
  return readable<T[]>([], (set) => {
    const map = doc.getMap(mapName);

    // Emit initial value
    set(getAllFromMap<T>(map));

    // Observe changes
    const handler = () => {
      set(getAllFromMap<T>(map));
    };
    map.observeDeep(handler);

    // Cleanup
    return () => {
      map.unobserveDeep(handler);
    };
  });
}

export function createLiveItem<T>(doc: Y.Doc, mapName: string, id: string): Readable<T | undefined> {
  return readable<T | undefined>(undefined, (set) => {
    const map = doc.getMap(mapName);

    const emit = () => {
      const entry = map.get(id);
      if (entry instanceof Y.Map) {
        set(yMapToObject(entry) as T);
      } else {
        set(undefined);
      }
    };

    emit();
    map.observeDeep(emit);
    return () => map.unobserveDeep(emit);
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/lib/db/reactive.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/reactive.ts src/lib/db/reactive.test.ts
git commit -m "feat: add reactive Svelte store wrappers for Yjs maps"
```

---

## Task 4: Rewrite Services Layer

This is the largest task. Each service is rewritten from async Dexie calls to synchronous query helper calls. Services maintain the same exported function names and signatures (except removing `Promise` wrappers where they become synchronous).

**Files:**
- Rewrite: `src/lib/services/books.ts`
- Rewrite: `src/lib/services/userbooks.ts`
- Rewrite: `src/lib/services/series.ts`
- Rewrite: `src/lib/services/shelves.ts`
- Rewrite: `src/lib/services/goals.ts`
- Rewrite: `src/lib/services/stats.ts`
- Rewrite: `src/lib/services/backup.ts`
- Modify: `src/lib/services/coverCache.ts`
- Modify: `src/lib/services/goodreads.ts`
- Modify: `src/lib/services/recommendations.ts`
- Delete: `src/lib/services/sync.ts`
- Rewrite: `src/lib/stores/user.svelte.ts`
- Test: `src/lib/services/books.test.ts` (update existing)

- [ ] **Step 1: Rewrite books.ts**

Replace all Dexie calls with query helpers. Functions become synchronous. `coverBlob` handling removed from Book type (moved to coverCache).

Key changes:
- `addBook()` → `q.setItem('books', id, data)` + return the book object
- `hasBookWithISBN()` → `q.filter('books', b => b.isbn === isbn).length > 0`
- `getBooks()` → `q.getAll<Book>('books').sort(...)`
- `searchBooks()` → `q.search<Book>('books', query, ['title', 'authors'])`
- `getBookById()` → `q.getItem<Book>('books', id)`
- `updateBook()` → `q.updateItem('books', id, { ...data, dateModified: new Date().toISOString() })`
- `deleteBook()` → `q.deleteItem('books', id)` + delete related userBookData entries
- All functions synchronous (no `async`/`Promise`)

- [ ] **Step 2: Rewrite userbooks.ts**

Key changes:
- Compound key: `${userId}:${bookId}`
- `getUserBookData()` → `q.getItem('userBookData', key)`
- `setUserBookData()` → `q.updateItem('userBookData', key, updates)` (upsert pattern: if not exists, setItem with defaults)
- `getUserBooks()` → `q.filter('userBookData', d => d.userId === userId && ...)`
- `getLentBooks()` → `q.filter('userBookData', d => d.userId === userId && d.lentTo)`
- No more standalone `id` field — compound key is the identifier

- [ ] **Step 3: Rewrite series.ts**

- `createSeries()` → `q.setItem('series', id, { id, name, description })`
- `getAllSeries()` → `q.getAll<Series>('series')`
- `deleteSeries()` → `q.deleteItem('series', id)`

- [ ] **Step 4: Rewrite shelves.ts**

Key changes — bookIds uses Y.Map set semantics:
- `createShelf()` → `q.setItem('shelves', id, { id, userId, name, dateCreated })` — bookIds starts empty
- `addBookToShelf()` → get the shelf's nested Y.Map entry, access/create its `bookIds` Y.Map, set `bookId: true`
- `removeBookFromShelf()` → delete `bookId` from the `bookIds` Y.Map
- `getUserShelves()` → `q.filter('shelves', s => s.userId === userId)` — query layer converts bookIds Y.Map to string[]
- `deleteShelf()` → `q.deleteItem('shelves', id)`

Note: The shelves service needs direct Y.Doc access for the nested `bookIds` Y.Map. Import `doc` from `db/index.ts`.

- [ ] **Step 5: Rewrite goals.ts**

- Remove `ReadingGoal` interface from `goals.ts` (consolidated in `types.ts`)
- `getGoal()` → `q.getItem<ReadingGoal>('goals', \`${userId}:${year}\`)`
- `setGoal()` → `q.setItem('goals', \`${userId}:${year}\`, { target })`
- `removeGoal()` → `q.deleteItem('goals', \`${userId}:${year}\`)`
- `getBooksReadThisYear()` → uses `q.getAll('books')` + `q.filter('userBookData', ...)`. Becomes synchronous.

- [ ] **Step 6: Rewrite stats.ts**

- Replace `db.books.toArray()` → `q.getAll<Book>('books')`
- Replace `db.userBookData.where('userId')` → `q.filter('userBookData', d => d.userId === userId)`
- All date comparisons use `new Date(isoString)` since dates are now ISO strings
- Function becomes synchronous (no `Promise`)

- [ ] **Step 7: Rewrite backup.ts**

Key changes:
- Export: read from Y.Doc maps via `q.getAll()`, fetch coverBase64 from coverCache
- Import: write to Y.Doc maps via `q.setItem()`, write covers to coverCache
- Bump backup version to 4
- Still import old versions (1-3) — convert `coverBlob`/`coverBase64` to coverCache, handle missing fields

- [ ] **Step 8: Extend coverCache.ts**

Add functions to:
- `setCoverBase64(bookId: string, base64: string): Promise<void>` — store custom cover
- `getCoverBase64(bookId: string): Promise<string | null>` — retrieve stored cover
- Keep existing `cacheCoverIfNeeded()` and `cacheAllCovers()` — they cache from `coverUrl`

This uses a separate IndexedDB store (not Yjs) for cover binary data.

- [ ] **Step 9: Update goodreads.ts and recommendations.ts**

- `goodreads.ts`: replace `db.books.add()` → `q.setItem('books', ...)`, and `setUserBookData` import
- `recommendations.ts`: replace `db.books.toArray()` → `q.getAll('books')` for reading user library data

- [ ] **Step 10: Rewrite user.svelte.ts**

Replace Dexie calls:
- `createUser()` → `q.setItem('users', id, { id, name, avatar })`
- `deleteUser()` → `q.deleteItem('users', id)`
- `getAllUsers()` → `q.getAll<User>('users')`
- `restoreUser()` → read from localStorage for current user ID, then `q.getItem('users', id)`
- Keep localStorage for "current user" selection (which profile is active) — this is device-specific, not synced

- [ ] **Step 11: Delete sync.ts**

```bash
rm src/lib/services/sync.ts
```

- [ ] **Step 12: Update existing tests**

Update `src/lib/services/books.test.ts`:
- Replace `import { db } from '$lib/db'` with Y.Doc setup
- Replace `db.books.clear()` with fresh Y.Doc per test
- Adjust for synchronous API (remove `await` where functions are no longer async)
- Adjust for removed `coverBlob` field

- [ ] **Step 13: Run all tests**

```bash
npm test
```

Expected: All tests PASS.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "feat: rewrite all services from Dexie to Yjs query helpers"
```

---

## Task 5: Migration Layer (Dexie → Yjs)

**Files:**
- Create: `src/lib/db/migrate.ts`
- Test: `src/lib/db/migrate.test.ts`

- [ ] **Step 1: Write migration tests**

Test the core migration logic: reads from Dexie, writes to Y.Doc. Uses `fake-indexeddb` for Dexie and in-memory Y.Doc.

Test cases:
- Migrates books (converts Date → ISO string, drops coverBlob, keeps coverUrl)
- Migrates userBookData (drops standalone `id`, creates compound key)
- Migrates users and series
- Migrates shelves (converts `bookIds` array to Y.Map entries)
- Migrates goals from localStorage (`reading_goal_*` keys)
- Skips migration if Y.Doc already has data
- Sets `libris_migrated_at` flag after success
- Logs warning for non-empty categories table

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/lib/db/migrate.test.ts
```

- [ ] **Step 3: Implement migrate.ts**

```typescript
// src/lib/db/migrate.ts
import Dexie from 'dexie';
import * as Y from 'yjs';

const MIGRATION_FLAG = 'libris_migrated_at';
const GOAL_KEY_PREFIX = 'reading_goal_';

export async function migrateFromDexie(doc: Y.Doc): Promise<{ migrated: boolean; stats?: Record<string, number> }> {
  // Check if already migrated and Y.Doc has data
  const flag = localStorage.getItem(MIGRATION_FLAG);
  const docHasData = doc.getMap('books').size > 0 || doc.getMap('users').size > 0;

  if (flag && docHasData) {
    return { migrated: false };
  }

  if (docHasData) {
    // Y.Doc populated (e.g., via sync), just set the flag
    localStorage.setItem(MIGRATION_FLAG, new Date().toISOString());
    return { migrated: false };
  }

  // Check if Dexie DB exists
  const databases = await Dexie.getDatabaseNames();
  if (!databases.includes('MyBooksDB')) {
    return { migrated: false };
  }

  // Open old Dexie DB
  const oldDb = new Dexie('MyBooksDB');
  oldDb.version(3).stores({
    users: 'id, name',
    books: 'id, title, isbn, *categories, seriesId, dateAdded',
    userBookData: 'id, [userId+bookId], userId, bookId, status, isWishlist',
    series: 'id, name',
    categories: 'id, name',
    shelves: 'id, userId, name',
    syncConfig: 'id'
  });

  const stats: Record<string, number> = {};

  try {
    // Read all data from Dexie
    const [users, books, userBookData, series, categories, shelves] = await Promise.all([
      oldDb.table('users').toArray(),
      oldDb.table('books').toArray(),
      oldDb.table('userBookData').toArray(),
      oldDb.table('series').toArray(),
      oldDb.table('categories').toArray().catch(() => []),
      oldDb.table('shelves').toArray().catch(() => []),
    ]);

    // Warn about categories with color data
    const coloredCats = categories.filter((c: any) => c.color);
    if (coloredCats.length > 0) {
      console.warn(`[Libris Migration] ${coloredCats.length} categories with color data will not be migrated.`);
    }

    // Write all data in a single transaction using direct Y.Map access
    // (avoids nested doc.transact() calls that would happen via q.setItem)
    doc.transact(() => {
      const usersMap = doc.getMap('users');
      const booksMap = doc.getMap('books');
      const ubdMap = doc.getMap('userBookData');
      const seriesMap = doc.getMap('series');
      const shelvesMap = doc.getMap('shelves');
      const goalsMap = doc.getMap('goals');

      // Migrate users
      for (const user of users) {
        const ymap = new Y.Map<any>();
        ymap.set('id', user.id);
        ymap.set('name', user.name);
        if (user.avatar) ymap.set('avatar', user.avatar);
        usersMap.set(user.id, ymap);
      }
      stats.users = users.length;

      // Migrate books (drop coverBlob, convert dates)
      for (const book of books) {
        const ymap = new Y.Map<any>();
        ymap.set('id', book.id);
        ymap.set('title', book.title);
        ymap.set('authors', book.authors || []);
        if (book.isbn) ymap.set('isbn', book.isbn);
        if (book.coverUrl) ymap.set('coverUrl', book.coverUrl);
        ymap.set('categories', book.categories || []);
        if (book.seriesId) ymap.set('seriesId', book.seriesId);
        if (book.seriesOrder) ymap.set('seriesOrder', book.seriesOrder);
        ymap.set('dateAdded', book.dateAdded instanceof Date ? book.dateAdded.toISOString() : book.dateAdded);
        ymap.set('dateModified', book.dateModified instanceof Date ? book.dateModified.toISOString() : book.dateModified);
        booksMap.set(book.id, ymap);
      }
      stats.books = books.length;

      // Migrate userBookData (drop id, use compound key)
      for (const ubd of userBookData) {
        const key = `${ubd.userId}:${ubd.bookId}`;
        const ymap = new Y.Map<any>();
        ymap.set('userId', ubd.userId);
        ymap.set('bookId', ubd.bookId);
        ymap.set('status', ubd.status || 'unread');
        if (ubd.rating) ymap.set('rating', ubd.rating);
        if (ubd.notes) ymap.set('notes', ubd.notes);
        if (ubd.lentTo) ymap.set('lentTo', ubd.lentTo);
        if (ubd.lentDate) ymap.set('lentDate', ubd.lentDate instanceof Date ? ubd.lentDate.toISOString() : ubd.lentDate);
        ymap.set('isWishlist', ubd.isWishlist || false);
        if (ubd.currentPage) ymap.set('currentPage', ubd.currentPage);
        if (ubd.totalPages) ymap.set('totalPages', ubd.totalPages);
        ubdMap.set(key, ymap);
      }
      stats.userBookData = userBookData.length;

      // Migrate series
      for (const s of series) {
        const ymap = new Y.Map<any>();
        ymap.set('id', s.id);
        ymap.set('name', s.name);
        if (s.description) ymap.set('description', s.description);
        seriesMap.set(s.id, ymap);
      }
      stats.series = series.length;

      // Migrate shelves (bookIds as Y.Map set semantics)
      for (const shelf of shelves) {
        const ymap = new Y.Map<any>();
        ymap.set('id', shelf.id);
        ymap.set('userId', shelf.userId);
        ymap.set('name', shelf.name);
        ymap.set('dateCreated', shelf.dateCreated instanceof Date ? shelf.dateCreated.toISOString() : shelf.dateCreated);
        const bookIdsMap = new Y.Map<any>();
        for (const bookId of (shelf.bookIds || [])) {
          bookIdsMap.set(bookId, true);
        }
        ymap.set('bookIds', bookIdsMap);
        shelvesMap.set(shelf.id, ymap);
      }
      stats.shelves = shelves.length;

      // Migrate goals from localStorage
      let goalCount = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(GOAL_KEY_PREFIX)) {
          const value = localStorage.getItem(key);
          if (value) {
            const rest = key.slice(GOAL_KEY_PREFIX.length);
            const lastUnderscore = rest.lastIndexOf('_');
            if (lastUnderscore > 0) {
              const userId = rest.slice(0, lastUnderscore);
              const year = rest.slice(lastUnderscore + 1);
              const ymap = new Y.Map<any>();
              ymap.set('target', parseInt(value));
              goalsMap.set(`${userId}:${year}`, ymap);
              goalCount++;
            }
          }
        }
      }
      stats.goals = goalCount;
    });

    // Migrate cover blobs asynchronously (outside transact)
    // This stores covers in the separate coverCache IndexedDB
    for (const book of books) {
      if (book.coverBlob) {
        // Convert Blob to base64 and store in coverCache
        try {
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve, reject) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(book.coverBlob);
          });
          // Import setCoverBase64 from coverCache and store
          const { setCoverBase64 } = await import('../services/coverCache');
          await setCoverBase64(book.id, base64);
        } catch (e) {
          console.warn(`[Libris Migration] Failed to migrate cover for book ${book.id}:`, e);
        }
      }
    }

    localStorage.setItem(MIGRATION_FLAG, new Date().toISOString());
    console.log('[Libris Migration] Complete:', stats);
    return { migrated: true, stats };
  } catch (e) {
    console.error('[Libris Migration] Failed:', e);
    throw e;
  }
}

export function shouldCleanupDexie(): boolean {
  const flag = localStorage.getItem(MIGRATION_FLAG);
  if (!flag) return false;
  const migrationDate = new Date(flag);
  const daysSince = (Date.now() - migrationDate.getTime()) / (1000 * 60 * 60 * 24);
  return daysSince >= 90;
}

export async function cleanupDexie(): Promise<void> {
  try {
    await Dexie.delete('MyBooksDB');
    console.log('[Libris Migration] Old Dexie database cleaned up.');
  } catch (e) {
    console.warn('[Libris Migration] Failed to cleanup Dexie:', e);
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- src/lib/db/migrate.test.ts
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/migrate.ts src/lib/db/migrate.test.ts
git commit -m "feat: add one-time Dexie to Yjs migration"
```

---

## Task 6: Sync Module (Room Codes + Provider Abstraction)

**Files:**
- Create: `src/lib/sync/room.ts`
- Create: `src/lib/sync/provider.ts`
- Test: `src/lib/sync/room.test.ts`

- [ ] **Step 1: Write room code tests**

```typescript
// src/lib/sync/room.test.ts
import { describe, it, expect } from 'vitest';
import { generateRoomCode, isValidRoomCode, formatRoomCode, getRoomLink, parseRoomCodeFromUrl } from './room';

describe('Room codes', () => {
  it('generates 8-character code in XXXX-XXXX format', () => {
    const code = generateRoomCode();
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it('excludes ambiguous characters (0, O, 1, I, L)', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateRoomCode();
      expect(code).not.toMatch(/[01OIL]/);
    }
  });

  it('validates correct format', () => {
    expect(isValidRoomCode('ABCD-EF23')).toBe(true);
    expect(isValidRoomCode('abcd-ef23')).toBe(true);
    expect(isValidRoomCode('ABC')).toBe(false);
    expect(isValidRoomCode('ABCD-EFGI')).toBe(false); // I is ambiguous
  });

  it('handles multiple dashes in validation', () => {
    expect(isValidRoomCode('AB-CD-EF-23')).toBe(true); // 8 valid chars after removing dashes
  });

  it('formats room code to uppercase with dash', () => {
    expect(formatRoomCode('abcdef23')).toBe('ABCD-EF23');
    expect(formatRoomCode('ABCD-EF23')).toBe('ABCD-EF23');
  });

  it('parseRoomCodeFromUrl extracts valid code', () => {
    const code = parseRoomCodeFromUrl('https://libris.app/join/ABCD-EF23');
    expect(code).toBe('ABCD-EF23');
  });

  it('parseRoomCodeFromUrl returns null for invalid URL', () => {
    expect(parseRoomCodeFromUrl('https://libris.app/settings')).toBeNull();
    expect(parseRoomCodeFromUrl('not-a-url')).toBeNull();
  });
});
```

- [ ] **Step 2: Implement room.ts**

```typescript
// src/lib/sync/room.ts
const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 30 chars, no 0/O/1/I/L
const MAX_UNBIASED = Math.floor(256 / CHARS.length) * CHARS.length; // 240

export function generateRoomCode(): string {
  // Rejection sampling to avoid modular bias
  const chars: string[] = [];
  while (chars.length < 8) {
    const bytes = crypto.getRandomValues(new Uint8Array(8 - chars.length));
    for (const b of bytes) {
      if (b < MAX_UNBIASED && chars.length < 8) {
        chars.push(CHARS[b % CHARS.length]);
      }
    }
  }
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

export function isValidRoomCode(code: string): boolean {
  const normalized = code.toUpperCase().replace(/-/g, '');
  if (normalized.length !== 8) return false;
  return [...normalized].every(c => CHARS.includes(c));
}

export function formatRoomCode(code: string): string {
  const normalized = code.toUpperCase().replace(/[^A-Z2-9]/g, '');
  if (normalized.length !== 8) return code.toUpperCase();
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

export function getRoomLink(roomCode: string): string {
  return `${window.location.origin}/join/${roomCode}`;
}

export function parseRoomCodeFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/^\/join\/([A-Za-z2-9-]+)$/);
    if (!match) return null;
    const code = formatRoomCode(match[1]);
    return isValidRoomCode(code) ? code : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Implement provider.ts**

```typescript
// src/lib/sync/provider.ts
import type * as Y from 'yjs';

export type SyncStatus = 'disconnected' | 'connecting' | 'connected' | 'offline';

export interface SyncProvider {
  connect(doc: Y.Doc, roomCode: string): void;
  disconnect(): void;
  readonly status: SyncStatus;
  onStatusChange(cb: (status: SyncStatus) => void): () => void;
}

export type ProviderType = 'partykit' | 'hocuspocus';

export interface SyncConfig {
  provider: ProviderType;
  serverUrl?: string; // required for hocuspocus
}

export function getSyncConfig(): SyncConfig {
  const raw = localStorage.getItem('libris_sync_config');
  if (!raw) return { provider: 'partykit' };
  try {
    return JSON.parse(raw);
  } catch {
    return { provider: 'partykit' };
  }
}

export function saveSyncConfig(config: SyncConfig): void {
  localStorage.setItem('libris_sync_config', JSON.stringify(config));
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- src/lib/sync/room.test.ts
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/room.ts src/lib/sync/room.test.ts src/lib/sync/provider.ts
git commit -m "feat: add room code generation and sync provider abstraction"
```

---

## Task 7: Sync Provider Implementations (PartyKit + Hocuspocus)

**Files:**
- Create: `src/lib/sync/partykit.ts`
- Create: `src/lib/sync/hocuspocus.ts`

- [ ] **Step 1: Install sync provider packages**

```bash
npm install y-partykit @hocuspocus/provider
```

- [ ] **Step 2: Implement PartyKit provider**

```typescript
// src/lib/sync/partykit.ts
import type * as Y from 'yjs';
import type { SyncProvider, SyncStatus } from './provider';

const PARTYKIT_HOST = 'libris-sync.username.partykit.dev'; // TODO: replace with actual PartyKit project URL

export function createPartyKitProvider(): SyncProvider {
  let provider: any = null;
  let currentStatus: SyncStatus = 'disconnected';
  const listeners = new Set<(status: SyncStatus) => void>();

  function setStatus(status: SyncStatus) {
    currentStatus = status;
    listeners.forEach(cb => cb(status));
  }

  return {
    connect(doc: Y.Doc, roomCode: string) {
      if (!navigator.onLine) {
        setStatus('offline');
        window.addEventListener('online', () => this.connect(doc, roomCode), { once: true });
        return;
      }

      setStatus('connecting');

      import('y-partykit/provider').then(({ WebsocketProvider }) => {
        provider = new WebsocketProvider(PARTYKIT_HOST, roomCode, doc, {
          connect: true,
        });

        provider.on('sync', (synced: boolean) => {
          if (synced) setStatus('connected');
        });

        provider.on('connection-close', () => {
          setStatus(navigator.onLine ? 'connecting' : 'offline');
        });

        provider.on('connection-error', () => {
          setStatus('disconnected');
        });
      }).catch(() => {
        setStatus('disconnected');
      });
    },

    disconnect() {
      provider?.destroy();
      provider = null;
      setStatus('disconnected');
    },

    get status() { return currentStatus; },

    onStatusChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    }
  };
}
```

- [ ] **Step 3: Implement Hocuspocus provider**

```typescript
// src/lib/sync/hocuspocus.ts
import type * as Y from 'yjs';
import type { SyncProvider, SyncStatus } from './provider';

export function createHocuspocusProvider(serverUrl: string): SyncProvider {
  let provider: any = null;
  let currentStatus: SyncStatus = 'disconnected';
  const listeners = new Set<(status: SyncStatus) => void>();

  function setStatus(status: SyncStatus) {
    currentStatus = status;
    listeners.forEach(cb => cb(status));
  }

  return {
    connect(doc: Y.Doc, roomCode: string) {
      if (!navigator.onLine) {
        setStatus('offline');
        window.addEventListener('online', () => this.connect(doc, roomCode), { once: true });
        return;
      }

      setStatus('connecting');

      import('@hocuspocus/provider').then(({ HocuspocusProvider }) => {
        provider = new HocuspocusProvider({
          url: serverUrl,
          name: roomCode,
          document: doc,
          onSynced() { setStatus('connected'); },
          onClose() { setStatus(navigator.onLine ? 'connecting' : 'offline'); },
          onDisconnect() { setStatus(navigator.onLine ? 'connecting' : 'offline'); },
        });
      }).catch(() => {
        setStatus('disconnected');
      });
    },

    disconnect() {
      provider?.destroy();
      provider = null;
      setStatus('disconnected');
    },

    get status() { return currentStatus; },

    onStatusChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    }
  };
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/sync/partykit.ts src/lib/sync/hocuspocus.ts package.json package-lock.json
git commit -m "feat: add PartyKit and Hocuspocus sync provider implementations"
```

---

## Task 8: App Initialization & Layout Integration

**Files:**
- Modify: `src/routes/+layout.svelte`
- Modify: `src/lib/i18n/en.ts`
- Modify: `src/lib/i18n/id.ts`

- [ ] **Step 1: Update +layout.svelte**

Add Y.Doc initialization, migration check, and sync connection on app start.

Key changes:
- Import `initDoc` from `db/index.ts`
- Call `migrateFromDexie()` after doc init
- Check `meta.roomCode` and connect sync provider if present
- Check `shouldCleanupDexie()` and cleanup if 90 days passed
- Wrap app content in `{#if initialized}` gate

- [ ] **Step 2: Add i18n keys for sync**

Add all sync-related keys from the spec (Section 7) to both `en.ts` and `id.ts`. Remove old `settings.sync_*` keys.

- [ ] **Step 3: Run type check**

```bash
npm run check
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/+layout.svelte src/lib/i18n/en.ts src/lib/i18n/id.ts
git commit -m "feat: add app initialization with Y.Doc, migration, and sync bootstrap"
```

---

## Task 9: Update All Page Components

**Files:** All `+page.svelte` files under `src/routes/`

Each page component switches from `onMount` async loading to reactive `liveQuery` stores.

- [ ] **Step 1: Update Library page (`src/routes/+page.svelte`)**

- Replace `onMount + afterNavigate` data loading with `liveQuery`
- Remove `loading` state for CRDT data
- Keep search debounce logic but operate on reactive data

- [ ] **Step 2: Update Mine page (`src/routes/mine/+page.svelte`)**

- Use `liveQuery('userBookData')` with `$derived` filters for status tabs
- Book enrichment (fetching book details for each userBookData entry) uses synchronous `getBookById()`

- [ ] **Step 3: Update Browse page (`src/routes/browse/+page.svelte`)**

- Derive categories, series, authors from `liveQuery('books')` and `liveQuery('series')`
- Remove `onMount` async loading

- [ ] **Step 4: Update Browse subpages**

- `browse/category/[name]/+page.svelte` → `filter('books', b => b.categories.includes(name))`
- `browse/author/[name]/+page.svelte` → `filter('books', b => b.authors.includes(name))`
- `browse/series/[id]/+page.svelte` → `filter('books', b => b.seriesId === id)`

- [ ] **Step 5: Update Shelves page (`src/routes/shelves/+page.svelte`)**

- Use `liveQuery('shelves')` filtered by current user
- Book enrichment via synchronous `getBookById()`

- [ ] **Step 6: Update Stats page (`src/routes/stats/+page.svelte`)**

- `getReadingStats()` is now synchronous — call directly, no loading state needed for stats data
- Keep loading state for recommendations (still async API call)

- [ ] **Step 7: Update Book detail page (`src/routes/book/[id]/+page.svelte`)**

- Use `liveItem('books', id)` for reactive book data
- `getUserBookData()` is now synchronous
- Cover image: use `onMount` to async-load `getCoverBase64(bookId)` from coverCache. If found, display it. Otherwise fall back to `coverUrl`. This is the one place where async loading is still needed for CRDT data — covers are intentionally outside the CRDT.

```svelte
<!-- Cover loading pattern -->
let coverSrc = $state<string | null>(null);
onMount(async () => {
  const base64 = await getCoverBase64(book.id);
  coverSrc = base64 || book.coverUrl || null;
});
```

- [ ] **Step 8: Update Add book page (`src/routes/add/+page.svelte`)**

- `addBook()` is now synchronous — remove `await`
- `hasBookWithISBN()` is now synchronous
- Keep `async` for OpenLibrary search and barcode scan (external API calls)

- [ ] **Step 9: Update Settings page (`src/routes/settings/+page.svelte`)**

- Replace old CouchDB sync UI with new Room-based sync UI
- Add Create Room / Join Room / Leave Room flows
- Add provider selection (PartyKit / Self-hosted)
- Add status indicator (connected/connecting/disconnected/offline)
- Keep export/import/goodreads sections (updated for new backup service)

- [ ] **Step 10: Create Join Room route (`src/routes/join/[code]/+page.svelte`)**

Handles shareable links like `https://libris.app/join/ABCD-EF23`. On load:
1. Parse room code from URL params
2. Validate with `isValidRoomCode()`
3. If valid, trigger join room flow (same as Settings "Join Room")
4. Redirect to `/settings` after joining (or show error if invalid code)

```svelte
<script>
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { isValidRoomCode, formatRoomCode } from '$lib/sync/room';
  import { onMount } from 'svelte';

  onMount(() => {
    const code = formatRoomCode(page.params.code);
    if (!isValidRoomCode(code)) {
      goto('/settings');
      return;
    }
    // Store pending join code, Settings page will pick it up
    sessionStorage.setItem('libris_pending_join', code);
    goto('/settings');
  });
</script>
```

- [ ] **Step 11: Run type check and build**

```bash
npm run check && npm run build
```

Expected: 0 errors, build succeeds.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: update all page components to use reactive Yjs data"
```

---

## Task 10: Update Tests & Final Verification

**Files:**
- Modify: `src/lib/services/books.test.ts`
- Modify: `e2e/app.spec.ts` (if needed)

- [ ] **Step 1: Update unit tests**

Rewrite `books.test.ts` to use Y.Doc instead of Dexie/fake-indexeddb. Adjust for:
- Synchronous API (remove `await` on service calls)
- No `coverBlob` field
- ISO string dates instead of Date objects
- Fresh Y.Doc per test (instead of `db.books.clear()`)

- [ ] **Step 2: Run all unit tests**

```bash
npm test
```

Expected: All tests PASS.

- [ ] **Step 3: Run type check**

```bash
npm run check
```

Expected: 0 errors.

- [ ] **Step 4: Run production build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 5: Run E2E tests (if configured)**

```bash
npm run test:e2e
```

Expected: Tests pass (or document any failures that need adjustment).

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "test: update all tests for Yjs CRDT migration"
```

---

## Task Order & Dependencies

```
Task 1 (types + deps)
  └→ Task 2 (Y.Doc + query helpers)
      └→ Task 3 (reactive layer)  ← depends on query.ts exports
          └→ Task 4 (rewrite services)  ← largest task
              ├→ Task 5 (migration)  ← depends on query helpers + coverCache from Task 4
              └→ Task 6 (room codes + provider interface)  ← independent of migration
                  └→ Task 7 (sync implementations)
      └─────────────────────────────────────────┘
                      └→ Task 8 (app init + layout)  ← needs Tasks 5 + 7
                          └→ Task 9 (update pages + join route)
                              └→ Task 10 (tests + verification)
```

Tasks 5 and 6+7 can be done in parallel (both depend on Task 4, neither depends on the other). All other tasks are sequential.
