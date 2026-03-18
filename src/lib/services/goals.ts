import { q, type ReadingGoal } from '$lib/db';

export function getGoal(userId: string, year: number = new Date().getFullYear()): ReadingGoal | null {
	return q.getItem<ReadingGoal>('goals', `${userId}:${year}`) ?? null;
}

export function setGoal(userId: string, target: number, year: number = new Date().getFullYear()): void {
	q.setItem('goals', `${userId}:${year}`, { userId, year, target });
}

export function removeGoal(userId: string, year: number = new Date().getFullYear()): void {
	q.deleteItem('goals', `${userId}:${year}`);
}

export function getBooksReadThisYear(userId: string): number {
	const year = new Date().getFullYear();
	const allBooks = q.getAll<{ id: string; dateAdded: string }>('books');
	const userData = q.filter<{ userId: string; bookId: string; status: string }>('userBookData', (d) => d.userId === userId);

	const readBookIds = new Set(
		userData.filter((d) => d.status === 'read').map((d) => d.bookId)
	);

	return allBooks.filter((b) => {
		if (!readBookIds.has(b.id)) return false;
		return new Date(b.dateAdded).getFullYear() === year;
	}).length;
}
