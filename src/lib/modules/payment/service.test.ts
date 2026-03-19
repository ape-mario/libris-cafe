import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInvoke = vi.fn();
const mockFrom = vi.fn();
const mockInsert = vi.fn();

vi.mock('$lib/supabase/client', () => ({
  getSupabase: () => ({
    functions: { invoke: mockInvoke },
    from: mockFrom,
  }),
}));

import { createSnapPayment, checkPaymentStatus, recordPayment } from './service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Payment service', () => {
  it('should create a Snap payment via Edge Function', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        snap_token: 'snap-token-xyz',
        redirect_url: 'https://app.sandbox.midtrans.com/snap/v3/...',
        order_id: 'LIBRIS-20260319-abc123',
      },
      error: null,
    });

    const result = await createSnapPayment({
      transactionId: 'tx-1',
      orderId: 'LIBRIS-20260319-abc123',
      grossAmount: 98790,
      items: [{ id: 'inv-1', name: 'Atomic Habits', price: 89000, quantity: 1 }],
    });

    expect(mockInvoke).toHaveBeenCalledWith('create-payment', {
      body: expect.objectContaining({ order_id: 'LIBRIS-20260319-abc123' }),
    });
    expect(result.snapToken).toBe('snap-token-xyz');
    expect(result.orderId).toBe('LIBRIS-20260319-abc123');
  });

  it('should throw on Edge Function error', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: { message: 'Function error' },
    });

    await expect(
      createSnapPayment({
        transactionId: 'tx-1',
        orderId: 'LIBRIS-20260319-abc123',
        grossAmount: 98790,
        items: [],
      })
    ).rejects.toThrow('Function error');
  });

  it('should check payment status via Edge Function', async () => {
    mockInvoke.mockResolvedValue({
      data: { transaction_status: 'settlement', payment_type: 'qris' },
      error: null,
    });

    const result = await checkPaymentStatus('LIBRIS-20260319-abc123');
    expect(result.transaction_status).toBe('settlement');
  });

  it('should record a payment in the database', async () => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: 'pay-1' },
      error: null,
    });
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
    mockFrom.mockReturnValue({
      insert: mockInsert.mockReturnValue({ select: mockSelect }),
    });

    const payment = await recordPayment({
      transactionId: 'tx-1',
      orderId: 'LIBRIS-20260319-abc123',
      grossAmount: 98790,
      snapToken: 'snap-token-xyz',
    });

    expect(mockInsert).toHaveBeenCalled();
    expect(payment.id).toBe('pay-1');
  });
});
