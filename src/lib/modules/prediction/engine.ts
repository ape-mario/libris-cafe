import { getSupabase } from '$lib/supabase/client';
import type {
  SalesVelocity,
  RestockRecommendation,
  PredictionSummary,
  DemandForecast,
  Urgency,
} from './types';

/**
 * Fetch sales velocity data from the materialized view.
 */
export async function getSalesVelocity(outletId: string): Promise<SalesVelocity[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('mv_sales_velocity')
    .select('*')
    .eq('outlet_id', outletId);

  if (error) throw new Error(`Failed to fetch sales velocity: ${error.message}`);
  return (data ?? []) as SalesVelocity[];
}

/**
 * Get restock recommendations from the RPC function.
 */
export async function getRestockRecommendations(
  outletId: string,
  leadTimeDays: number = 7
): Promise<RestockRecommendation[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('get_restock_recommendations', {
    p_outlet_id: outletId,
    p_lead_time_days: leadTimeDays,
  });

  if (error) throw new Error(`Failed to fetch restock recommendations: ${error.message}`);
  return (data ?? []) as RestockRecommendation[];
}

/**
 * Refresh the materialized view (call periodically or on-demand).
 */
export async function refreshVelocityData(): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('refresh_sales_velocity');
  if (error) throw new Error(`Failed to refresh velocity data: ${error.message}`);
}

/**
 * Compute demand forecast using weighted moving average.
 * Gives more weight to recent sales (7d) vs older (30d).
 *
 * Client-side computation from velocity data.
 */
export function computeDemandForecast(velocityData: SalesVelocity[]): DemandForecast[] {
  return velocityData
    .filter(v => v.units_sold_30d > 0)
    .map(v => {
      const dailyRate30d = v.avg_daily_sales;
      const dailyRate7d = v.units_sold_7d / 7;

      // Weighted: 60% recent (7d), 40% longer-term (30d)
      const weightedDailyRate = dailyRate7d * 0.6 + dailyRate30d * 0.4;

      // Determine trend by comparing 7d rate to 30d rate
      const ratio = dailyRate30d > 0 ? dailyRate7d / dailyRate30d : 1;
      let trend: 'rising' | 'stable' | 'declining';
      if (ratio > 1.2) trend = 'rising';
      else if (ratio < 0.8) trend = 'declining';
      else trend = 'stable';

      return {
        inventory_id: v.inventory_id,
        book_id: v.book_id,
        forecast_7d: Math.round(weightedDailyRate * 7 * 10) / 10,
        forecast_30d: Math.round(weightedDailyRate * 30 * 10) / 10,
        trend,
      };
    });
}

/**
 * Compute prediction summary from velocity data.
 */
export function computeSummary(
  velocityData: SalesVelocity[],
  recommendations: RestockRecommendation[]
): PredictionSummary {
  const urgencyCounts = recommendations.reduce(
    (acc, r) => {
      acc[r.urgency] = (acc[r.urgency] || 0) + 1;
      return acc;
    },
    {} as Record<Urgency, number>
  );

  const itemsWithStockout = velocityData.filter(v => v.days_until_stockout !== null);
  const avgStockout =
    itemsWithStockout.length > 0
      ? itemsWithStockout.reduce((sum, v) => sum + (v.days_until_stockout ?? 0), 0) / itemsWithStockout.length
      : null;

  // Top 5 sellers by 30d volume
  const topSellers = [...velocityData]
    .sort((a, b) => b.units_sold_30d - a.units_sold_30d)
    .slice(0, 5)
    .map(v => ({
      book_id: v.book_id,
      units_sold_30d: v.units_sold_30d,
    }));

  return {
    total_items: velocityData.length,
    critical_count: urgencyCounts.critical ?? 0,
    urgent_count: urgencyCounts.urgent ?? 0,
    warning_count: urgencyCounts.warning ?? 0,
    avg_days_until_stockout: avgStockout !== null ? Math.round(avgStockout) : null,
    top_sellers: topSellers,
  };
}

/**
 * Classify urgency from days_until_stockout and stock levels.
 * Used client-side when RPC isn't available.
 */
export function classifyUrgency(
  currentStock: number,
  minStock: number,
  daysUntilStockout: number | null,
  leadTimeDays: number = 7
): Urgency {
  if (currentStock <= 0) return 'critical';
  if (daysUntilStockout !== null && daysUntilStockout <= leadTimeDays) return 'urgent';
  if (daysUntilStockout !== null && daysUntilStockout <= leadTimeDays * 2) return 'warning';
  if (currentStock <= minStock) return 'low';
  return 'ok';
}

/**
 * Calculate suggested restock quantity.
 */
export function suggestRestockQuantity(
  avgDailySales: number,
  leadTimeDays: number = 7,
  bufferDays: number = 14,
  minStock: number = 1
): number {
  if (avgDailySales <= 0) return minStock;
  return Math.ceil(avgDailySales * (leadTimeDays + bufferDays));
}
