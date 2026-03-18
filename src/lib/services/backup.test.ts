import { describe, it, expect, beforeEach } from 'vitest';
import * as Y from 'yjs';
import { createQueryHelpers } from '$lib/db/query';

let doc: Y.Doc;
let q: ReturnType<typeof createQueryHelpers>;

import { vi } from 'vitest';
vi.mock('$lib/db', () => {
	return {
		get q() {
			return q;
		},
		get doc() {
			return doc;
		}
	};
});

// Mock coverCache since it uses IndexedDB
vi.mock('./coverCache', () => ({
	getCoverBase64: vi.fn().mockResolvedValue(null),
	setCoverBase64: vi.fn().mockResolvedValue(undefined)
}));

import { exportData, importData } from './backup';

beforeEach(() => {
	doc = new Y.Doc();
	q = createQueryHelpers(doc);
});

describe('Backup service', () => {
	it('should export and import data', async () => {
		q.setItem('users', 'u1', { id: 'u1', name: 'Alice' });
		q.setItem('books', 'b1', {
			id: 'b1',
			title: 'Dune',
			authors: ['Frank Herbert'],
			categories: ['sci-fi'],
			dateAdded: new Date().toISOString(),
			dateModified: new Date().toISOString()
		});

		const json = await exportData();
		const parsed = JSON.parse(json);
		expect(parsed.books).toHaveLength(1);
		expect(parsed.users).toHaveLength(1);
		expect(parsed.version).toBe(4);

		// Clear and reimport
		doc = new Y.Doc();
		q = createQueryHelpers(doc);
		await importData(json);

		expect(q.getAll('books')).toHaveLength(1);
		expect(q.getAll('users')).toHaveLength(1);
	});
});
