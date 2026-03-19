import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { OfflineQueue } from './queue';

let queue: OfflineQueue;

beforeEach(async () => {
  const dbName = `test-queue-${crypto.randomUUID()}`;
  queue = new OfflineQueue(dbName);
});

describe('OfflineQueue', () => {
  it('should enqueue an entry', async () => {
    const id = await queue.enqueue('transaction', { total: 89000 });
    expect(id).toBeDefined();
    const pending = await queue.getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].type).toBe('transaction');
    expect(pending[0].payload.total).toBe(89000);
  });

  it('should dequeue entries in FIFO order', async () => {
    await queue.enqueue('transaction', { total: 1 });
    await queue.enqueue('transaction', { total: 2 });
    const pending = await queue.getPending();
    expect(pending[0].payload.total).toBe(1);
    expect(pending[1].payload.total).toBe(2);
  });

  it('should mark entry as synced', async () => {
    const id = await queue.enqueue('transaction', { total: 89000 });
    await queue.markSynced(id);
    const pending = await queue.getPending();
    expect(pending).toHaveLength(0);
  });

  it('should mark entry as failed with error', async () => {
    const id = await queue.enqueue('transaction', { total: 89000 });
    await queue.markFailed(id, 'Network error');
    const pending = await queue.getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].status).toBe('failed');
    expect(pending[0].retries).toBe(1);
  });

  it('should return queue count', async () => {
    await queue.enqueue('transaction', { total: 1 });
    await queue.enqueue('stock_adjustment', { quantity: 5 });
    const count = await queue.getCount();
    expect(count).toBe(2);
  });
});
