import { q, type Book, type UserBookData } from '$lib/db';

export interface ReadingStats {
	totalBooks: number;
	totalRead: number;
	totalReading: number;
	totalDnf: number;
	totalWishlist: number;
	averageRating: number;
	ratingDistribution: number[];
	booksPerMonth: { month: string; count: number }[];
	genreBreakdown: { name: string; count: number }[];
	topAuthors: { name: string; count: number }[];
	totalPages: number;
}

export function getReadingStats(userId: string): ReadingStats {
	const allBooks = q.getAll<Book>('books');
	const userData = q.filter<UserBookData>('userBookData', (d) => d.userId === userId);

	const userBookIds = new Set(userData.map((d) => d.bookId));
	const userBooks = allBooks.filter((b) => userBookIds.has(b.id));

	const totalRead = userData.filter((d) => d.status === 'read').length;
	const totalReading = userData.filter((d) => d.status === 'reading').length;
	const totalDnf = userData.filter((d) => d.status === 'dnf').length;
	const totalWishlist = userData.filter((d) => d.isWishlist).length;

	const rated = userData.filter((d) => d.rating && d.rating > 0);
	const averageRating =
		rated.length > 0 ? rated.reduce((sum, d) => sum + (d.rating || 0), 0) / rated.length : 0;

	const ratingDistribution = [0, 0, 0, 0, 0];
	for (const d of rated) {
		if (d.rating && d.rating >= 1 && d.rating <= 5) {
			ratingDistribution[d.rating - 1]++;
		}
	}

	const now = new Date();
	const booksPerMonth: { month: string; count: number }[] = [];
	for (let i = 11; i >= 0; i--) {
		const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
		const label = d.toLocaleDateString('en', { month: 'short', year: '2-digit' });

		const count = userBooks.filter((book) => {
			const added = new Date(book.dateAdded);
			const sameMonth =
				added.getFullYear() === d.getFullYear() && added.getMonth() === d.getMonth();
			if (!sameMonth) return false;
			const ud = userData.find((u) => u.bookId === book.id);
			return ud?.status === 'read';
		}).length;

		booksPerMonth.push({ month: label, count });
	}

	const genreMap = new Map<string, number>();
	for (const book of userBooks) {
		for (const cat of book.categories || []) {
			genreMap.set(cat, (genreMap.get(cat) || 0) + 1);
		}
	}
	const genreBreakdown = [...genreMap.entries()]
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => b.count - a.count)
		.slice(0, 8);

	const authorMap = new Map<string, number>();
	for (const book of userBooks) {
		for (const author of book.authors || []) {
			authorMap.set(author, (authorMap.get(author) || 0) + 1);
		}
	}
	const topAuthors = [...authorMap.entries()]
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => b.count - a.count)
		.slice(0, 6);

	const totalPages = userData
		.filter((d) => d.status === 'read' && d.totalPages)
		.reduce((sum, d) => sum + (d.totalPages || 0), 0);

	return {
		totalBooks: userBooks.length,
		totalRead,
		totalReading,
		totalDnf,
		totalWishlist,
		averageRating,
		ratingDistribution,
		booksPerMonth,
		genreBreakdown,
		topAuthors,
		totalPages
	};
}
