import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { createQueryHelpers } from './query';

export const doc = new Y.Doc();
export const q = createQueryHelpers(doc);

let persistence: IndexeddbPersistence | null = null;

export function initDoc(): Promise<void> {
	return new Promise((resolve) => {
		persistence = new IndexeddbPersistence('libris-crdt', doc);
		persistence.once('synced', () => {
			const meta = doc.getMap('meta');
			if (!meta.get('schemaVersion')) {
				meta.set('schemaVersion', 1);
				meta.set('createdAt', new Date().toISOString());
			}
			resolve();
		});
	});
}

export function isDocEmpty(): boolean {
	return doc.getMap('books').size === 0 && doc.getMap('users').size === 0;
}

export type { User, Book, UserBookData, Series, Shelf, ReadingGoal } from './types';
