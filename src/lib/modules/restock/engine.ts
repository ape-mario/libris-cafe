import type { RestockInput, RestockSuggestion, RestockUrgency } from './types';

/** Buffer multiplier: order enough for lead_time + 50% extra */
const BUFFER_MULTIPLIER = 1.5;

/**
 * Calculate restock suggestion for a single inventory item.
 *
 * Heuristic:
 * - avg_daily_sales = sales_last_30d / 30
 * - days_until_stockout = current_stock / avg_daily_sales
 * - If days_until_stockout < lead_time -> CRITICAL
 * - If days_until_stockout < 2 * lead_time -> URGENT
 * - If current_stock <= min_stock -> WARNING (even if no sales)
 * - Otherwise -> OK
 * - suggested_quantity = avg_daily_sales * (lead_time * BUFFER) - current_stock
 */
export function calculateRestockSuggestion(input: RestockInput): RestockSuggestion {
  const avgDailySales = input.sales_last_30d / 30;
  const daysUntilStockout = avgDailySales > 0
    ? Math.floor(input.current_stock / avgDailySales)
    : null;

  let urgency: RestockUrgency = 'ok';

  if (daysUntilStockout !== null) {
    if (daysUntilStockout < input.lead_time_days) {
      urgency = 'critical';
    } else if (daysUntilStockout < input.lead_time_days * 2) {
      urgency = 'urgent';
    }
  }

  // Even without sales data, flag low stock
  if (urgency === 'ok' && input.current_stock <= input.min_stock) {
    urgency = 'warning';
  }

  // Calculate suggested reorder quantity
  const targetStock = Math.ceil(
    avgDailySales * input.lead_time_days * BUFFER_MULTIPLIER
  );
  const suggestedQuantity = Math.max(
    targetStock - input.current_stock,
    input.min_stock - input.current_stock,
    0
  );

  return {
    inventory_id: input.inventory_id,
    book_id: input.book_id,
    book_title: input.book_title,
    current_stock: input.current_stock,
    avg_daily_sales: avgDailySales,
    days_until_stockout: daysUntilStockout,
    lead_time_days: input.lead_time_days,
    urgency,
    suggested_quantity: suggestedQuantity,
    supplier_id: input.supplier_id,
    supplier_name: input.supplier_name,
  };
}

/**
 * Generate restock suggestions for multiple inventory items.
 * Returns only items that need attention (not 'ok'), sorted by urgency.
 */
export function generateRestockSuggestions(inputs: RestockInput[]): RestockSuggestion[] {
  const urgencyOrder: Record<RestockUrgency, number> = {
    critical: 0,
    urgent: 1,
    warning: 2,
    ok: 3,
  };

  return inputs
    .map(calculateRestockSuggestion)
    .filter(s => s.urgency !== 'ok')
    .sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);
}

/**
 * Fetch sales data for restock calculation.
 * Queries transaction_items from the last 30 days, grouped by inventory_id.
 */
export async function fetchSalesData(
  outletId: string
): Promise<Map<string, number>> {
  const { getSupabase } = await import('$lib/supabase/client');
  const supabase = getSupabase();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data, error } = await supabase
    .from('transaction_item')
    .select(`
      inventory_id,
      quantity,
      transaction!inner(outlet_id, payment_status, created_at)
    `)
    .eq('transaction.outlet_id', outletId)
    .eq('transaction.payment_status', 'paid')
    .gte('transaction.created_at', thirtyDaysAgo.toISOString());

  if (error) {
    console.error('Failed to fetch sales data:', error);
    return new Map();
  }

  const salesMap = new Map<string, number>();
  for (const row of data ?? []) {
    const current = salesMap.get(row.inventory_id) ?? 0;
    salesMap.set(row.inventory_id, current + row.quantity);
  }

  return salesMap;
}

/**
 * Full pipeline: fetch inventory + sales data, generate suggestions.
 */
export async function getRestockSuggestions(outletId: string): Promise<RestockSuggestion[]> {
  const { getSupabase } = await import('$lib/supabase/client');
  const { getBookById } = await import('$lib/services/books');
  const supabase = getSupabase();

  // Fetch inventory with supplier info
  const { data: inventoryData, error } = await supabase
    .from('inventory')
    .select('*, supplier:inventory_supplier_fk(id, name, lead_time_days)')
    .eq('outlet_id', outletId)
    .in('type', ['for_sale', 'both']);

  if (error || !inventoryData) return [];

  // Fetch 30-day sales
  const salesMap = await fetchSalesData(outletId);

  // Build inputs
  const inputs: RestockInput[] = inventoryData.map((inv: any) => {
    const book = getBookById(inv.book_id);
    return {
      inventory_id: inv.id,
      book_id: inv.book_id,
      book_title: book?.title ?? `Book ${inv.book_id.slice(0, 8)}`,
      current_stock: inv.stock,
      min_stock: inv.min_stock,
      supplier_id: inv.supplier?.id ?? null,
      supplier_name: inv.supplier?.name ?? null,
      lead_time_days: inv.supplier?.lead_time_days ?? 7,
      sales_last_30d: salesMap.get(inv.id) ?? 0,
    };
  });

  return generateRestockSuggestions(inputs);
}
