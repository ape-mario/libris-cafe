import type { Inventory } from '../inventory/types';
import type { Book } from '$lib/db';
import type { PaymentMethod } from '$lib/modules/payment/types';

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

export interface CheckoutRequest {
  cart: Cart;
  paymentMethod: PaymentMethod;
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
