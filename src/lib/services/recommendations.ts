import { q, type Book } from '$lib/db';

export interface Recommendation {
	title: string;
	authors: string[];
	coverUrl?: string;
	basedOn: string; // title of the book that triggered this recommendation
}

/**
 * Get book recommendations based on the user's library.
 * Uses Open Library's search by subject/author to find related books.
 */
export async function getRecommendations(limit: number = 6): Promise<Recommendation[]> {
	const books = q.getAll('books') as unknown as Book[];
	if (books.length === 0) return [];

	const existingTitles = new Set(books.map((b) => b.title.toLowerCase()));
	const existingIsbns = new Set(books.filter((b) => b.isbn).map((b) => b.isbn!));
	const recommendations: Recommendation[] = [];

	// Pick up to 3 random books with categories to base recommendations on
	const booksWithCats = books.filter((b) => b.categories.length > 0);
	const seedBooks = shuffle(booksWithCats.length > 0 ? booksWithCats : books).slice(0, 3);

	for (const seed of seedBooks) {
		if (recommendations.length >= limit) break;

		try {
			const searchQuery = seed.categories[0]
				? `subject:${seed.categories[0]}`
				: `author:${seed.authors[0] || ''}`;

			const res = await fetch(
				`https://openlibrary.org/search.json?q=${encodeURIComponent(searchQuery)}&limit=20&fields=title,author_name,isbn,cover_i`
			);
			if (!res.ok) continue;

			const data = await res.json();
			const docs = (data.docs || []) as any[];

			for (const doc of docs) {
				if (recommendations.length >= limit) break;

				const title = doc.title || '';
				if (!title) continue;

				if (existingTitles.has(title.toLowerCase())) continue;
				const isbn = doc.isbn?.[0];
				if (isbn && existingIsbns.has(isbn)) continue;
				if (recommendations.some((r) => r.title.toLowerCase() === title.toLowerCase())) continue;

				recommendations.push({
					title,
					authors: doc.author_name || [],
					coverUrl: doc.cover_i
						? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
						: undefined,
					basedOn: seed.title
				});
			}
		} catch {
			// Network error, skip silently
		}
	}

	return recommendations.slice(0, limit);
}

function shuffle<T>(arr: T[]): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}
