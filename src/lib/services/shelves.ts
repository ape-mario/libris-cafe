import { db, type Shelf } from '$lib/db';

export async function createShelf(userId: string, name: string): Promise<Shelf> {
  const shelf: Shelf = {
    id: crypto.randomUUID(),
    userId,
    name,
    bookIds: [],
    dateCreated: new Date()
  };
  await db.shelves.add(shelf);
  return shelf;
}

export async function getUserShelves(userId: string): Promise<Shelf[]> {
  return db.shelves.where('userId').equals(userId).sortBy('name');
}

export async function addBookToShelf(shelfId: string, bookId: string): Promise<void> {
  const shelf = await db.shelves.get(shelfId);
  if (!shelf || shelf.bookIds.includes(bookId)) return;
  await db.shelves.update(shelfId, { bookIds: [...shelf.bookIds, bookId] });
}

export async function removeBookFromShelf(shelfId: string, bookId: string): Promise<void> {
  const shelf = await db.shelves.get(shelfId);
  if (!shelf) return;
  await db.shelves.update(shelfId, { bookIds: shelf.bookIds.filter(id => id !== bookId) });
}

export async function deleteShelf(id: string): Promise<void> {
  await db.shelves.delete(id);
}

export async function renameShelf(id: string, name: string): Promise<void> {
  await db.shelves.update(id, { name });
}

export async function getShelvesForBook(userId: string, bookId: string): Promise<Shelf[]> {
  const shelves = await getUserShelves(userId);
  return shelves.filter(s => s.bookIds.includes(bookId));
}
