import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();

const chainable = (terminal: any) => ({
  select: vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(terminal),
      }),
      single: vi.fn().mockResolvedValue(terminal),
      order: vi.fn().mockResolvedValue(terminal),
    }),
    order: vi.fn().mockResolvedValue(terminal),
  }),
  insert: mockInsert.mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue(terminal),
    }),
  }),
  update: mockUpdate.mockReturnValue({
    eq: vi.fn().mockResolvedValue(terminal),
  }),
});

vi.mock('$lib/supabase/client', () => ({
  getSupabase: () => ({
    from: vi.fn((table: string) => chainable({
      data: table === 'inventory'
        ? { id: 'inv-1', book_id: 'book-1', outlet_id: 'outlet-1', stock: 5, price: 89000, type: 'for_sale', source: 'supplier', is_preloved: false, cost_price: 60000, min_stock: 1, location: null, condition: 'new', created_at: '', updated_at: '' }
        : { id: 'sm-1' },
      error: null,
    })),
  }),
}));

import { addInventoryItem, adjustStock, getInventoryByBookId, getInventoryByOutlet, updateInventoryItem, getStockMovements } from './service';

beforeEach(() => vi.clearAllMocks());

describe('Inventory service', () => {
  it('should add an inventory item', async () => {
    const item = await addInventoryItem({
      book_id: 'book-1',
      outlet_id: 'outlet-1',
      type: 'for_sale',
      source: 'supplier',
      is_preloved: false,
      price: 89000,
      cost_price: 60000,
      stock: 10,
      condition: 'new',
    });
    expect(mockInsert).toHaveBeenCalled();
    expect(item.book_id).toBe('book-1');
  });

  it('should adjust stock with a movement record', async () => {
    await adjustStock('inv-1', 5, 'purchase_in', 'staff-1', 'Initial stock');
    expect(mockInsert).toHaveBeenCalled();
  });
});
