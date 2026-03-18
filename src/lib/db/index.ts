import Dexie, { type EntityTable } from 'dexie';
import type { User, Book, UserBookData, Series, Category, Shelf, SyncConfig } from './types';

const db = new Dexie('MyBooksDB') as Dexie & {
  users: EntityTable<User, 'id'>;
  books: EntityTable<Book, 'id'>;
  userBookData: EntityTable<UserBookData, 'id'>;
  series: EntityTable<Series, 'id'>;
  categories: EntityTable<Category, 'id'>;
  shelves: EntityTable<Shelf, 'id'>;
  syncConfig: EntityTable<SyncConfig, 'id'>;
};

db.version(1).stores({
  users: 'id, name',
  books: 'id, title, isbn, *categories, seriesId, dateAdded',
  userBookData: 'id, [userId+bookId], userId, bookId, status, isWishlist',
  series: 'id, name',
  categories: 'id, name'
});

// v2: added currentPage/totalPages to UserBookData (no index changes needed)
db.version(2).stores({});

// v3: added shelves and syncConfig tables
db.version(3).stores({
  shelves: 'id, userId, name',
  syncConfig: 'id'
});

export { db };
export type { User, Book, UserBookData, Series, Category, Shelf, SyncConfig };
