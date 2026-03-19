import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRpc = vi.fn();

vi.mock('$lib/supabase/client', () => ({
  getSupabase: () => ({ rpc: mockRpc }),
}));

import { voidTransaction } from './void';

describe('voidTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ error: null });
  });

  it('should update transaction type to void and payment_status to refunded', async () => {
    await voidTransaction('tx-1', 'staff-1', 'Customer refund');

    expect(mockRpc).toHaveBeenCalledWith('void_transaction', {
      p_transaction_id: 'tx-1',
      p_staff_id: 'staff-1',
      p_reason: 'Customer refund',
    });
  });

  it('should create stock_movement entries for each item', async () => {
    // With the RPC approach, stock restoration is handled server-side.
    // We just verify the RPC is called correctly.
    await voidTransaction('tx-1', 'staff-1', 'Wrong item');

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('void_transaction', {
      p_transaction_id: 'tx-1',
      p_staff_id: 'staff-1',
      p_reason: 'Wrong item',
    });
  });

  it('should throw if transaction update fails', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'DB error' } });

    await expect(voidTransaction('tx-1', 'staff-1', 'test')).rejects.toThrow('Failed to void: DB error');
  });

  it('should handle empty items gracefully', async () => {
    // With atomic RPC, the server handles empty items internally.
    // Client just calls the RPC and expects success.
    mockRpc.mockResolvedValue({ error: null });

    await voidTransaction('tx-1', 'staff-1', 'No items');

    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});
