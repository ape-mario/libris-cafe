import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '$lib/db';

beforeEach(async () => {
  await db.users.clear();
});

describe('User management', () => {
  it('should create a new user', async () => {
    const id = crypto.randomUUID();
    await db.users.add({ id, name: 'Alice', avatar: '👩' });
    const user = await db.users.get(id);
    expect(user?.name).toBe('Alice');
  });

  it('should list all users', async () => {
    await db.users.add({ id: 'u1', name: 'Alice' });
    await db.users.add({ id: 'u2', name: 'Bob' });
    const users = await db.users.toArray();
    expect(users).toHaveLength(2);
  });

  it('should delete user and their book data', async () => {
    await db.users.add({ id: 'u1', name: 'Alice' });
    await db.userBookData.add({
      id: 'ubd1', userId: 'u1', bookId: 'b1',
      status: 'unread', isWishlist: false
    });

    await db.userBookData.where('userId').equals('u1').delete();
    await db.users.delete('u1');

    expect(await db.users.get('u1')).toBeUndefined();
    expect(await db.userBookData.where('userId').equals('u1').count()).toBe(0);
  });
});
