import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CheckoutRequest, Cart, CartItem } from './types';
import type { Inventory } from '../inventory/types';
import type { Book } from '$lib/db';

const mockRpc = vi.fn();
const mockEnqueue = vi.fn();
const mockGetIsOnline = vi.fn(() => true);
const mockSingle = vi.fn();

// Build a chainable mock for supabase.from(...).insert(...).select().single()
const mockFrom = vi.fn(() => ({
  insert: vi.fn(() => ({
    select: vi.fn(() => ({
      single: mockSingle,
    })),
  })),
}));

vi.mock('$lib/supabase/client', () => ({
  getSupabase: () => ({ rpc: mockRpc, from: mockFrom }),
}));

vi.mock('../sync/manager', () => ({
  getIsOnline: (...args: unknown[]) => mockGetIsOnline(...args),
  getQueue: () => ({ enqueue: mockEnqueue }),
}));

vi.mock('$lib/modules/printer/service', () => ({
  getPrinterStatus: () => ({ connected: false }),
  printReceipt: vi.fn(),
}));

import { checkout } from './checkout';

const mockBook: Book = {
  id: 'book-1',
  title: 'Atomic Habits',
  authors: ['James Clear'],
  categories: ['self-help'],
  dateAdded: '',
  dateModified: '',
};

const mockInventory: Inventory = {
  id: 'inv-1',
  book_id: 'book-1',
  outlet_id: 'outlet-1',
  type: 'for_sale',
  source: 'supplier',
  is_preloved: false,
  price: 89000,
  cost_price: 60000,
  stock: 10,
  min_stock: 1,
  location: 'Rak A1',
  condition: 'new',
  created_at: '',
  updated_at: '',
};

const mockCartItem: CartItem = {
  inventory: mockInventory,
  book: mockBook,
  quantity: 1,
  unitPrice: 89000,
  discount: 0,
  total: 89000,
};

const mockCart: Cart = {
  items: [mockCartItem],
  subtotal: 89000,
  discount: 0,
  tax: 9790,
  taxRate: 11,
  total: 98790,
};

const mockCashRequest: CheckoutRequest = {
  cart: mockCart,
  paymentMethod: 'cash',
  staffId: 'staff-1',
  outletId: 'outlet-1',
  customerName: 'John',
};

const mockDigitalRequest: CheckoutRequest = {
  cart: mockCart,
  paymentMethod: 'qris',
  staffId: 'staff-1',
  outletId: 'outlet-1',
};

describe('checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIsOnline.mockReturnValue(true);
  });

  it('should call atomic RPC for cash payments when online', async () => {
    mockRpc.mockResolvedValue({ data: { transaction_id: 'tx-1' }, error: null });
    const result = await checkout(mockCashRequest);
    expect(mockRpc).toHaveBeenCalledWith('checkout_transaction', expect.any(Object));
    expect(result.synced).toBe(true);
    expect(result.transactionId).toBe('tx-1');
  });

  it('should queue offline for cash when RPC fails with network error', async () => {
    mockRpc.mockRejectedValue(new Error('network error'));
    const result = await checkout(mockCashRequest);
    expect(mockEnqueue).toHaveBeenCalled();
    expect(result.synced).toBe(false);
  });

  it('should throw on stock error instead of queueing', async () => {
    mockRpc.mockRejectedValue(new Error('Insufficient stock'));
    await expect(checkout(mockCashRequest)).rejects.toThrow('Insufficient stock');
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('should throw for digital payments when offline', async () => {
    mockGetIsOnline.mockReturnValue(false);
    await expect(checkout(mockDigitalRequest)).rejects.toThrow('internet');
  });

  it('should return requiresPayment true for digital payments when online', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'tx-digital-1' }, error: null });
    // Also mock the transaction_item insert (from().insert())
    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: mockSingle,
        }),
      }),
    });
    const result = await checkout(mockDigitalRequest);
    expect(result.synced).toBe(true);
    expect(result.requiresPayment).toBe(true);
    expect(result.transactionId).toBe('tx-digital-1');
  });
});
