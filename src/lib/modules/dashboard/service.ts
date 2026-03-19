import { getSupabase } from '$lib/supabase/client';
import type { TodayMetrics, SalesTrendPoint, TopBook } from './types';

export async function fetchTodayMetrics(outletId: string): Promise<TodayMetrics> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('get_today_metrics', {
    p_outlet_id: outletId,
  });
  if (error) throw new Error(`Failed to fetch metrics: ${error.message}`);
  return data as TodayMetrics;
}

export async function fetchSalesTrend(
  outletId: string,
  startDate: string,
  endDate: string
): Promise<SalesTrendPoint[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('get_sales_trend', {
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
  limit: number = 10
): Promise<TopBook[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('get_top_books', {
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
