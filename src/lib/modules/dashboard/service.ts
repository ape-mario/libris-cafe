import { getSupabase } from '$lib/supabase/client';
import type { TodayMetrics, SalesTrendPoint, TopBook } from './types';

// Always queries live data — today's metrics must be fresh
export async function fetchTodayMetrics(outletId: string): Promise<TodayMetrics> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('get_today_metrics', {
    p_outlet_id: outletId,
  });
  if (error) throw new Error(`Failed to fetch metrics: ${error.message}`);
  return data as TodayMetrics;
}

export async function fetchYesterdayMetrics(outletId: string): Promise<TodayMetrics> {
  const supabase = getSupabase();
  // Use the sales trend RPC for yesterday's date to get comparable metrics
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toISOString().slice(0, 10);

  const { data, error } = await supabase.rpc('get_sales_trend', {
    p_outlet_id: outletId,
    p_start_date: yStr,
    p_end_date: yStr,
  });

  if (error) throw new Error(`Failed to fetch yesterday metrics: ${error.message}`);
  const point = (data ?? [])[0] as SalesTrendPoint | undefined;
  return {
    total_sales: point?.total_sales ?? 0,
    transaction_count: point?.transaction_count ?? 0,
    total_margin: 0,
    low_stock_count: 0,
    out_of_stock_count: 0,
    payment_breakdown: null,
  };
}

// For small cafes (<100 tx/day): live queries are fast enough (<100ms)
// For high-traffic: set useLiveQuery=false to use materialized views
// (requires pg_cron to be enabled for periodic refresh)

export async function fetchSalesTrend(
  outletId: string,
  startDate: string,
  endDate: string,
  useLiveQuery: boolean = true
): Promise<SalesTrendPoint[]> {
  const supabase = getSupabase();
  const rpcName = useLiveQuery ? 'get_sales_trend' : 'get_sales_trend_mv';
  const { data, error } = await supabase.rpc(rpcName, {
    p_outlet_id: outletId,
    p_start_date: startDate,
    p_end_date: endDate,
  });
  if (error) throw new Error(`Failed to fetch sales trend: ${error.message}`);
  return (data ?? []) as SalesTrendPoint[];
}

export async function fetchTopBooks(
  outletId: string,
  startDate: string,
  endDate: string,
  limit: number = 10,
  useLiveQuery: boolean = true
): Promise<TopBook[]> {
  const supabase = getSupabase();
  const rpcName = useLiveQuery ? 'get_top_books' : 'get_top_books_mv';
  const { data, error } = await supabase.rpc(rpcName, {
    p_outlet_id: outletId,
    p_start_date: startDate,
    p_end_date: endDate,
    p_limit: limit,
  });
  if (error) throw new Error(`Failed to fetch top books: ${error.message}`);
  return (data ?? []) as TopBook[];
}

export function getDateRange(range: '7d' | '30d' | '12m'): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  switch (range) {
    case '7d':
      start.setDate(end.getDate() - 6);
      break;
    case '30d':
      start.setDate(end.getDate() - 29);
      break;
    case '12m':
      start.setMonth(end.getMonth() - 11);
      start.setDate(1);
      break;
  }
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export async function refreshDashboardViews(): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('refresh_dashboard_views');
  if (error) console.warn('Failed to refresh dashboard views:', error.message);
}
