import { db } from '$lib/db';

/**
 * If a book has a coverUrl but no coverBlob, fetch and cache it locally.
 * Call this when viewing a book to progressively cache covers for offline use.
 */
export async function cacheCoverIfNeeded(bookId: string): Promise<void> {
  const book = await db.books.get(bookId);
  if (!book || !book.coverUrl || book.coverBlob) return;

  try {
    const res = await fetch(book.coverUrl);
    if (!res.ok) return;

    const blob = await res.blob();
    // Only cache if it's actually an image (Open Library returns 1x1 pixel for missing covers)
    if (blob.size < 1000) return;

    await db.books.update(bookId, { coverBlob: blob });
  } catch {
    // Network error — skip silently, will try again next view
  }
}

/**
 * Cache all uncached covers in the background.
 * Call once on app load for progressive offline support.
 */
export async function cacheAllCovers(): Promise<void> {
  const uncached = await db.books
    .filter(b => !!b.coverUrl && !b.coverBlob)
    .toArray();

  for (const book of uncached) {
    await cacheCoverIfNeeded(book.id);
    // Small delay to avoid hammering the network
    await new Promise(r => setTimeout(r, 200));
  }
}
