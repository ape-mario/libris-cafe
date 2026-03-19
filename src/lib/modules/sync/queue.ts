export interface QueueEntry {
  id: string;
  type: 'transaction' | 'stock_adjustment';
  payload: any;
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

  async enqueue(type: QueueEntry['type'], payload: any): Promise<string> {
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
      tx.oncomplete = () => resolve(entry.id);
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
        tx.oncomplete = () => resolve();
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
}
