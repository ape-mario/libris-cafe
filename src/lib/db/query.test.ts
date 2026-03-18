import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { createQueryHelpers, yMapToObject } from './query';

function setup() {
	const doc = new Y.Doc();
	const q = createQueryHelpers(doc);
	return { doc, q };
}

describe('query helpers', () => {
	it('setItem and getItem roundtrip (with arrays like authors)', () => {
		const { q } = setup();
		const book = {
			id: 'b1',
			title: 'Dune',
			authors: ['Frank Herbert'],
			categories: ['sci-fi']
		};
		q.setItem('books', 'b1', book);
		const result = q.getItem('books', 'b1');
		expect(result).toBeDefined();
		expect(result!.id).toBe('b1');
		expect(result!.title).toBe('Dune');
		expect(result!.authors).toEqual(['Frank Herbert']);
		expect(result!.categories).toEqual(['sci-fi']);
	});

	it('getAll returns all items', () => {
		const { q } = setup();
		q.setItem('books', 'b1', { id: 'b1', title: 'Dune' });
		q.setItem('books', 'b2', { id: 'b2', title: 'Neuromancer' });
		q.setItem('books', 'b3', { id: 'b3', title: '1984' });

		const all = q.getAll('books');
		expect(all).toHaveLength(3);
		const titles = all.map((b) => b.title).sort();
		expect(titles).toEqual(['1984', 'Dune', 'Neuromancer']);
	});

	it('getItem returns undefined for missing key', () => {
		const { q } = setup();
		expect(q.getItem('books', 'nonexistent')).toBeUndefined();
	});

	it('filter returns matching items', () => {
		const { q } = setup();
		q.setItem('books', 'b1', { id: 'b1', title: 'Dune', status: 'read' });
		q.setItem('books', 'b2', { id: 'b2', title: 'Neuromancer', status: 'unread' });
		q.setItem('books', 'b3', { id: 'b3', title: '1984', status: 'read' });

		const readBooks = q.filter('books', (b) => b.status === 'read');
		expect(readBooks).toHaveLength(2);
	});

	it('search matches case-insensitive across fields (including array fields)', () => {
		const { q } = setup();
		q.setItem('books', 'b1', {
			id: 'b1',
			title: 'Dune',
			authors: ['Frank Herbert']
		});
		q.setItem('books', 'b2', {
			id: 'b2',
			title: 'Neuromancer',
			authors: ['William Gibson']
		});

		// Search by title
		expect(q.search('books', 'dune')).toHaveLength(1);
		// Search by author (array field joined to string)
		expect(q.search('books', 'herbert')).toHaveLength(1);
		// Case insensitive
		expect(q.search('books', 'NEUROMANCER')).toHaveLength(1);
	});

	it('search with multi-word query uses AND logic', () => {
		const { q } = setup();
		q.setItem('books', 'b1', {
			id: 'b1',
			title: 'Dune',
			authors: ['Frank Herbert']
		});
		q.setItem('books', 'b2', {
			id: 'b2',
			title: 'Foundation',
			authors: ['Isaac Asimov']
		});

		// Both words must match
		expect(q.search('books', 'dune herbert')).toHaveLength(1);
		// "dune asimov" should match nothing (AND logic)
		expect(q.search('books', 'dune asimov')).toHaveLength(0);
	});

	it('updateItem merges fields without overwriting others', () => {
		const { q } = setup();
		q.setItem('books', 'b1', {
			id: 'b1',
			title: 'Dune',
			rating: 5,
			status: 'unread'
		});

		q.updateItem('books', 'b1', { status: 'read' });

		const result = q.getItem('books', 'b1');
		expect(result!.status).toBe('read');
		expect(result!.title).toBe('Dune');
		expect(result!.rating).toBe(5);
	});

	it('deleteItem removes entry', () => {
		const { q } = setup();
		q.setItem('books', 'b1', { id: 'b1', title: 'Dune' });
		expect(q.getItem('books', 'b1')).toBeDefined();

		q.deleteItem('books', 'b1');
		expect(q.getItem('books', 'b1')).toBeUndefined();
	});

	it('observe fires callback on changes', () => {
		const { q } = setup();
		const changes: { action: string; key: string }[] = [];

		const unobserve = q.observe('books', (c) => {
			changes.push(...c);
		});

		q.setItem('books', 'b1', { id: 'b1', title: 'Dune' });
		expect(changes).toHaveLength(1);
		expect(changes[0]).toEqual({ action: 'add', key: 'b1' });

		q.updateItem('books', 'b1', { title: 'Dune Messiah' });
		// updateItem modifies nested map, top-level key gets 'update' action
		expect(changes).toHaveLength(2);
		expect(changes[1]).toEqual({ action: 'update', key: 'b1' });

		q.deleteItem('books', 'b1');
		expect(changes).toHaveLength(3);
		expect(changes[2]).toEqual({ action: 'delete', key: 'b1' });

		unobserve();

		// After unobserve, no more callbacks
		q.setItem('books', 'b2', { id: 'b2', title: 'Test' });
		expect(changes).toHaveLength(3);
	});

	it('shelf bookIds stored as Y.Map set, returned as string[]', () => {
		const { q } = setup();
		q.setItem('shelves', 's1', {
			id: 's1',
			name: 'Favorites',
			bookIds: ['b1', 'b2', 'b3']
		});

		const shelf = q.getItem('shelves', 's1');
		expect(shelf).toBeDefined();
		expect(shelf!.name).toBe('Favorites');
		// bookIds should come back as string[] (order may vary since it's a set)
		const bookIds = (shelf!.bookIds as string[]).sort();
		expect(bookIds).toEqual(['b1', 'b2', 'b3']);
	});

	it('concurrent shelf bookIds edits merge correctly', () => {
		const doc1 = new Y.Doc();
		const doc2 = new Y.Doc();
		const q1 = createQueryHelpers(doc1);
		const q2 = createQueryHelpers(doc2);

		// Set initial shelf on doc1
		q1.setItem('shelves', 's1', {
			id: 's1',
			name: 'Favorites',
			bookIds: ['b1']
		});

		// Sync doc1 → doc2
		Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

		// Concurrent edits: doc1 adds b2, doc2 adds b3
		const raw1 = q1.getRawEntry('shelves', 's1')!;
		const bookIds1 = raw1.get('bookIds') as Y.Map<true>;
		doc1.transact(() => {
			bookIds1.set('b2', true);
		});

		const raw2 = q2.getRawEntry('shelves', 's1')!;
		const bookIds2 = raw2.get('bookIds') as Y.Map<true>;
		doc2.transact(() => {
			bookIds2.set('b3', true);
		});

		// Merge both directions
		Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2));
		Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

		// Both should have b1, b2, b3
		const shelf1 = q1.getItem('shelves', 's1')!;
		const shelf2 = q2.getItem('shelves', 's1')!;
		expect((shelf1.bookIds as string[]).sort()).toEqual(['b1', 'b2', 'b3']);
		expect((shelf2.bookIds as string[]).sort()).toEqual(['b1', 'b2', 'b3']);
	});

	it('nested Y.Map enables field-level merge (concurrent different-field edits)', () => {
		const doc1 = new Y.Doc();
		const doc2 = new Y.Doc();
		const q1 = createQueryHelpers(doc1);
		const q2 = createQueryHelpers(doc2);

		// Set initial book on doc1
		q1.setItem('books', 'b1', {
			id: 'b1',
			title: 'Dune',
			rating: 3,
			status: 'reading'
		});

		// Sync doc1 → doc2
		Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

		// Concurrent edits: doc1 updates rating, doc2 updates status
		q1.updateItem('books', 'b1', { rating: 5 });
		q2.updateItem('books', 'b1', { status: 'read' });

		// Merge both directions
		Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2));
		Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

		// Both edits should be present
		const book1 = q1.getItem('books', 'b1')!;
		const book2 = q2.getItem('books', 'b1')!;

		expect(book1.rating).toBe(5);
		expect(book1.status).toBe('read');
		expect(book1.title).toBe('Dune');

		expect(book2.rating).toBe(5);
		expect(book2.status).toBe('read');
		expect(book2.title).toBe('Dune');
	});
});
