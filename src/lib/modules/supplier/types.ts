export interface Supplier {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  api_endpoint: string | null;
  api_key_encrypted: string | null;
  lead_time_days: number;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export type PurchaseOrderStatus = 'draft' | 'ordered' | 'received' | 'cancelled';

export interface PurchaseOrder {
  id: string;
  supplier_id: string;
  outlet_id: string;
  status: PurchaseOrderStatus;
  total: number;
  notes: string | null;
  ordered_at: string | null;
  received_at: string | null;
  created_by: string | null;
  created_at: string;
  // Joined data
  supplier?: Supplier;
  items?: PurchaseOrderItem[];
}

export interface PurchaseOrderItem {
  id: string;
  purchase_order_id: string;
  book_id: string | null;
  isbn: string | null;
  title: string;
  quantity: number;
  unit_price: number;
  received_quantity: number;
}

export interface NewSupplier {
  name: string;
  contact_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  api_endpoint?: string;
  lead_time_days?: number;
  notes?: string;
}

export interface NewPurchaseOrder {
  supplier_id: string;
  outlet_id: string;
  notes?: string;
  created_by: string;
  items: NewPurchaseOrderItem[];
}

export interface NewPurchaseOrderItem {
  book_id?: string;
  isbn?: string;
  title: string;
  quantity: number;
  unit_price: number;
}
