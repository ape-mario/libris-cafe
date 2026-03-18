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

import { createUser, getAllUsers, deleteUser } from '$lib/stores/user.svelte';

beforeEach(() => {
	doc = new Y.Doc();
	q = createQueryHelpers(doc);
});

describe('User management', () => {
	it('should create a new user', () => {
		const user = createUser('Alice', '👩');
		expect(user.name).toBe('Alice');
		expect(user.id).toBeDefined();
	});

	it('should list all users', () => {
		createUser('Alice');
		createUser('Bob');
		const users = getAllUsers();
		expect(users).toHaveLength(2);
	});

	it('should delete user and their book data', () => {
		const user = createUser('Alice');
		q.setItem('userBookData', `${user.id}:b1`, {
			userId: user.id,
			bookId: 'b1',
			status: 'unread',
			isWishlist: false
		});

		deleteUser(user.id);

		expect(q.getItem('users', user.id)).toBeUndefined();
		expect(q.filter('userBookData', (d) => d.userId === user.id)).toHaveLength(0);
	});
});
