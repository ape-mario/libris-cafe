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

export interface CheckoutRequest {
  cart: Cart;
  paymentMethod: 'cash';
  staffId: string;
  outletId: string;
  customerName?: string;
  customerContact?: string;
  notes?: string;
}
