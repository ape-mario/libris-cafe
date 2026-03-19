import { describe, it, expect } from 'vitest';
import { createCart, addToCart, removeFromCart, updateQuantity, clearCart, setCartDiscount, setItemDiscount } from './cart';
import type { Inventory } from '../inventory/types';
import type { Book } from '$lib/db';

const mockBook: Book = {
  id: 'book-1', title: 'Atomic Habits', authors: ['James Clear'],
  categories: ['self-help'], dateAdded: '', dateModified: '',
};

const mockInventory: Inventory = {
  id: 'inv-1', book_id: 'book-1', outlet_id: 'outlet-1',
  type: 'for_sale', source: 'supplier', is_preloved: false,
  price: 89000, cost_price: 60000, stock: 10, min_stock: 1,
  location: 'Rak A1', condition: 'new',
  created_at: '', updated_at: '',
};

describe('Cart', () => {
  it('should create an empty cart', () => {
    const cart = createCart(11);
    expect(cart.items).toHaveLength(0);
    expect(cart.total).toBe(0);
    expect(cart.taxRate).toBe(11);
  });

  it('should add item and calculate totals', () => {
    let cart = createCart(11);
    cart = addToCart(cart, mockInventory, mockBook);
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].quantity).toBe(1);
    expect(cart.items[0].unitPrice).toBe(89000);
    expect(cart.subtotal).toBe(89000);
    expect(cart.tax).toBe(9790);
    expect(cart.total).toBe(98790);
  });

  it('should increment quantity when adding same item', () => {
    let cart = createCart(0);
    cart = addToCart(cart, mockInventory, mockBook);
    cart = addToCart(cart, mockInventory, mockBook);
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].quantity).toBe(2);
    expect(cart.subtotal).toBe(178000);
  });

  it('should remove item', () => {
    let cart = createCart(0);
    cart = addToCart(cart, mockInventory, mockBook);
    cart = removeFromCart(cart, 'inv-1');
    expect(cart.items).toHaveLength(0);
    expect(cart.total).toBe(0);
  });

  it('should update quantity', () => {
    let cart = createCart(0);
    cart = addToCart(cart, mockInventory, mockBook);
    cart = updateQuantity(cart, 'inv-1', 5);
    expect(cart.items[0].quantity).toBe(5);
    expect(cart.subtotal).toBe(445000);
  });

  it('should clear cart', () => {
    let cart = createCart(0);
    cart = addToCart(cart, mockInventory, mockBook);
    cart = clearCart(cart);
    expect(cart.items).toHaveLength(0);
  });

  it('should apply cart discount and reduce total but not subtotal', () => {
    let cart = createCart(0);
    cart = addToCart(cart, mockInventory, mockBook);
    cart = setCartDiscount(cart, 10000);
    expect(cart.subtotal).toBe(89000);
    expect(cart.discount).toBe(10000);
    expect(cart.total).toBe(79000);
  });

  it('should apply item discount and update item total and cart total', () => {
    let cart = createCart(0);
    cart = addToCart(cart, mockInventory, mockBook);
    cart = setItemDiscount(cart, 'inv-1', 5000);
    expect(cart.items[0].discount).toBe(5000);
    expect(cart.items[0].total).toBe(84000);
    expect(cart.subtotal).toBe(84000);
    expect(cart.total).toBe(84000);
  });

  it('should not allow negative discount', () => {
    let cart = createCart(0);
    cart = addToCart(cart, mockInventory, mockBook);
    cart = setCartDiscount(cart, -5000);
    expect(cart.discount).toBe(0);
    expect(cart.total).toBe(89000);

    cart = setItemDiscount(cart, 'inv-1', -3000);
    expect(cart.items[0].discount).toBe(0);
    expect(cart.items[0].total).toBe(89000);
  });
});
