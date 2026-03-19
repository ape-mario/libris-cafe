import type { DashboardState, DateRange } from './types';
import { fetchTodayMetrics, fetchYesterdayMetrics, fetchSalesTrend, fetchTopBooks, getDateRange } from './service';

let state = $state<DashboardState>({
  metrics: null,
  yesterdayMetrics: null,
  salesTrend: [],
  topBooks: [],
  dateRange: '7d',
  loading: false,
  error: null,
});

export function getDashboardState(): DashboardState {
  return state;
}

export function setDateRange(range: DateRange): void {
  state = { ...state, dateRange: range };
}

export async function loadDashboard(outletId: string): Promise<void> {
  state = { ...state, loading: true, error: null };

  try {
    const { start, end } = getDateRange(state.dateRange);

    const [metrics, yesterdayMetrics, salesTrend, topBooks] = await Promise.all([
      fetchTodayMetrics(outletId),
      fetchYesterdayMetrics(outletId),
      fetchSalesTrend(outletId, start, end),
      fetchTopBooks(outletId, start, end, 10),
    ]);

    state = { ...state, metrics, yesterdayMetrics, salesTrend, topBooks, loading: false };
  } catch (err) {
    state = {
      ...state,
      loading: false,
      error: err instanceof Error ? err.message : 'Failed to load dashboard',
    };
  }
}

export async function refreshMetrics(outletId: string): Promise<void> {
  try {
    const metrics = await fetchTodayMetrics(outletId);
    state = { ...state, metrics };
  } catch {
    // Silent fail for realtime refresh
  }
}
