export interface BackupData {
  version: string;
  exported_at: string;
  outlet_id: string;
  outlet_name: string;
  tables: {
    outlet: any[];
    staff: any[];
    inventory: any[];
    stock_movements: any[];
    transactions: any[];
    transaction_items: any[];
    payments: any[];
    receipts: any[];
    suppliers: any[];
    purchase_orders: any[];
    purchase_order_items: any[];
    consignors: any[];
    consignment_settlements: any[];
    notifications: any[];
    reading_sessions: any[];
    outlet_transfers: any[];
    outlet_transfer_items: any[];
  };
  yjs_catalog: {
    books: any[];
    series: any[];
    users: any[];
  };
}

export type ExportFormat = 'json' | 'sql';
