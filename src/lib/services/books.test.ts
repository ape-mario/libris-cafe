import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '$lib/db';
import { addBook, updateBook, deleteBook, getBooks, getBookById, searchBooks } from './books';

beforeEach(async () => {
  await db.books.clear();
  await db.userBookData.clear();
  await db.categories.clear();
  await db.series.clear();
});

describe('Book service', () => {
  it('should add a book with auto-generated fields', async () => {
    const book = await addBook({ title: 'Dune', authors: ['Frank Herbert'], categories: ['sci-fi'] });
    expect(book.id).toBeDefined();
    expect(book.dateAdded).toBeInstanceOf(Date);
    expect(book.dateModified).toBeInstanceOf(Date);
  });

  it('should detect duplicate by ISBN', async () => {
    await addBook({ title: 'Dune', authors: ['Frank Herbert'], categories: [], isbn: '9780441013593' });
    const duplicate = await addBook({ title: 'Dune 2', authors: ['Frank Herbert'], categories: [], isbn: '9780441013593' });
    expect(duplicate).toBeNull();
  });

  it('should update a book', async () => {
    const book = await addBook({ title: 'Duen', authors: ['Frank Herbert'], categories: [] });
    await updateBook(book!.id, { title: 'Dune' });
    const updated = await getBookById(book!.id);
    expect(updated?.title).toBe('Dune');
  });

  it('should delete a book and its user data', async () => {
    const book = await addBook({ title: 'Dune', authors: ['Frank Herbert'], categories: [] });
    await db.userBookData.add({
      id: 'ubd1', userId: 'u1', bookId: book!.id, status: 'reading', isWishlist: false
    });
    await deleteBook(book!.id);
    expect(await getBookById(book!.id)).toBeUndefined();
    expect(await db.userBookData.where('bookId').equals(book!.id).count()).toBe(0);
  });

  it('should search books by title', async () => {
    await addBook({ title: 'Dune', authors: ['Frank Herbert'], categories: [] });
    await addBook({ title: 'Neuromancer', authors: ['William Gibson'], categories: [] });
    const results = await searchBooks('dune');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Dune');
  });

  it('should get all books sorted by dateAdded desc', async () => {
    const bookA = await addBook({ title: 'A', authors: [], categories: [] });
    // Ensure B has a later dateAdded so it sorts first in reverse order
    await db.books.update(bookA!.id, { dateAdded: new Date('2024-01-01') });
    await addBook({ title: 'B', authors: [], categories: [] });
    const books = await getBooks();
    expect(books[0].title).toBe('B');
    expect(books[1].title).toBe('A');
  });
});
