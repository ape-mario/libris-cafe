import { describe, it, expect } from 'vitest';
import { formatRupiah, groupTrendByOutlet } from './consolidated';
import type { DailyTrendRow } from './types';

describe('Consolidated Reporting Utilities', () => {
  it('should format rupiah correctly', () => {
    // Node uses a non-breaking space between symbol and amount
    expect(formatRupiah(89000).replace(/\s/g, '')).toBe('Rp89.000');
    expect(formatRupiah(1500000).replace(/\s/g, '')).toBe('Rp1.500.000');
    expect(formatRupiah(0).replace(/\s/g, '')).toBe('Rp0');
  });

  it('should group daily trend by outlet', () => {
    const trend: DailyTrendRow[] = [
      { sale_date: '2026-03-01', outlet_id: 'o1', outlet_name: 'Main', daily_total: 500000, daily_transactions: 5 },
      { sale_date: '2026-03-01', outlet_id: 'o2', outlet_name: 'Branch', daily_total: 300000, daily_transactions: 3 },
      { sale_date: '2026-03-02', outlet_id: 'o1', outlet_name: 'Main', daily_total: 600000, daily_transactions: 6 },
      { sale_date: '2026-03-02', outlet_id: 'o2', outlet_name: 'Branch', daily_total: 400000, daily_transactions: 4 },
    ];

    const grouped = groupTrendByOutlet(trend);
    expect(grouped.size).toBe(2);

    const main = grouped.get('o1')!;
    expect(main.name).toBe('Main');
    expect(main.dates).toEqual(['2026-03-01', '2026-03-02']);
    expect(main.totals).toEqual([500000, 600000]);

    const branch = grouped.get('o2')!;
    expect(branch.name).toBe('Branch');
    expect(branch.totals).toEqual([300000, 400000]);
  });

  it('should handle empty trend data', () => {
    const grouped = groupTrendByOutlet([]);
    expect(grouped.size).toBe(0);
  });
});
