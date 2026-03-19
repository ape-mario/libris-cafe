export type RestockUrgency = 'critical' | 'urgent' | 'warning' | 'ok';

export interface RestockSuggestion {
  inventory_id: string;
  book_id: string;
  book_title: string;
  current_stock: number;
  avg_daily_sales: number;
  days_until_stockout: number | null;  // null if avg_daily_sales is 0
  lead_time_days: number;
  urgency: RestockUrgency;
  suggested_quantity: number;
  supplier_id: string | null;
  supplier_name: string | null;
}

export interface RestockInput {
  inventory_id: string;
  book_id: string;
  book_title: string;
  current_stock: number;
  min_stock: number;
  supplier_id: string | null;
  supplier_name: string | null;
  lead_time_days: number;
  /** Total units sold in the last 30 days */
  sales_last_30d: number;
}
