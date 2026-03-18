import { q, type Book } from '$lib/db';

interface GoodreadsRow {
	title: string;
	authors: string[];
	isbn: string | undefined;
	rating: number | undefined;
	shelves: string[];
	dateRead: string | undefined;
	dateAdded: string | undefined;
	numPages: number | undefined;
}

function parseCSV(text: string): Record<string, string>[] {
	const lines: string[] = [];
	let current = '';
	let inQuotes = false;

	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if (char === '"') {
			if (inQuotes && text[i + 1] === '"') {
				current += '"';
				i++;
			} else {
				inQuotes = !inQuotes;
			}
		} else if (char === '\n' && !inQuotes) {
			lines.push(current);
			current = '';
		} else if (char === '\r' && !inQuotes) {
			// skip
		} else {
			current += char;
		}
	}
	if (current) lines.push(current);

	if (lines.length < 2) return [];

	const headerLine = lines[0];
	const headers: string[] = [];
	let h = '';
	let hq = false;
	for (let i = 0; i < headerLine.length; i++) {
		const c = headerLine[i];
		if (c === '"') {
			hq = !hq;
		} else if (c === ',' && !hq) {
			headers.push(h.trim());
			h = '';
		} else {
			h += c;
		}
	}
	headers.push(h.trim());

	const rows: Record<string, string>[] = [];
	for (let l = 1; l < lines.length; l++) {
		const line = lines[l];
		if (!line.trim()) continue;
		const values: string[] = [];
		let v = '';
		let vq = false;
		for (let i = 0; i < line.length; i++) {
			const c = line[i];
			if (c === '"') {
				if (vq && line[i + 1] === '"') {
					v += '"';
					i++;
				} else {
					vq = !vq;
				}
			} else if (c === ',' && !vq) {
				values.push(v);
				v = '';
			} else {
				v += c;
			}
		}
		values.push(v);

		const row: Record<string, string> = {};
		for (let i = 0; i < headers.length; i++) {
			row[headers[i]] = values[i] || '';
		}
		rows.push(row);
	}
	return rows;
}

function parseGoodreadsRow(row: Record<string, string>): GoodreadsRow | null {
	const title = (row['Title'] || '').trim();
	if (!title) return null;

	const authorStr = (row['Author'] || row['Author l-f'] || '').trim();
	const additionalAuthors = (row['Additional Authors'] || '').trim();
	const authors = [authorStr, ...additionalAuthors.split(',').map((a) => a.trim())].filter(
		Boolean
	);

	let isbn = (row['ISBN13'] || row['ISBN'] || '').replace(/[="]/g, '').trim();
	if (!isbn || isbn === '') isbn = undefined as any;

	const rating = parseInt(row['My Rating'] || '0');
	const numPages = parseInt(row['Number of Pages'] || '0') || undefined;

	const shelves = (row['Bookshelves'] || row['Exclusive Shelf'] || '')
		.split(',')
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean);

	return {
		title,
		authors,
		isbn: isbn || undefined,
		rating: rating > 0 ? rating : undefined,
		shelves,
		dateRead: row['Date Read'] || undefined,
		dateAdded: row['Date Added'] || undefined,
		numPages
	};
}

function shelvesToStatus(shelves: string[]): 'unread' | 'reading' | 'read' | 'dnf' {
	if (shelves.includes('read')) return 'read';
	if (shelves.includes('currently-reading')) return 'reading';
	if (shelves.includes('did-not-finish') || shelves.includes('dnf')) return 'dnf';
	return 'unread';
}

function shelvesToCategories(shelves: string[]): string[] {
	const ignore = new Set(['read', 'currently-reading', 'to-read', 'did-not-finish', 'dnf']);
	return shelves.filter((s) => !ignore.has(s));
}

export function importGoodreadsCSV(csvText: string, userId: string): number {
	const rows = parseCSV(csvText);
	if (rows.length === 0) throw new Error('Empty or invalid CSV');

	let imported = 0;

	for (const row of rows) {
		const parsed = parseGoodreadsRow(row);
		if (!parsed) continue;

		// Check for duplicate by ISBN or title
		let existing: Book | undefined;
		if (parsed.isbn) {
			const matches = q.filter('books', (b) => b.isbn === parsed.isbn) as unknown as Book[];
			existing = matches[0];
		}
		if (!existing) {
			const titleLower = parsed.title.toLowerCase();
			const matches = q.filter(
				'books',
				(b) => (b.title as string).toLowerCase() === titleLower
			) as unknown as Book[];
			existing = matches[0];
		}

		let bookId: string;

		if (existing) {
			bookId = existing.id;
		} else {
			bookId = crypto.randomUUID();
			const coverUrl = parsed.isbn
				? `https://covers.openlibrary.org/b/isbn/${parsed.isbn}-M.jpg`
				: undefined;

			q.setItem('books', bookId, {
				id: bookId,
				title: parsed.title,
				authors: parsed.authors,
				isbn: parsed.isbn,
				coverUrl,
				categories: shelvesToCategories(parsed.shelves),
				dateAdded: parsed.dateAdded ? new Date(parsed.dateAdded).toISOString() : new Date().toISOString(),
				dateModified: new Date().toISOString()
			});
			imported++;
		}

		// Add user book data if not exists
		const key = `${userId}:${bookId}`;
		const existingData = q.getItem('userBookData', key);
		if (!existingData) {
			const status = shelvesToStatus(parsed.shelves);
			const isWishlist = parsed.shelves.includes('to-read');
			q.setItem('userBookData', key, {
				userId,
				bookId,
				status,
				rating: parsed.rating,
				isWishlist,
				totalPages: parsed.numPages
			});
		}
	}

	return imported;
}
