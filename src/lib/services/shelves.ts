import { doc, q, type Shelf } from '$lib/db';
import * as Y from 'yjs';

export function createShelf(userId: string, name: string): Shelf {
	const shelf: Shelf = {
		id: crypto.randomUUID(),
		userId,
		name,
		bookIds: [],
		dateCreated: new Date().toISOString()
	};
	q.setItem('shelves', shelf.id, shelf);
	return shelf;
}

export function getUserShelves(userId: string): Shelf[] {
	const shelves = q.filter<Shelf>('shelves', (s) => s.userId === userId);
	return shelves.sort((a, b) => a.name.localeCompare(b.name));
}

export function addBookToShelf(shelfId: string, bookId: string): void {
	const entry = q.getRawEntry('shelves', shelfId);
	if (!entry) return;

	doc.transact(() => {
		let bookIdsMap = entry.get('bookIds') as Y.Map<true> | undefined;
		if (!bookIdsMap || !(bookIdsMap instanceof Y.Map)) {
			bookIdsMap = new Y.Map<true>();
			entry.set('bookIds', bookIdsMap);
		}
		if (!bookIdsMap.has(bookId)) {
			bookIdsMap.set(bookId, true);
		}
	});
}

export function removeBookFromAllShelves(bookId: string): void {
	const shelvesMap = doc.getMap('shelves');
	doc.transact(() => {
		shelvesMap.forEach((value) => {
			if (!(value instanceof Y.Map)) return;
			const bookIdsMap = value.get('bookIds');
			if (bookIdsMap instanceof Y.Map && bookIdsMap.has(bookId)) {
				bookIdsMap.delete(bookId);
			}
		});
	});
}

export function removeBookFromShelf(shelfId: string, bookId: string): void {
	const entry = q.getRawEntry('shelves', shelfId);
	if (!entry) return;

	const bookIdsMap = entry.get('bookIds') as Y.Map<true> | undefined;
	if (!bookIdsMap || !(bookIdsMap instanceof Y.Map)) return;

	doc.transact(() => {
		bookIdsMap.delete(bookId);
	});
}

export function deleteShelf(id: string): void {
	q.deleteItem('shelves', id);
}

export function renameShelf(id: string, name: string): void {
	q.updateItem('shelves', id, { name });
}

export function getShelvesForBook(userId: string, bookId: string): Shelf[] {
	const shelves = getUserShelves(userId);
	return shelves.filter((s) => s.bookIds.includes(bookId));
}
