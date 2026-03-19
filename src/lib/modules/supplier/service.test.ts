import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockSelect = vi.fn();

function createChainable(data: any) {
  const chain: any = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = mockInsert.mockReturnValue(chain);
  chain.update = mockUpdate.mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue({ data, error: null });
  chain.then = (resolve: any) => resolve({ data, error: null });
  chain[Symbol.toStringTag] = 'Promise';
  return chain;
}

vi.mock('$lib/supabase/client', () => ({
  getSupabase: () => ({
    from: vi.fn((table: string) => {
      if (table === 'supplier') {
        return createChainable({
          id: 'sup-1', name: 'Gramedia', contact_name: 'Budi',
          phone: '08123456789', email: 'budi@gramedia.com',
          lead_time_days: 7, is_active: true, created_at: '2026-01-01',
        });
      }
      if (table === 'purchase_order') {
        return createChainable({
          id: 'po-1', supplier_id: 'sup-1', outlet_id: 'outlet-1',
          status: 'draft', total: 0, created_at: '2026-01-01',
        });
      }
      if (table === 'purchase_order_item') {
        return createChainable({ id: 'poi-1' });
      }
      return createChainable(null);
    }),
  }),
}));

import {
  createSupplier,
  getSuppliers,
  updateSupplier,
  createPurchaseOrder,
  updatePOStatus,
} from './service';

beforeEach(() => vi.clearAllMocks());

describe('Supplier service', () => {
  it('should create a supplier', async () => {
    const supplier = await createSupplier({
      name: 'Gramedia',
      contact_name: 'Budi',
      phone: '08123456789',
      email: 'budi@gramedia.com',
    });

    expect(mockInsert).toHaveBeenCalled();
    expect(supplier.name).toBe('Gramedia');
  });

  it('should create a purchase order with items', async () => {
    const po = await createPurchaseOrder({
      supplier_id: 'sup-1',
      outlet_id: 'outlet-1',
      created_by: 'staff-1',
      items: [
        { title: 'Atomic Habits', quantity: 5, unit_price: 60000 },
        { title: 'Deep Work', quantity: 3, unit_price: 55000, isbn: '978-xxx' },
      ],
    });

    expect(mockInsert).toHaveBeenCalled();
    expect(po.supplier_id).toBe('sup-1');
  });

  it('should update PO status to ordered', async () => {
    await updatePOStatus('po-1', 'ordered');
    expect(mockUpdate).toHaveBeenCalled();
  });
});
