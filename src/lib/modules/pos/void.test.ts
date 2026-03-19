import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();

// Chain builders
const selectChain = { eq: mockEq };
const updateChain = { eq: vi.fn() };

const mockFrom = vi.fn((table: string) => {
  if (table === 'transaction_item') {
    return { select: mockSelect };
  }
  if (table === 'transaction') {
    return { update: mockUpdate };
  }
  if (table === 'stock_movement') {
    return { insert: mockInsert };
  }
  return {};
});

vi.mock('$lib/supabase/client', () => ({
  getSupabase: () => ({ from: mockFrom }),
}));

import { voidTransaction } from './void';

describe('voidTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: transaction_item select chain
    mockSelect.mockReturnValue({
      eq: vi.fn().mockResolvedValue({
        data: [
          { inventory_id: 'inv-1', quantity: 2 },
          { inventory_id: 'inv-2', quantity: 1 },
        ],
      }),
    });

    // Default: transaction update chain
    mockUpdate.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    // Default: stock_movement insert
    mockInsert.mockResolvedValue({ error: null });
  });

  it('should update transaction type to void and payment_status to refunded', async () => {
    await voidTransaction('tx-1', 'staff-1', 'Customer refund');

    expect(mockFrom).toHaveBeenCalledWith('transaction');
    expect(mockUpdate).toHaveBeenCalledWith({
      type: 'void',
      payment_status: 'refunded',
      notes: 'Customer refund',
    });
  });

  it('should create stock_movement entries for each item', async () => {
    await voidTransaction('tx-1', 'staff-1', 'Wrong item');

    expect(mockFrom).toHaveBeenCalledWith('stock_movement');
    expect(mockInsert).toHaveBeenCalledTimes(2);

    expect(mockInsert).toHaveBeenCalledWith({
      inventory_id: 'inv-1',
      type: 'void_restore',
      quantity: 2,
      reference_id: 'tx-1',
      staff_id: 'staff-1',
      reason: 'Void: Wrong item',
    });

    expect(mockInsert).toHaveBeenCalledWith({
      inventory_id: 'inv-2',
      type: 'void_restore',
      quantity: 1,
      reference_id: 'tx-1',
      staff_id: 'staff-1',
      reason: 'Void: Wrong item',
    });
  });

  it('should throw if transaction update fails', async () => {
    mockUpdate.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: { message: 'DB error' } }),
    });

    await expect(voidTransaction('tx-1', 'staff-1', 'test')).rejects.toThrow('Failed to void: DB error');
  });

  it('should handle empty items gracefully', async () => {
    mockSelect.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null }),
    });

    await voidTransaction('tx-1', 'staff-1', 'No items');

    // Should not insert any stock movements
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
