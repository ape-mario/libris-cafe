import { describe, it, expect } from 'vitest';
import {
  computeDemandForecast,
  computeSummary,
  classifyUrgency,
  suggestRestockQuantity,
} from './engine';
import type { SalesVelocity, RestockRecommendation } from './types';

describe('computeDemandForecast', () => {
  it('should compute weighted forecast from velocity data', () => {
    const data: SalesVelocity[] = [
      {
        inventory_id: 'inv-1',
        book_id: 'book-1',
        outlet_id: 'outlet-1',
        current_stock: 10,
        min_stock: 2,
        units_sold_30d: 30,
        units_sold_7d: 14,
        avg_daily_sales: 1.0,
        days_until_stockout: 10,
      },
    ];

    const forecasts = computeDemandForecast(data);

    expect(forecasts).toHaveLength(1);
    const f = forecasts[0];
    // 7d rate = 14/7 = 2.0, 30d rate = 1.0
    // Weighted = 2.0*0.6 + 1.0*0.4 = 1.6
    expect(f.forecast_7d).toBeCloseTo(1.6 * 7, 0); // ~11.2
    expect(f.forecast_30d).toBeCloseTo(1.6 * 30, 0); // ~48.0
    expect(f.trend).toBe('rising'); // 7d rate (2.0) > 30d rate (1.0) * 1.2
  });

  it('should classify trend as declining when 7d rate is low', () => {
    const data: SalesVelocity[] = [
      {
        inventory_id: 'inv-2',
        book_id: 'book-2',
        outlet_id: 'outlet-1',
        current_stock: 5,
        min_stock: 1,
        units_sold_30d: 30,
        units_sold_7d: 3,
        avg_daily_sales: 1.0,
        days_until_stockout: 5,
      },
    ];

    const forecasts = computeDemandForecast(data);
    // 7d rate = 3/7 ≈ 0.43, ratio = 0.43/1.0 = 0.43 < 0.8
    expect(forecasts[0].trend).toBe('declining');
  });

  it('should classify trend as stable when rates are similar', () => {
    const data: SalesVelocity[] = [
      {
        inventory_id: 'inv-3',
        book_id: 'book-3',
        outlet_id: 'outlet-1',
        current_stock: 20,
        min_stock: 3,
        units_sold_30d: 30,
        units_sold_7d: 7,
        avg_daily_sales: 1.0,
        days_until_stockout: 20,
      },
    ];

    const forecasts = computeDemandForecast(data);
    // 7d rate = 7/7 = 1.0, ratio = 1.0/1.0 = 1.0 (between 0.8 and 1.2)
    expect(forecasts[0].trend).toBe('stable');
  });

  it('should filter out items with zero sales', () => {
    const data: SalesVelocity[] = [
      {
        inventory_id: 'inv-4',
        book_id: 'book-4',
        outlet_id: 'outlet-1',
        current_stock: 10,
        min_stock: 1,
        units_sold_30d: 0,
        units_sold_7d: 0,
        avg_daily_sales: 0,
        days_until_stockout: null,
      },
    ];

    const forecasts = computeDemandForecast(data);
    expect(forecasts).toHaveLength(0);
  });
});

describe('classifyUrgency', () => {
  it('should return critical when stock is 0', () => {
    expect(classifyUrgency(0, 2, null)).toBe('critical');
  });

  it('should return urgent when stockout is within lead time', () => {
    expect(classifyUrgency(3, 2, 5, 7)).toBe('urgent');
  });

  it('should return warning when stockout is within 2x lead time', () => {
    expect(classifyUrgency(10, 2, 12, 7)).toBe('warning');
  });

  it('should return low when stock is at or below min_stock', () => {
    expect(classifyUrgency(2, 2, 30, 7)).toBe('low');
  });

  it('should return ok when everything is fine', () => {
    expect(classifyUrgency(20, 2, 60, 7)).toBe('ok');
  });
});

describe('suggestRestockQuantity', () => {
  it('should calculate quantity for lead time + buffer', () => {
    // 2 units/day * (7 lead + 14 buffer) = 42
    expect(suggestRestockQuantity(2, 7, 14)).toBe(42);
  });

  it('should return min_stock when no sales', () => {
    expect(suggestRestockQuantity(0, 7, 14, 3)).toBe(3);
  });

  it('should ceil fractional quantities', () => {
    // 0.5 units/day * 21 days = 10.5 → 11
    expect(suggestRestockQuantity(0.5, 7, 14)).toBe(11);
  });
});

describe('computeSummary', () => {
  it('should compute summary from velocity and recommendations', () => {
    const velocity: SalesVelocity[] = [
      { inventory_id: 'a', book_id: 'b1', outlet_id: 'o', current_stock: 5, min_stock: 2, units_sold_30d: 20, units_sold_7d: 7, avg_daily_sales: 0.67, days_until_stockout: 7.5 },
      { inventory_id: 'b', book_id: 'b2', outlet_id: 'o', current_stock: 0, min_stock: 1, units_sold_30d: 10, units_sold_7d: 3, avg_daily_sales: 0.33, days_until_stockout: 0 },
      { inventory_id: 'c', book_id: 'b3', outlet_id: 'o', current_stock: 50, min_stock: 5, units_sold_30d: 5, units_sold_7d: 1, avg_daily_sales: 0.17, days_until_stockout: 300 },
    ];

    const recs: RestockRecommendation[] = [
      { inventory_id: 'a', book_id: 'b1', current_stock: 5, min_stock: 2, avg_daily_sales: 0.67, days_until_stockout: 7.5, units_sold_30d: 20, units_sold_7d: 7, suggested_quantity: 14, urgency: 'warning', restock_score: 60 },
      { inventory_id: 'b', book_id: 'b2', current_stock: 0, min_stock: 1, avg_daily_sales: 0.33, days_until_stockout: 0, units_sold_30d: 10, units_sold_7d: 3, suggested_quantity: 7, urgency: 'critical', restock_score: 100 },
    ];

    const summary = computeSummary(velocity, recs);

    expect(summary.total_items).toBe(3);
    expect(summary.critical_count).toBe(1);
    expect(summary.warning_count).toBe(1);
    expect(summary.top_sellers).toHaveLength(3);
    expect(summary.top_sellers[0].book_id).toBe('b1'); // Highest 30d sales
    expect(summary.avg_days_until_stockout).toBeGreaterThan(0);
  });
});
