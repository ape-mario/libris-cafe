import type { Cart } from './types';
import { createCart } from './cart';

let currentCart = $state<Cart>(createCart());

export function getCart(): Cart {
  return currentCart;
}

export function setCart(cart: Cart): void {
  currentCart = cart;
}

export function resetCart(taxRate: number = 11): void {
  currentCart = createCart(taxRate);
}

export const cartStore = {
  get current() { return currentCart; },
};
