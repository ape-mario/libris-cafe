import { getSupabase } from '$lib/supabase/client';
import type {
  ConsolidatedSalesRow,
  ConsolidatedInventoryRow,
  DailyTrendRow,
  TopBookRow,
  ConsolidatedReportFilters,
  ConsolidatedDashboard,
} from './types';

export async function fetchConsolidatedSales(
  dateFrom: string,
  dateTo: string,
  outletIds?: string[]
): Promise<ConsolidatedSalesRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('rpc_consolidated_sales', {
    p_date_from: dateFrom,
    p_date_to: dateTo,
    p_outlet_ids: outletIds ?? null,
  });

  if (error) throw new Error(`Failed to fetch consolidated sales: ${error.message}`);
  return data ?? [];
}

export async function fetchConsolidatedInventory(
  outletIds?: string[]
): Promise<ConsolidatedInventoryRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('rpc_consolidated_inventory', {
    p_outlet_ids: outletIds ?? null,
  });

  if (error) throw new Error(`Failed to fetch consolidated inventory: ${error.message}`);
  return data ?? [];
}

export async function fetchConsolidatedDailyTrend(
  dateFrom: string,
  dateTo: string,
  outletIds?: string[]
): Promise<DailyTrendRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('rpc_consolidated_daily_trend', {
    p_date_from: dateFrom,
    p_date_to: dateTo,
    p_outlet_ids: outletIds ?? null,
  });

  if (error) throw new Error(`Failed to fetch daily trend: ${error.message}`);
  return data ?? [];
}

export async function fetchConsolidatedTopBooks(
  dateFrom: string,
  dateTo: string,
  limit: number = 10,
  outletIds?: string[]
): Promise<TopBookRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('rpc_consolidated_top_books', {
    p_date_from: dateFrom,
    p_date_to: dateTo,
    p_limit: limit,
    p_outlet_ids: outletIds ?? null,
  });

  if (error) throw new Error(`Failed to fetch top books: ${error.message}`);
  return data ?? [];
}

export async function fetchConsolidatedDashboard(
  filters: ConsolidatedReportFilters
): Promise<ConsolidatedDashboard> {
  const { dateRange, outletIds } = filters;

  // Fetch all reports in parallel
  const [sales, inventory, dailyTrend, topBooks] = await Promise.all([
    fetchConsolidatedSales(dateRange.from, dateRange.to, outletIds),
    fetchConsolidatedInventory(outletIds),
    fetchConsolidatedDailyTrend(dateRange.from, dateRange.to, outletIds),
    fetchConsolidatedTopBooks(dateRange.from, dateRange.to, 10, outletIds),
  ]);

  // Calculate grand totals
  const totals = {
    totalSales: sales.reduce((sum, r) => sum + Number(r.total_sales), 0),
    totalTransactions: sales.reduce((sum, r) => sum + Number(r.total_transactions), 0),
    totalItemsSold: sales.reduce((sum, r) => sum + Number(r.total_items_sold), 0),
    avgTransactionValue: 0,
    totalSkus: inventory.reduce((sum, r) => sum + Number(r.total_skus), 0),
    totalStock: inventory.reduce((sum, r) => sum + Number(r.total_stock), 0),
    totalStockValue: inventory.reduce((sum, r) => sum + Number(r.total_stock_value), 0),
  };
  totals.avgTransactionValue = totals.totalTransactions > 0
    ? totals.totalSales / totals.totalTransactions
    : 0;

  return { sales, inventory, dailyTrend, topBooks, totals };
}

// ── Utility: Format currency for reports ─────────────────────

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ── Utility: Group daily trend by outlet for charting ────────

export function groupTrendByOutlet(
  trend: DailyTrendRow[]
): Map<string, { dates: string[]; totals: number[]; name: string }> {
  const grouped = new Map<string, { dates: string[]; totals: number[]; name: string }>();

  for (const row of trend) {
    if (!grouped.has(row.outlet_id)) {
      grouped.set(row.outlet_id, { dates: [], totals: [], name: row.outlet_name });
    }
    const entry = grouped.get(row.outlet_id)!;
    entry.dates.push(row.sale_date);
    entry.totals.push(Number(row.daily_total));
  }

  return grouped;
}
