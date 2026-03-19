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

import { sendReceipt, queueReceipt, getReceiptsByTransaction } from './service';

beforeEach(() => {
  vi.clearAllMocks();

  const mockSingle = vi.fn().mockResolvedValue({
    data: { id: 'rcpt-1', status: 'queued' },
    error: null,
  });
  const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
  mockFrom.mockReturnValue({
    insert: mockInsert.mockReturnValue({ select: mockSelect }),
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [{ id: 'rcpt-1', type: 'whatsapp', status: 'sent' }],
          error: null,
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  });
});

describe('Receipt service', () => {
  it('should queue a receipt in the database', async () => {
    const receipt = await queueReceipt('tx-1', 'whatsapp', '+6281234567890');

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        transaction_id: 'tx-1',
        type: 'whatsapp',
        recipient: '+6281234567890',
        status: 'queued',
      })
    );
    expect(receipt.id).toBe('rcpt-1');
  });

  it('should send a WhatsApp receipt via Edge Function', async () => {
    mockInvoke.mockResolvedValue({ data: { success: true }, error: null });

    const result = await sendReceipt('rcpt-1', 'whatsapp', '+6281234567890', 'Receipt text');
    expect(mockInvoke).toHaveBeenCalledWith('send-receipt-wa', {
      body: expect.objectContaining({
        recipient: '+6281234567890',
        message: 'Receipt text',
      }),
    });
    expect(result.success).toBe(true);
  });

  it('should send an email receipt via Edge Function', async () => {
    mockInvoke.mockResolvedValue({ data: { success: true }, error: null });

    const result = await sendReceipt('rcpt-1', 'email', 'customer@test.com', '<html>...</html>');
    expect(mockInvoke).toHaveBeenCalledWith('send-receipt-email', {
      body: expect.objectContaining({
        recipient: 'customer@test.com',
      }),
    });
    expect(result.success).toBe(true);
  });

  it('should fetch receipts for a transaction', async () => {
    const receipts = await getReceiptsByTransaction('tx-1');
    expect(receipts).toHaveLength(1);
    expect(receipts[0].type).toBe('whatsapp');
  });
});
