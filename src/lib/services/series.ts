import { q, type Series } from '$lib/db';

export function createSeries(name: string, description?: string): Series {
	const series: Series = { id: crypto.randomUUID(), name, description };
	q.setItem('series', series.id, series as unknown as Record<string, unknown>);
	return series;
}

export function getAllSeries(): Series[] {
	const all = q.getAll('series') as unknown as Series[];
	return all.sort((a, b) => a.name.localeCompare(b.name));
}

export function deleteSeries(id: string): void {
	// Unlink books from this series
	const books = q.filter('books', (b) => b.seriesId === id);
	for (const book of books) {
		q.updateItem('books', book.id as string, {
			seriesId: undefined,
			seriesOrder: undefined
		});
	}
	q.deleteItem('series', id);
}
