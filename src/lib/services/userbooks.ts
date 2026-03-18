import { q, type UserBookData } from '$lib/db';

export function getUserBookData(userId: string, bookId: string): UserBookData | null {
	const key = `${userId}:${bookId}`;
	return q.getItem<UserBookData>('userBookData', key) ?? null;
}

export function setUserBookData(
	userId: string,
	bookId: string,
	updates: Partial<
		Pick<
			UserBookData,
			'status' | 'rating' | 'notes' | 'lentTo' | 'lentDate' | 'isWishlist' | 'currentPage' | 'totalPages'
		>
	>
): UserBookData {
	const key = `${userId}:${bookId}`;
	const existing = q.getItem<UserBookData>('userBookData', key);

	if (existing) {
		q.updateItem('userBookData', key, updates);
		return { ...existing, ...updates };
	}

	const data: UserBookData = {
		userId,
		bookId,
		status: 'unread',
		isWishlist: false,
		...updates
	};
	q.setItem('userBookData', key, data);
	return data;
}

export function getUserBooks(
	userId: string,
	filter?: { status?: string; isWishlist?: boolean }
): UserBookData[] {
	let results = q.filter<UserBookData>('userBookData', (d) => d.userId === userId);

	if (filter?.status) {
		results = results.filter((d) => d.status === filter.status);
	}
	if (filter?.isWishlist !== undefined) {
		results = results.filter((d) => d.isWishlist === filter.isWishlist);
	}
	return results;
}

export function getLentBooks(userId: string): UserBookData[] {
	return q.filter<UserBookData>('userBookData', (d) => d.userId === userId && !!d.lentTo);
}
