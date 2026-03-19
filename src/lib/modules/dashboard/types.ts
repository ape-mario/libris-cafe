export interface TodayMetrics {
  total_sales: number;
  transaction_count: number;
  total_margin: number;
  low_stock_count: number;
  out_of_stock_count: number;
  payment_breakdown: PaymentBreakdown[] | null;
}

export interface PaymentBreakdown {
  method: string;
  total: number;
  count: number;
}

export interface SalesTrendPoint {
  date: string;
  total_sales: number;
  transaction_count: number;
}

export interface TopBook {
  book_id: string;
  title: string;
  total_sold: number;
  total_revenue: number;
}

export type DateRange = '7d' | '30d' | '12m';

export interface DashboardState {
  metrics: TodayMetrics | null;
  salesTrend: SalesTrendPoint[];
  topBooks: TopBook[];
  dateRange: DateRange;
  loading: boolean;
  error: string | null;
}
