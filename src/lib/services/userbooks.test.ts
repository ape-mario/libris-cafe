import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '$lib/db';
import { getUserBookData, setUserBookData } from './userbooks';

beforeEach(async () => {
  await db.userBookData.clear();
});

describe('UserBookData service', () => {
  it('should create user book data if none exists', async () => {
    const data = await setUserBookData('u1', 'b1', { status: 'reading' });
    expect(data.status).toBe('reading');
    expect(data.isWishlist).toBe(false);
  });

  it('should update existing user book data', async () => {
    await setUserBookData('u1', 'b1', { status: 'reading' });
    await setUserBookData('u1', 'b1', { status: 'read', rating: 5 });
    const data = await getUserBookData('u1', 'b1');
    expect(data?.status).toBe('read');
    expect(data?.rating).toBe(5);
  });

  it('should return null for non-existent data', async () => {
    const data = await getUserBookData('u1', 'b1');
    expect(data).toBeNull();
  });
});
