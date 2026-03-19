export interface Outlet {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  tax_rate: number;
  created_at: string;
}

export interface OutletTransfer {
  id: string;
  from_outlet_id: string;
  to_outlet_id: string;
  status: TransferStatus;
  requested_by: string;
  approved_by: string | null;
  shipped_by: string | null;
  received_by: string | null;
  notes: string | null;
  requested_at: string;
  approved_at: string | null;
  shipped_at: string | null;
  received_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields (populated by service)
  from_outlet?: Outlet;
  to_outlet?: Outlet;
  items?: OutletTransferItem[];
  requested_by_staff?: { id: string; name: string };
}

export type TransferStatus = 'requested' | 'approved' | 'shipped' | 'received' | 'cancelled';

export interface OutletTransferItem {
  id: string;
  transfer_id: string;
  inventory_id: string;
  book_id: string;
  title: string;
  quantity_requested: number;
  quantity_shipped: number;
  quantity_received: number;
}

export interface CreateTransferRequest {
  from_outlet_id: string;
  to_outlet_id: string;
  items: {
    inventory_id: string;
    book_id: string;
    title: string;
    quantity_requested: number;
  }[];
  notes?: string;
}

export interface ConsolidatedSalesRow {
  outlet_id: string;
  outlet_name: string;
  total_sales: number;
  total_transactions: number;
  total_items_sold: number;
  avg_transaction_value: number;
  total_tax: number;
  total_discount: number;
  net_revenue: number;
}

export interface ConsolidatedInventoryRow {
  outlet_id: string;
  outlet_name: string;
  total_skus: number;
  total_stock: number;
  total_stock_value: number;
  low_stock_count: number;
  out_of_stock_count: number;
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
  total_quantity: number;
  total_revenue: number;
  outlet_count: number;
}
