// src/lib/db/reactive.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import * as Y from 'yjs';
import { createQueryHelpers } from './query';
import { createLiveQuery, createLiveItem } from './reactive';

let doc: Y.Doc;
let q: ReturnType<typeof createQueryHelpers>;

beforeEach(() => {
	doc = new Y.Doc();
	q = createQueryHelpers(doc);
});

describe('liveQuery', () => {
	it('emits initial data on subscribe', () => {
		q.setItem('books', 'b1', { id: 'b1', title: 'Dune' });

		const store = createLiveQuery<any>(doc, 'books');
		let value: any[] = [];
		const unsub = store.subscribe((v) => {
			value = v;
		});

		expect(value).toHaveLength(1);
		expect(value[0].title).toBe('Dune');
		unsub();
	});

	it('re-emits on Y.Map change', () => {
		const store = createLiveQuery<any>(doc, 'books');
		let value: any[] = [];
		const unsub = store.subscribe((v) => {
			value = v;
		});

		expect(value).toHaveLength(0);

		q.setItem('books', 'b1', { id: 'b1', title: 'Dune' });
		expect(value).toHaveLength(1);

		q.setItem('books', 'b2', { id: 'b2', title: '1984' });
		expect(value).toHaveLength(2);

		unsub();
	});

	it('stops observing after unsubscribe', () => {
		const store = createLiveQuery<any>(doc, 'books');
		let callCount = 0;
		const unsub = store.subscribe(() => {
			callCount++;
		});

		callCount = 0; // reset after initial emit
		unsub();

		q.setItem('books', 'b1', { id: 'b1', title: 'Dune' });
		expect(callCount).toBe(0);
	});

	it('re-emits on remote sync (Y.applyUpdate)', () => {
		const store = createLiveQuery<any>(doc, 'books');
		let value: any[] = [];
		const unsub = store.subscribe((v) => {
			value = v;
		});

		// Simulate remote device adding a book
		const doc2 = new Y.Doc();
		const q2 = createQueryHelpers(doc2);
		q2.setItem('books', 'b1', { id: 'b1', title: 'Dune' });

		Y.applyUpdate(doc, Y.encodeStateAsUpdate(doc2));
		expect(value).toHaveLength(1);
		expect(value[0].title).toBe('Dune');
		unsub();
	});
});

describe('liveItem', () => {
	it('emits item on subscribe', () => {
		q.setItem('books', 'b1', { id: 'b1', title: 'Dune' });

		const store = createLiveItem<any>(doc, 'books', 'b1');
		let value: any;
		const unsub = store.subscribe((v) => {
			value = v;
		});

		expect(value?.title).toBe('Dune');
		unsub();
	});

	it('emits undefined for missing item', () => {
		const store = createLiveItem<any>(doc, 'books', 'nope');
		let value: any = 'initial';
		const unsub = store.subscribe((v) => {
			value = v;
		});

		expect(value).toBeUndefined();
		unsub();
	});

	it('re-emits on item change', () => {
		q.setItem('books', 'b1', { id: 'b1', title: 'Duen' });
		const store = createLiveItem<any>(doc, 'books', 'b1');
		let value: any;
		const unsub = store.subscribe((v) => {
			value = v;
		});

		q.updateItem('books', 'b1', { title: 'Dune' });
		expect(value?.title).toBe('Dune');
		unsub();
	});
});
