import { q, type ReadingGoal } from '$lib/db';

export function getGoal(userId: string, year: number = new Date().getFullYear()): ReadingGoal | null {
	const goal = q.getItem('goals', `${userId}:${year}`) as ReadingGoal | undefined;
	return goal || null;
}

export function setGoal(userId: string, target: number, year: number = new Date().getFullYear()): void {
	q.setItem('goals', `${userId}:${year}`, { userId, year, target });
}

export function removeGoal(userId: string, year: number = new Date().getFullYear()): void {
	q.deleteItem('goals', `${userId}:${year}`);
}

export function getBooksReadThisYear(userId: string): number {
	const year = new Date().getFullYear();
	const allBooks = q.getAll('books') as unknown as { id: string; dateAdded: string }[];
	const userData = q.filter(
		'userBookData',
		(d) => d.userId === userId
	) as unknown as { bookId: string; status: string }[];

	const readBookIds = new Set(
		userData.filter((d) => d.status === 'read').map((d) => d.bookId)
	);

	return allBooks.filter((b) => {
		if (!readBookIds.has(b.id)) return false;
		const added = new Date(b.dateAdded);
		return added.getFullYear() === year;
	}).length;
}
