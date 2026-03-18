import { db, type UserBookData } from '$lib/db';

export async function getUserBookData(userId: string, bookId: string): Promise<UserBookData | null> {
  const data = await db.userBookData.where({ userId, bookId }).first();
  return data || null;
}

export async function setUserBookData(
  userId: string,
  bookId: string,
  updates: Partial<Pick<UserBookData, 'status' | 'rating' | 'notes' | 'lentTo' | 'lentDate' | 'isWishlist' | 'currentPage' | 'totalPages'>>
): Promise<UserBookData> {
  const existing = await db.userBookData.where({ userId, bookId }).first();

  if (existing) {
    await db.userBookData.update(existing.id, updates);
    return { ...existing, ...updates };
  }

  const data: UserBookData = {
    id: crypto.randomUUID(),
    userId,
    bookId,
    status: 'unread',
    isWishlist: false,
    ...updates
  };
  await db.userBookData.add(data);
  return data;
}

export async function getUserBooks(userId: string, filter?: { status?: string; isWishlist?: boolean }): Promise<UserBookData[]> {
  let collection = db.userBookData.where('userId').equals(userId);
  let results = await collection.toArray();

  if (filter?.status) {
    results = results.filter((d) => d.status === filter.status);
  }
  if (filter?.isWishlist !== undefined) {
    results = results.filter((d) => d.isWishlist === filter.isWishlist);
  }
  return results;
}

export async function getLentBooks(userId: string): Promise<UserBookData[]> {
  const all = await db.userBookData.where('userId').equals(userId).toArray();
  return all.filter((d) => d.lentTo);
}
