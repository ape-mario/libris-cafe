// ── Row types returned by consolidated RPCs ──────────────────

export interface ConsolidatedSalesRow {
  outlet_id: string;
  outlet_name: string;
  total_sales: number;
  total_transactions: number;
  total_items_sold: number;
  avg_transaction_value: number;
}

export interface ConsolidatedInventoryRow {
  outlet_id: string;
  outlet_name: string;
  total_skus: number;
  total_stock: number;
  total_stock_value: number;
}

export interface DailyTrendRow {
  sale_date: string;
  outlet_id: string;
  outlet_name: string;
  daily_total: number;
  daily_transactions: number;
}

export interface TopBookRow {
  book_id: string;
  title: string;
  total_sold: number;
  total_revenue: number;
  outlet_count: number;
}

// ── Filters & dashboard aggregate ────────────────────────────

export interface DateRange {
  from: string;  // ISO date string (YYYY-MM-DD)
  to: string;
}

export interface ConsolidatedReportFilters {
  dateRange: DateRange;
  outletIds?: string[];  // null = all outlets
}

export interface ConsolidatedDashboard {
  sales: ConsolidatedSalesRow[];
  inventory: ConsolidatedInventoryRow[];
  dailyTrend: DailyTrendRow[];
  topBooks: TopBookRow[];
  totals: {
    totalSales: number;
    totalTransactions: number;
    totalItemsSold: number;
    avgTransactionValue: number;
    totalSkus: number;
    totalStock: number;
    totalStockValue: number;
  };
}
