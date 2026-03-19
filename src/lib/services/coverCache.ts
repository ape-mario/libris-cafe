import { q, type Book } from '$lib/db';

const COVER_DB_NAME = 'libris-covers';
const COVER_STORE = 'covers';
const META_STORE = 'meta';
const MAX_CACHE_SIZE_MB = 50;
const EVICT_BATCH = 20;

function openCoverDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(COVER_DB_NAME, 2);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(COVER_STORE)) {
				db.createObjectStore(COVER_STORE);
			}
			if (!db.objectStoreNames.contains(META_STORE)) {
				db.createObjectStore(META_STORE);
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

async function touchAccess(db: IDBDatabase, bookId: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const tx = db.transaction(META_STORE, 'readwrite');
		tx.objectStore(META_STORE).put(Date.now(), bookId);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

async function evictOldest(db: IDBDatabase): Promise<void> {
	// Get all access timestamps
	const entries: { id: string; time: number }[] = await new Promise((resolve, reject) => {
		const tx = db.transaction(META_STORE, 'readonly');
		const store = tx.objectStore(META_STORE);
		const request = store.openCursor();
		const results: { id: string; time: number }[] = [];
		request.onsuccess = () => {
			const cursor = request.result;
			if (cursor) {
				results.push({ id: cursor.key as string, time: cursor.value as number });
				cursor.continue();
			} else {
				resolve(results);
			}
		};
		request.onerror = () => reject(request.error);
	});

	// Sort by oldest access time, take EVICT_BATCH
	entries.sort((a, b) => a.time - b.time);
	const toEvict = entries.slice(0, EVICT_BATCH);

	if (toEvict.length === 0) return;

	const tx = db.transaction([COVER_STORE, META_STORE], 'readwrite');
	for (const entry of toEvict) {
		tx.objectStore(COVER_STORE).delete(entry.id);
		tx.objectStore(META_STORE).delete(entry.id);
	}
	await new Promise<void>((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

export async function setCoverBase64(bookId: string, base64: string): Promise<void> {
	const db = await openCoverDB();

	if (await isCacheOverLimit()) {
		await evictOldest(db);
	}

	return new Promise((resolve, reject) => {
		const tx = db.transaction([COVER_STORE, META_STORE], 'readwrite');
		tx.objectStore(COVER_STORE).put(base64, bookId);
		tx.objectStore(META_STORE).put(Date.now(), bookId);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

export async function getCoverBase64(bookId: string): Promise<string | null> {
	try {
		const db = await openCoverDB();
		const result: string | null = await new Promise((resolve, reject) => {
			const tx = db.transaction(COVER_STORE, 'readonly');
			const request = tx.objectStore(COVER_STORE).get(bookId);
			request.onsuccess = () => resolve(request.result || null);
			request.onerror = () => reject(request.error);
		});
		// Update access time in background
		if (result) touchAccess(db, bookId).catch(() => {});
		return result;
	} catch {
		return null;
	}
}

export async function deleteCoverBase64(bookId: string): Promise<void> {
	try {
		const db = await openCoverDB();
		const tx = db.transaction([COVER_STORE, META_STORE], 'readwrite');
		tx.objectStore(COVER_STORE).delete(bookId);
		tx.objectStore(META_STORE).delete(bookId);
		await new Promise<void>((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	} catch {
		// Best-effort cleanup
	}
}

export async function cacheCoverIfNeeded(bookId: string): Promise<void> {
	const book = q.getItem<Book>('books', bookId);
	if (!book || !book.coverUrl) return;

	const existing = await getCoverBase64(bookId);
	if (existing) return;

	try {
		const res = await fetch(book.coverUrl);
		if (!res.ok) return;

		const blob = await res.blob();
		if (blob.size < 1000) return;

		const base64 = await blobToBase64(blob);
		await setCoverBase64(bookId, base64);
	} catch {
		// Network error — skip silently
	}
}

export async function cacheAllCovers(): Promise<void> {
	const allBooks = q.getAll<Book>('books');
	const uncached = allBooks.filter((b) => !!b.coverUrl);

	const CONCURRENCY = 3;
	let index = 0;

	async function worker(): Promise<void> {
		while (index < uncached.length) {
			const book = uncached[index++];
			const existing = await getCoverBase64(book.id);
			if (existing) continue;
			await cacheCoverIfNeeded(book.id);
		}
	}

	const workers = Array.from({ length: Math.min(CONCURRENCY, uncached.length) }, () => worker());
	await Promise.all(workers);
}

export async function clearCoverCache(): Promise<void> {
	const db = await openCoverDB();
	await Promise.all([COVER_STORE, META_STORE].map(store =>
		new Promise<void>((resolve, reject) => {
			const tx = db.transaction(store, 'readwrite');
			tx.objectStore(store).clear();
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		})
	));
}

async function isCacheOverLimit(): Promise<boolean> {
	try {
		if (!navigator.storage?.estimate) return false;
		const estimate = await navigator.storage.estimate();
		const usedMB = (estimate.usage || 0) / (1024 * 1024);
		return usedMB > MAX_CACHE_SIZE_MB;
	} catch {
		return false;
	}
}

function blobToBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => resolve(reader.result as string);
		reader.onerror = reject;
		reader.readAsDataURL(blob);
	});
}
