import type { Inventory } from '../inventory/types';
import type { Book } from '$lib/db';

export interface CartItem {
  inventory: Inventory;
  book: Book;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
}

export interface Cart {
  items: CartItem[];
  subtotal: number;
  discount: number;
  tax: number;
  taxRate: number;
  total: number;
}

export type PaymentMethodType = 'cash' | 'qris' | 'ewallet' | 'bank_transfer' | 'card';

export interface CheckoutRequest {
  cart: Cart;
  paymentMethod: PaymentMethodType;
  staffId: string;
  outletId: string;
  customerName?: string;
  customerContact?: string;
  notes?: string;
}

export interface CheckoutResult {
  transactionId: string | null;
  offlineId: string;
  synced: boolean;
  requiresPayment: boolean;  // true for digital methods
  orderId?: string;
}
