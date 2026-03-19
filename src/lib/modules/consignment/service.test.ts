import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockRpc = vi.fn();

function createChainable(data: any) {
  const chain: any = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = mockInsert.mockReturnValue(chain);
  chain.update = mockUpdate.mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.neq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.lte = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue({ data, error: null });
  chain.then = (resolve: any) => resolve({ data: Array.isArray(data) ? data : [data], error: null });
  return chain;
}

vi.mock('$lib/supabase/client', () => ({
  getSupabase: () => ({
    from: vi.fn((table: string) => {
      if (table === 'consignor') {
        return createChainable({
          id: 'con-1', name: 'Pak Rudi', phone: '08111222333',
          commission_rate: 20, is_active: true, created_at: '2026-01-01',
        });
      }
      if (table === 'consignment_settlement') {
        return createChainable({
          id: 'set-1', consignor_id: 'con-1', total_sales: 500000,
          commission: 100000, payout: 400000, status: 'draft',
        });
      }
      return createChainable(null);
    }),
    rpc: mockRpc.mockResolvedValue({ data: [], error: null }),
  }),
}));

import { createConsignor, createSettlement, confirmSettlement } from './service';

beforeEach(() => vi.clearAllMocks());

describe('Consignment service', () => {
  it('should create a consignor', async () => {
    const consignor = await createConsignor({
      name: 'Pak Rudi',
      phone: '08111222333',
      commission_rate: 20,
    });

    expect(mockInsert).toHaveBeenCalled();
    expect(consignor.name).toBe('Pak Rudi');
  });

  it('should create a settlement draft', async () => {
    const settlement = await createSettlement({
      consignorId: 'con-1',
      periodStart: '2026-02-01',
      periodEnd: '2026-02-28',
      totalSales: 500000,
      commissionRate: 20,
      staffId: 'staff-1',
    });

    expect(mockInsert).toHaveBeenCalled();
    expect(settlement.status).toBe('draft');
  });

  it('should confirm a settlement', async () => {
    await confirmSettlement('set-1');
    expect(mockUpdate).toHaveBeenCalled();
  });
});
