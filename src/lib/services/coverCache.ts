import { q, type Book } from '$lib/db';

// Separate IndexedDB store for cover binary data (not synced via CRDT)
const COVER_DB_NAME = 'libris-covers';
const COVER_STORE = 'covers';

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
	const db = await openCoverDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(COVER_STORE, 'readwrite');
		tx.objectStore(COVER_STORE).put(base64, bookId);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

export async function getCoverBase64(bookId: string): Promise<string | null> {
	const db = await openCoverDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(COVER_STORE, 'readonly');
		const request = tx.objectStore(COVER_STORE).get(bookId);
		request.onsuccess = () => resolve(request.result || null);
		request.onerror = () => reject(request.error);
	});
}

/**
 * If a book has a coverUrl, fetch and cache it locally as base64.
 */
export async function cacheCoverIfNeeded(bookId: string): Promise<void> {
	const book = q.getItem('books', bookId) as Book | undefined;
	if (!book || !book.coverUrl) return;

	// Check if already cached
	const existing = await getCoverBase64(bookId);
	if (existing) return;

	try {
		const res = await fetch(book.coverUrl);
		if (!res.ok) return;

		const blob = await res.blob();
		// Only cache if it's actually an image (Open Library returns 1x1 pixel for missing covers)
		if (blob.size < 1000) return;

		const base64 = await blobToBase64(blob);
		await setCoverBase64(bookId, base64);
	} catch {
		// Network error — skip silently, will try again next view
	}
}

/**
 * Cache all uncached covers in the background.
 */
export async function cacheAllCovers(): Promise<void> {
	const allBooks = q.getAll('books') as unknown as Book[];
	const uncached = allBooks.filter((b) => !!b.coverUrl);

	for (const book of uncached) {
		const existing = await getCoverBase64(book.id);
		if (existing) continue;
		await cacheCoverIfNeeded(book.id);
		// Small delay to avoid hammering the network
		await new Promise((r) => setTimeout(r, 200));
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
