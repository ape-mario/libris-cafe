import type { Cart, CartItem } from './types';
import type { Inventory } from '../inventory/types';
import type { Book } from '$lib/db';

export function createCart(taxRate: number = 11): Cart {
  return { items: [], subtotal: 0, discount: 0, tax: 0, taxRate, total: 0 };
}

function recalculate(cart: Cart): Cart {
  const subtotal = cart.items.reduce((sum, item) => sum + item.total, 0);
  const discount = cart.discount;
  const taxable = subtotal - discount;
  const tax = Math.round(taxable * (cart.taxRate / 100));
  const total = taxable + tax;
  return { ...cart, subtotal, tax, total };
}

export function addToCart(cart: Cart, inventory: Inventory, book: Book): Cart {
  const existing = cart.items.find(i => i.inventory.id === inventory.id);
  if (existing) {
    const items = cart.items.map(item =>
      item.inventory.id === inventory.id
        ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.unitPrice - item.discount }
        : item
    );
    return recalculate({ ...cart, items });
  }
  const price = inventory.price ?? 0;
  const newItem: CartItem = { inventory, book, quantity: 1, unitPrice: price, discount: 0, total: price };
  return recalculate({ ...cart, items: [...cart.items, newItem] });
}

export function removeFromCart(cart: Cart, inventoryId: string): Cart {
  const items = cart.items.filter(i => i.inventory.id !== inventoryId);
  return recalculate({ ...cart, items });
}

export function updateQuantity(cart: Cart, inventoryId: string, quantity: number): Cart {
  if (quantity <= 0) return removeFromCart(cart, inventoryId);
  const items = cart.items.map(item =>
    item.inventory.id === inventoryId
      ? { ...item, quantity, total: quantity * item.unitPrice - item.discount }
      : item
  );
  return recalculate({ ...cart, items });
}

export function clearCart(cart: Cart): Cart {
  return recalculate({ ...cart, items: [], discount: 0 });
}
