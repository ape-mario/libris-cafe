export type InventoryType = 'for_sale' | 'read_in_store' | 'both';
export type BookSource = 'supplier' | 'owner' | 'consignment' | 'buyback';
export type BookCondition = 'new' | 'good' | 'fair';
export type StockMovementType =
  | 'purchase_in' | 'sale_out' | 'return_in' | 'return_out'
  | 'adjustment' | 'void_restore' | 'consignment_in'
  | 'consignment_return' | 'buyback_in';

export interface Inventory {
  id: string;
  book_id: string;
  outlet_id: string;
  type: InventoryType;
  source: BookSource;
  is_preloved: boolean;
  price: number | null;
  cost_price: number | null;
  stock: number;
  min_stock: number;
  location: string | null;
  condition: BookCondition;
  created_at: string;
  updated_at: string;
}

export interface StockMovement {
  id: string;
  inventory_id: string;
  type: StockMovementType;
  quantity: number;
  reference_id: string | null;
  reason: string | null;
  staff_id: string;
  created_at: string;
}

export interface NewInventoryItem {
  book_id: string;
  outlet_id: string;
  type: InventoryType;
  source: BookSource;
  is_preloved: boolean;
  price: number | null;
  cost_price: number | null;
  stock: number;
  min_stock?: number;
  location?: string;
  condition: BookCondition;
}
