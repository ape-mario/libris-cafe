import { db } from '$lib/db';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bytes = atob(data);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export async function exportData(): Promise<string> {
  const [users, rawBooks, userBookData, series, categories, shelves] = await Promise.all([
    db.users.toArray(),
    db.books.toArray(),
    db.userBookData.toArray(),
    db.series.toArray(),
    db.categories.toArray(),
    db.shelves.toArray()
  ]);

  const books = await Promise.all(
    rawBooks.map(async ({ coverBlob, ...rest }) => ({
      ...rest,
      coverBase64: coverBlob ? await blobToBase64(coverBlob) : undefined
    }))
  );

  return JSON.stringify({ version: 3, exportedAt: new Date().toISOString(), users, books, userBookData, series, categories, shelves }, null, 2);
}

export async function importData(json: string): Promise<void> {
  const data = JSON.parse(json);

  if (!data.version || !data.books) {
    throw new Error('Invalid backup file');
  }

  await db.transaction('rw', [db.users, db.books, db.userBookData, db.series, db.categories, db.shelves], async () => {
    if (data.users) await db.users.bulkPut(data.users);
    if (data.books) {
      const books = data.books.map((b: any) => {
        const { coverBase64, ...rest } = b;
        return {
          ...rest,
          coverBlob: coverBase64 ? base64ToBlob(coverBase64) : undefined,
          dateAdded: new Date(b.dateAdded),
          dateModified: new Date(b.dateModified)
        };
      });
      await db.books.bulkPut(books);
    }
    if (data.userBookData) await db.userBookData.bulkPut(data.userBookData);
    if (data.series) await db.series.bulkPut(data.series);
    if (data.categories) await db.categories.bulkPut(data.categories);
    if (data.shelves) {
      const shelves = data.shelves.map((s: any) => ({
        ...s,
        dateCreated: new Date(s.dateCreated)
      }));
      await db.shelves.bulkPut(shelves);
    }
  });
}
