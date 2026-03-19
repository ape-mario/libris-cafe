export interface QueueEntry {
  id: string;
  type: 'transaction' | 'stock_adjustment';
  payload: Record<string, unknown>;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  retries: number;
  error: string | null;
  created_at: string;
  synced_at: string | null;
}

export class OfflineQueue {
  private dbName: string;
  private db: IDBDatabase | null = null;
  private static STORE = 'queue';

  constructor(dbName = 'libris-cafe-queue') {
    this.dbName = dbName;
  }

  private open(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(OfflineQueue.STORE)) {
          const store = db.createObjectStore(OfflineQueue.STORE, { keyPath: 'id' });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('created_at', 'created_at', { unique: false });
        }
      };
      req.onsuccess = () => { this.db = req.result; resolve(this.db); };
      req.onerror = () => reject(req.error);
    });
  }

  async enqueue(type: QueueEntry['type'], payload: Record<string, unknown>): Promise<string> {
    const count = await this.getCount();
    if (count >= OfflineQueue.MAX_QUEUE_SIZE) {
      throw new Error(`Offline queue is full (${OfflineQueue.MAX_QUEUE_SIZE} items). Please connect to internet to sync.`);
    }
    const db = await this.open();
    const entry: QueueEntry = {
      id: crypto.randomUUID(),
      type, payload,
      status: 'pending',
      retries: 0,
      error: null,
      created_at: new Date().toISOString(),
      synced_at: null,
    };
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OfflineQueue.STORE, 'readwrite');
      tx.objectStore(OfflineQueue.STORE).put(entry);
      tx.oncomplete = () => {
        // Track in localStorage as backup manifest
        try {
          const manifest = JSON.parse(localStorage.getItem('libris_queue_manifest') ?? '[]');
          manifest.push(entry.id);
          localStorage.setItem('libris_queue_manifest', JSON.stringify(manifest));
        } catch {}
        resolve(entry.id);
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  async getPending(): Promise<QueueEntry[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OfflineQueue.STORE, 'readonly');
      const req = tx.objectStore(OfflineQueue.STORE).index('created_at').getAll();
      req.onsuccess = () => {
        resolve((req.result as QueueEntry[]).filter(e => e.status === 'pending' || e.status === 'failed'));
      };
      req.onerror = () => reject(req.error);
    });
  }

  async markSynced(id: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OfflineQueue.STORE, 'readwrite');
      const store = tx.objectStore(OfflineQueue.STORE);
      const req = store.get(id);
      req.onsuccess = () => {
        const entry = req.result as QueueEntry;
        if (entry) { entry.status = 'synced'; entry.synced_at = new Date().toISOString(); store.put(entry); }
        tx.oncomplete = () => {
          // Remove from localStorage backup manifest
          try {
            const manifest = JSON.parse(localStorage.getItem('libris_queue_manifest') ?? '[]');
            localStorage.setItem('libris_queue_manifest', JSON.stringify(manifest.filter((mid: string) => mid !== id)));
          } catch {}
          resolve();
        };
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  async markFailed(id: string, error: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OfflineQueue.STORE, 'readwrite');
      const store = tx.objectStore(OfflineQueue.STORE);
      const req = store.get(id);
      req.onsuccess = () => {
        const entry = req.result as QueueEntry;
        if (entry) { entry.status = 'failed'; entry.retries += 1; entry.error = error; store.put(entry); }
        tx.oncomplete = () => resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  async getCount(): Promise<number> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OfflineQueue.STORE, 'readonly');
      const index = tx.objectStore(OfflineQueue.STORE).index('status');
      let count = 0;
      const r1 = index.count(IDBKeyRange.only('pending'));
      r1.onsuccess = () => {
        count += r1.result;
        const r2 = index.count(IDBKeyRange.only('failed'));
        r2.onsuccess = () => resolve(count + r2.result);
        r2.onerror = () => reject(r2.error);
      };
      r1.onerror = () => reject(r1.error);
    });
  }

  /**
   * Purge synced entries older than the given age (default: 24 hours).
   * Call periodically to prevent IndexedDB growth.
   */
  async purgeSynced(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    const db = await this.open();
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    let purged = 0;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(OfflineQueue.STORE, 'readwrite');
      const store = tx.objectStore(OfflineQueue.STORE);
      const req = store.openCursor();

      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          const entry = cursor.value as QueueEntry;
          if (entry.status === 'synced' && entry.synced_at && entry.synced_at < cutoff) {
            cursor.delete();
            purged++;
          }
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve(purged);
      tx.onerror = () => reject(tx.error);
    });
  }

  async detectLostEntries(): Promise<string[]> {
    try {
      const manifest = JSON.parse(localStorage.getItem('libris_queue_manifest') ?? '[]') as string[];
      if (manifest.length === 0) return [];
      const pending = await this.getPending();
      const pendingIds = new Set(pending.map(e => e.id));
      return manifest.filter(id => !pendingIds.has(id));
    } catch {
      return [];
    }
  }

  static readonly MAX_QUEUE_SIZE = 500;
}
