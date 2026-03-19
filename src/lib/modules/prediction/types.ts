export interface SalesVelocity {
  inventory_id: string;
  book_id: string;
  outlet_id: string;
  current_stock: number;
  min_stock: number;
  units_sold_30d: number;
  units_sold_7d: number;
  avg_daily_sales: number;
  days_until_stockout: number | null;
}

export type Urgency = 'critical' | 'urgent' | 'warning' | 'low' | 'ok';

export interface RestockRecommendation {
  inventory_id: string;
  book_id: string;
  current_stock: number;
  min_stock: number;
  avg_daily_sales: number;
  days_until_stockout: number | null;
  units_sold_30d: number;
  units_sold_7d: number;
  suggested_quantity: number;
  urgency: Urgency;
  restock_score: number;
  /** Denormalized book title from Yjs */
  book_title?: string;
}

export interface PredictionSummary {
  total_items: number;
  critical_count: number;
  urgent_count: number;
  warning_count: number;
  avg_days_until_stockout: number | null;
  top_sellers: { book_id: string; units_sold_30d: number; book_title?: string }[];
}

export interface DemandForecast {
  inventory_id: string;
  book_id: string;
  /** Projected units to sell in next 7 days based on weighted moving average. */
  forecast_7d: number;
  /** Projected units to sell in next 30 days. */
  forecast_30d: number;
  /** Trend direction. */
  trend: 'rising' | 'stable' | 'declining';
}
