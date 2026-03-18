export interface OpenLibraryResult {
  title: string;
  authors: string[];
  isbn: string | undefined;
  coverUrl: string | undefined;
  publishYear: number | undefined;
}

export async function searchOpenLibrary(query: string): Promise<OpenLibraryResult[]> {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=10&fields=title,author_name,isbn,cover_i,first_publish_year`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return [];

    const data = await res.json();

    return (data.docs || []).map((doc: any) => ({
      title: doc.title || 'Unknown',
      authors: doc.author_name || [],
      isbn: doc.isbn?.[0],
      coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : undefined,
      publishYear: doc.first_publish_year
    }));
  } catch {
    // Network error, timeout, or abort — return empty results
    return [];
  }
}

export async function lookupByISBN(isbn: string): Promise<OpenLibraryResult | null> {
  const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = await res.json();
    const entry = data[`ISBN:${isbn}`];
    if (!entry) return null;

    return {
      title: entry.title || 'Unknown',
      authors: (entry.authors || []).map((a: any) => a.name),
      isbn,
      coverUrl: entry.cover?.medium,
      publishYear: entry.publish_date ? parseInt(entry.publish_date) : undefined
    };
  } catch {
    return null;
  }
}
