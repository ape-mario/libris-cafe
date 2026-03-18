import { q, type Book } from '$lib/db';

const COVER_DB_NAME = 'libris-covers';
const COVER_STORE = 'covers';
const MAX_CACHE_SIZE_MB = 50;

function openCoverDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(COVER_DB_NAME, 1);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(COVER_STORE)) {
				db.createObjectStore(COVER_STORE);
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

export async function setCoverBase64(bookId: string, base64: string): Promise<void> {
	if (await isCacheOverLimit()) {
		console.warn('[Libris] Cover cache size limit reached, skipping cache for', bookId);
		return;
	}
	const db = await openCoverDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(COVER_STORE, 'readwrite');
		tx.objectStore(COVER_STORE).put(base64, bookId);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

export async function getCoverBase64(bookId: string): Promise<string | null> {
	try {
		const db = await openCoverDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(COVER_STORE, 'readonly');
			const request = tx.objectStore(COVER_STORE).get(bookId);
			request.onsuccess = () => resolve(request.result || null);
			request.onerror = () => reject(request.error);
		});
	} catch {
		return null;
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

	for (const book of uncached) {
		if (await isCacheOverLimit()) break;
		const existing = await getCoverBase64(book.id);
		if (existing) continue;
		await cacheCoverIfNeeded(book.id);
		await new Promise((r) => setTimeout(r, 200));
	}
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
