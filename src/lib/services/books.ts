import { q, type Book } from '$lib/db';
import { removeBookFromAllShelves } from './shelves';

type NewBook = Pick<Book, 'title' | 'authors' | 'categories'> &
	Partial<Pick<Book, 'isbn' | 'coverUrl' | 'seriesId' | 'seriesOrder'>>;

export function hasBookWithISBN(isbn: string): boolean {
	return q.filter<Book>('books', (b) => b.isbn === isbn).length > 0;
}

export function addBook(data: NewBook, allowDuplicate = false): Book | null {
	if (data.isbn && !allowDuplicate) {
		if (hasBookWithISBN(data.isbn)) return null;
	}

	const book: Book = {
		id: crypto.randomUUID(),
		title: data.title,
		authors: data.authors,
		isbn: data.isbn,
		coverUrl: data.coverUrl,
		categories: data.categories,
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

export function searchBooks(query: string): Book[] {
	const lower = query.toLowerCase();
	return q.filter<Book>('books', (b) =>
		b.title.toLowerCase().includes(lower) ||
		b.authors.some((a) => a.toLowerCase().includes(lower))
	);
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
	try {
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const req = indexedDB.open('libris-covers', 1);
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
		const tx = db.transaction('covers', 'readwrite');
		tx.objectStore('covers').delete(bookId);
	} catch {
		// Cover cleanup is best-effort
	}
}
