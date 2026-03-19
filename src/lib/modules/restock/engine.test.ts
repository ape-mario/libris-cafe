import { describe, it, expect } from 'vitest';
import { calculateRestockSuggestion, generateRestockSuggestions } from './engine';
import type { RestockInput } from './types';

describe('Restock engine', () => {
  it('should flag CRITICAL when days_until_stockout < lead_time', () => {
    const result = calculateRestockSuggestion({
      inventory_id: 'inv-1',
      book_id: 'book-1',
      book_title: 'Atomic Habits',
      current_stock: 2,
      min_stock: 5,
      supplier_id: 'sup-1',
      supplier_name: 'Gramedia',
      lead_time_days: 7,
      sales_last_30d: 15,  // 0.5/day -> 4 days until stockout
    });

    expect(result.urgency).toBe('critical');
    expect(result.avg_daily_sales).toBeCloseTo(0.5);
    expect(result.days_until_stockout).toBe(4);
    expect(result.suggested_quantity).toBeGreaterThan(0);
  });

  it('should flag WARNING when stock is above stockout threshold but at min_stock', () => {
    const result = calculateRestockSuggestion({
      inventory_id: 'inv-2',
      book_id: 'book-2',
      book_title: 'Deep Work',
      current_stock: 8,
      min_stock: 10,
      supplier_id: 'sup-1',
      supplier_name: 'Gramedia',
      lead_time_days: 7,
      sales_last_30d: 15,  // 0.5/day -> 16 days until stockout, but stock <= min_stock
    });

    expect(result.urgency).toBe('warning');
  });

  it('should flag WARNING when stock is at or below min_stock', () => {
    const result = calculateRestockSuggestion({
      inventory_id: 'inv-3',
      book_id: 'book-3',
      book_title: 'Range',
      current_stock: 1,
      min_stock: 2,
      supplier_id: null,
      supplier_name: null,
      lead_time_days: 7,
      sales_last_30d: 0,  // No sales
    });

    expect(result.urgency).toBe('warning');
    expect(result.days_until_stockout).toBeNull();
  });

  it('should flag OK when stock is healthy', () => {
    const result = calculateRestockSuggestion({
      inventory_id: 'inv-4',
      book_id: 'book-4',
      book_title: 'Sapiens',
      current_stock: 20,
      min_stock: 3,
      supplier_id: 'sup-1',
      supplier_name: 'Gramedia',
      lead_time_days: 7,
      sales_last_30d: 6,  // 0.2/day -> 100 days
    });

    expect(result.urgency).toBe('ok');
  });

  it('should filter and sort suggestions by urgency', () => {
    const inputs: RestockInput[] = [
      {
        inventory_id: 'inv-1', book_id: 'b1', book_title: 'Book A',
        current_stock: 1, min_stock: 5, supplier_id: null, supplier_name: null,
        lead_time_days: 7, sales_last_30d: 30,  // critical
      },
      {
        inventory_id: 'inv-2', book_id: 'b2', book_title: 'Book B',
        current_stock: 50, min_stock: 3, supplier_id: null, supplier_name: null,
        lead_time_days: 7, sales_last_30d: 1,  // ok
      },
      {
        inventory_id: 'inv-3', book_id: 'b3', book_title: 'Book C',
        current_stock: 3, min_stock: 5, supplier_id: null, supplier_name: null,
        lead_time_days: 7, sales_last_30d: 10,  // urgent
      },
    ];

    const suggestions = generateRestockSuggestions(inputs);

    // Should exclude 'ok' items and sort critical first
    expect(suggestions).toHaveLength(2);
    expect(suggestions[0].urgency).toBe('critical');
    expect(suggestions[1].urgency).toBe('urgent');
  });
});
