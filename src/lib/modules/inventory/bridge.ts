import { getBookById } from '$lib/services/books';
import type { Book } from '$lib/db';
import type { Inventory } from './types';

export interface EnrichedInventory extends Inventory {
  book: Book | null;
}

export function enrichInventory(items: Inventory[]): EnrichedInventory[] {
  return items.map(item => ({
    ...item,
    book: getBookById(item.book_id) ?? null,
  }));
}

export function enrichSingle(item: Inventory): EnrichedInventory {
  return {
    ...item,
    book: getBookById(item.book_id) ?? null,
  };
}
