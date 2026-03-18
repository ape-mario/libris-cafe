import { db, type Book } from '$lib/db';

type NewBook = Pick<Book, 'title' | 'authors' | 'categories'> &
  Partial<Pick<Book, 'isbn' | 'coverUrl' | 'coverBlob' | 'seriesId' | 'seriesOrder'>>;

export async function hasBookWithISBN(isbn: string): Promise<boolean> {
  const existing = await db.books.where('isbn').equals(isbn).first();
  return !!existing;
}

export async function addBook(data: NewBook, allowDuplicate = false): Promise<Book | null> {
  if (data.isbn && !allowDuplicate) {
    if (await hasBookWithISBN(data.isbn)) return null;
  }

  const book: Book = {
    id: crypto.randomUUID(),
    title: data.title,
    authors: data.authors,
    isbn: data.isbn,
    coverUrl: data.coverUrl,
    coverBlob: data.coverBlob,
    categories: data.categories,
    seriesId: data.seriesId,
    seriesOrder: data.seriesOrder,
    dateAdded: new Date(),
    dateModified: new Date()
  };

  await db.books.add(book);
  return book;
}

export async function updateBook(id: string, data: Partial<Omit<Book, 'id'>>): Promise<void> {
  await db.books.update(id, { ...data, dateModified: new Date() });
}

export async function deleteBook(id: string): Promise<void> {
  await db.userBookData.where('bookId').equals(id).delete();
  await db.books.delete(id);
}

export async function getBookById(id: string): Promise<Book | undefined> {
  return db.books.get(id);
}

export async function getBooks(): Promise<Book[]> {
  return db.books.orderBy('dateAdded').reverse().toArray();
}

export async function searchBooks(query: string): Promise<Book[]> {
  const lower = query.toLowerCase();
  return db.books.filter(
    (book) =>
      book.title.toLowerCase().includes(lower) ||
      book.authors.some((a) => a.toLowerCase().includes(lower))
  ).toArray();
}

export async function getBooksByCategory(category: string): Promise<Book[]> {
  return db.books.where('categories').equals(category).toArray();
}

export async function getBooksBySeries(seriesId: string): Promise<Book[]> {
  return db.books.where('seriesId').equals(seriesId).sortBy('seriesOrder');
}
