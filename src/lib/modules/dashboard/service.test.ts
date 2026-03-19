import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRpc = vi.fn();

vi.mock('$lib/supabase/client', () => ({
  getSupabase: () => ({
    rpc: mockRpc,
  }),
}));

import { fetchTodayMetrics, fetchSalesTrend, fetchTopBooks } from './service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Dashboard service', () => {
  it('should fetch today metrics via RPC', async () => {
    mockRpc.mockResolvedValue({
      data: {
        total_sales: 1250000,
        transaction_count: 15,
        total_margin: 450000,
        low_stock_count: 3,
        out_of_stock_count: 1,
        payment_breakdown: [
          { method: 'cash', total: 750000, count: 10 },
          { method: 'qris', total: 500000, count: 5 },
        ],
      },
      error: null,
    });

    const metrics = await fetchTodayMetrics('outlet-1');
    expect(mockRpc).toHaveBeenCalledWith('get_today_metrics', { p_outlet_id: 'outlet-1' });
    expect(metrics.total_sales).toBe(1250000);
    expect(metrics.transaction_count).toBe(15);
    expect(metrics.payment_breakdown).toHaveLength(2);
  });

  it('should fetch sales trend via RPC', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { date: '2026-03-12', total_sales: 500000, transaction_count: 8 },
        { date: '2026-03-13', total_sales: 750000, transaction_count: 12 },
      ],
      error: null,
    });

    const trend = await fetchSalesTrend('outlet-1', '2026-03-12', '2026-03-18');
    expect(mockRpc).toHaveBeenCalledWith('get_sales_trend', {
      p_outlet_id: 'outlet-1',
      p_start_date: '2026-03-12',
      p_end_date: '2026-03-18',
    });
    expect(trend).toHaveLength(2);
  });

  it('should fetch top books via RPC', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { book_id: 'b-1', title: 'Atomic Habits', total_sold: 25, total_revenue: 2225000 },
      ],
      error: null,
    });

    const books = await fetchTopBooks('outlet-1', '2026-03-01', '2026-03-18', 10);
    expect(books).toHaveLength(1);
    expect(books[0].title).toBe('Atomic Habits');
  });
});
