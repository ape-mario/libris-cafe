import { q, type Book } from '$lib/db';
import { removeBookFromAllShelves } from './shelves';

type NewBook = Pick<Book, 'title' | 'authors' | 'categories'> &
	Partial<Pick<Book, 'isbn' | 'coverUrl' | 'publisher' | 'publishYear' | 'edition' | 'seriesId' | 'seriesOrder'>>;

export function hasBookWithISBN(isbn: string): boolean {
	return q.filter<Book>('books', (b) => b.isbn === isbn).length > 0;
}

function normalizeTitle(title: string): string {
	return title.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
}

export function findSimilarBooks(title: string): Book[] {
	const normalized = normalizeTitle(title);
	if (!normalized) return [];
	return q.filter<Book>('books', (b) => normalizeTitle(b.title) === normalized);
}

export function addBook(data: NewBook, allowDuplicate = false): Book | null {
	if (!allowDuplicate) {
		if (data.isbn && hasBookWithISBN(data.isbn)) return null;
		if (findSimilarBooks(data.title).length > 0) return null;
	}

	const book: Book = {
		id: crypto.randomUUID(),
		title: data.title,
		authors: data.authors,
		isbn: data.isbn,
		coverUrl: data.coverUrl,
		categories: data.categories,
		publisher: data.publisher,
		publishYear: data.publishYear,
		edition: data.edition,
		seriesId: data.seriesId,
		seriesOrder: data.seriesOrder,
		dateAdded: new Date().toISOString(),
		dateModified: new Date().toISOString()
	};

	q.setItem('books', book.id, book);
	return book;
}

export function updateBook(id: string, data: Partial<Omit<Book, 'id'>>): void {
	q.updateItem('books', id, {
		...data,
		dateModified: new Date().toISOString()
	});
}

export function deleteBook(id: string): void {
	const ubds = q.filter<{ userId: string; bookId: string }>('userBookData', (d) => d.bookId === id);
	for (const ubd of ubds) {
		q.deleteItem('userBookData', `${ubd.userId}:${ubd.bookId}`);
	}
	removeBookFromAllShelves(id);
	deleteCoverFromCache(id);
	q.deleteItem('books', id);
}

export function getBookById(id: string): Book | undefined {
	return q.getItem<Book>('books', id);
}

export function getBooks(): Book[] {
	return q.getAll<Book>('books').sort(
		(a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime()
	);
}

// Search cache: invalidated when books map changes
let searchCache: { books: Book[]; index: Map<string, Set<string>> } | null = null;

function getSearchIndex(): { books: Book[]; index: Map<string, Set<string>> } {
	const allBooks = q.getAll<Book>('books');
	// Simple cache: reuse if book count hasn't changed (cheap check)
	if (searchCache && searchCache.books.length === allBooks.length) {
		return searchCache;
	}

	// Build index: map of lowercase tokens → set of book IDs
	const index = new Map<string, Set<string>>();
	for (const book of allBooks) {
		const tokens = [
			...book.title.toLowerCase().split(/\s+/),
			...(book.authors || []).flatMap((a) => a.toLowerCase().split(/\s+/)),
			...(book.publisher?.toLowerCase().split(/\s+/) || []),
			...(book.isbn ? [book.isbn.toLowerCase()] : [])
		].filter(Boolean);

		for (const token of tokens) {
			// Index all prefixes (min 2 chars) for prefix matching
			for (let len = 2; len <= token.length; len++) {
				const prefix = token.slice(0, len);
				if (!index.has(prefix)) index.set(prefix, new Set());
				index.get(prefix)!.add(book.id);
			}
		}
	}

	searchCache = { books: allBooks, index };
	return searchCache;
}

// Invalidate on Y.Doc changes (lazy init to avoid test module load issues)
let searchObserverSet = false;
function ensureSearchObserver() {
	if (searchObserverSet) return;
	searchObserverSet = true;
	try { q.observe('books', () => { searchCache = null; }); } catch {}
}

export function searchBooks(query: string): Book[] {
	ensureSearchObserver();
	const lower = query.toLowerCase().trim();
	if (!lower) return getBooks();

	const words = lower.split(/\s+/).filter((w) => w.length >= 2);
	if (words.length === 0) {
		// Single char: fall back to simple includes
		return q.filter<Book>('books', (b) =>
			b.title.toLowerCase().includes(lower) ||
			b.authors.some((a) => a.toLowerCase().includes(lower))
		);
	}

	const { books, index } = getSearchIndex();
	const bookMap = new Map(books.map((b) => [b.id, b]));

	// Intersect: all words must match
	let resultIds: Set<string> | null = null;
	for (const word of words) {
		const matches = index.get(word);
		if (!matches) return [];
		if (resultIds === null) {
			resultIds = new Set(matches);
		} else {
			for (const id of resultIds) {
				if (!matches.has(id)) resultIds.delete(id);
			}
		}
	}

	return resultIds ? [...resultIds].map((id) => bookMap.get(id)!).filter(Boolean) : [];
}

export function getBooksByCategory(category: string): Book[] {
	return q.filter<Book>('books', (b) =>
		Array.isArray(b.categories) && b.categories.includes(category)
	);
}

export function getBooksBySeries(seriesId: string): Book[] {
	return q.filter<Book>('books', (b) => b.seriesId === seriesId)
		.sort((a, b) => (a.seriesOrder ?? 0) - (b.seriesOrder ?? 0));
}

async function deleteCoverFromCache(bookId: string) {
	const { deleteCoverBase64 } = await import('./coverCache');
	await deleteCoverBase64(bookId);
}
