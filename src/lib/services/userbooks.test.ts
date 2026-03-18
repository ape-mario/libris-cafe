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

import { getUserBookData, setUserBookData } from './userbooks';

beforeEach(() => {
	doc = new Y.Doc();
	q = createQueryHelpers(doc);
});

describe('UserBookData service', () => {
	it('should create user book data if none exists', () => {
		const data = setUserBookData('u1', 'b1', { status: 'reading' });
		expect(data.status).toBe('reading');
		expect(data.isWishlist).toBe(false);
	});

	it('should update existing user book data', () => {
		setUserBookData('u1', 'b1', { status: 'reading' });
		setUserBookData('u1', 'b1', { status: 'read', rating: 5 });
		const data = getUserBookData('u1', 'b1');
		expect(data?.status).toBe('read');
		expect(data?.rating).toBe(5);
	});

	it('should return null for non-existent data', () => {
		const data = getUserBookData('u1', 'b1');
		expect(data).toBeNull();
	});
});
