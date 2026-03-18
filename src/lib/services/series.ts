import { q, type Series } from '$lib/db';

export function createSeries(name: string, description?: string): Series {
	const series: Series = { id: crypto.randomUUID(), name, description };
	q.setItem('series', series.id, series);
	return series;
}

export function getAllSeries(): Series[] {
	return q.getAll<Series>('series').sort((a, b) => a.name.localeCompare(b.name));
}

export function deleteSeries(id: string): void {
	const books = q.filter<{ id: string; seriesId?: string }>('books', (b) => b.seriesId === id);
	for (const book of books) {
		q.updateItem('books', book.id, { seriesId: undefined, seriesOrder: undefined });
	}
	q.deleteItem('series', id);
}
