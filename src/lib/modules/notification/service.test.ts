import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInsert = vi.fn();
const mockUpdate = vi.fn();

function createChainable(data: any) {
  const chain: any = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = mockInsert.mockReturnValue(chain);
  chain.update = mockUpdate.mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue({ data, error: null });
  chain.then = (resolve: any) => resolve({ data: Array.isArray(data) ? data : [data], error: null });
  return chain;
}

vi.mock('$lib/supabase/client', () => ({
  getSupabase: () => ({
    from: vi.fn(() =>
      createChainable({
        id: 'notif-1', type: 'low_stock', title: 'Low stock: Atomic Habits',
        body: 'Only 2 left', read: false, created_at: '2026-01-01',
      })
    ),
  }),
}));

import { createNotification, markAsRead, getUnreadCount } from './service';

beforeEach(() => vi.clearAllMocks());

describe('Notification service', () => {
  it('should create a notification', async () => {
    const notif = await createNotification({
      outlet_id: 'outlet-1',
      recipient_id: 'staff-1',
      type: 'low_stock',
      title: 'Low stock: Atomic Habits',
      body: 'Only 2 left',
    });

    expect(mockInsert).toHaveBeenCalled();
    expect(notif.type).toBe('low_stock');
  });

  it('should mark notification as read', async () => {
    await markAsRead('notif-1');
    expect(mockUpdate).toHaveBeenCalled();
  });
});
