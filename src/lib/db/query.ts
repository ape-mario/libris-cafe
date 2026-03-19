import * as Y from 'yjs';

/**
 * Fields that should be stored as Y.Map<string, true> for concurrent-safe set operations.
 * When read back, these Y.Maps are converted to string[].
 */
const SET_FIELDS: Record<string, string[]> = {
	shelves: ['bookIds']
};

/**
 * Convert a nested Y.Map entry back to a plain JS object.
 * Uses SET_FIELDS registry to determine which nested Y.Maps are sets.
 */
export function yMapToObject<T = Record<string, unknown>>(
	ymap: Y.Map<unknown>,
	mapName?: string,
	fieldKey?: string
): T {
	const obj: Record<string, unknown> = {};
	const setFields = mapName ? (SET_FIELDS[mapName] ?? []) : [];

	ymap.forEach((value, key) => {
		if (value instanceof Y.Map) {
			if (setFields.includes(key)) {
				// Registered set field → convert to string[]
				const keys: string[] = [];
				value.forEach((_v, k) => keys.push(k));
				obj[key] = keys;
			} else {
				// Nested object
				obj[key] = yMapToObject(value as Y.Map<unknown>);
			}
		} else if (value instanceof Y.Array) {
			obj[key] = value.toArray().map(item =>
				item instanceof Y.Map ? yMapToObject(item as Y.Map<unknown>) : item
			);
		} else {
			obj[key] = value;
		}
	});
	return obj as T;
}

/**
 * Convert a plain JS object to a nested Y.Map.
 * Handles SET_FIELDS conversion (array → Y.Map<string, true>).
 */
export function objectToYMap(
	mapName: string,
	data: Record<string, unknown>
): Y.Map<unknown> {
	const ymap = new Y.Map<unknown>();
	const setFields = SET_FIELDS[mapName] ?? [];

	for (const [key, value] of Object.entries(data)) {
		if (value === undefined) continue;
		if (setFields.includes(key) && Array.isArray(value)) {
			const setMap = new Y.Map<true>();
			for (const item of value) {
				setMap.set(String(item), true);
			}
			ymap.set(key, setMap);
		} else if (Array.isArray(value)) {
			const yarray = new Y.Array<unknown>();
			const items = value.map(item =>
				item !== null && typeof item === 'object' && !(item instanceof Date)
					? objectToYMap('', item as Record<string, unknown>)
					: item
			);
			yarray.push(items);
			ymap.set(key, yarray);
		} else if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
			const nested = new Y.Map<unknown>();
			for (const [nk, nv] of Object.entries(value as Record<string, unknown>)) {
				nested.set(nk, nv);
			}
			ymap.set(key, nested);
		} else {
			ymap.set(key, value);
		}
	}

	return ymap;
}

export function createQueryHelpers(doc: Y.Doc) {
	function getItem<T = Record<string, unknown>>(mapName: string, id: string): T | undefined {
		const map = doc.getMap(mapName);
		const entry = map.get(id);
		if (!entry || !(entry instanceof Y.Map)) return undefined;
		return yMapToObject<T>(entry as Y.Map<unknown>, mapName);
	}

	function getAll<T = Record<string, unknown>>(mapName: string): T[] {
		const map = doc.getMap(mapName);
		const results: T[] = [];
		map.forEach((value) => {
			if (value instanceof Y.Map) {
				results.push(yMapToObject<T>(value as Y.Map<unknown>, mapName));
			}
		});
		return results;
	}

	function filter<T = Record<string, unknown>>(
		mapName: string,
		predicate: (item: T) => boolean
	): T[] {
		return getAll<T>(mapName).filter(predicate);
	}

	function setItem(
		mapName: string,
		id: string,
		data: Record<string, any>
	): void {
		doc.transact(() => {
			const map = doc.getMap(mapName);
			const ymap = objectToYMap(mapName, data);
			map.set(id, ymap);
		});
	}

	function updateItem(
		mapName: string,
		id: string,
		updates: Record<string, unknown>
	): void {
		doc.transact(() => {
			const map = doc.getMap(mapName);
			const existing = map.get(id);
			if (!existing || !(existing instanceof Y.Map)) return;

			const entry = existing as Y.Map<unknown>;
			const setFields = SET_FIELDS[mapName] ?? [];

			for (const [key, value] of Object.entries(updates)) {
				if (setFields.includes(key) && Array.isArray(value)) {
					const setMap = new Y.Map<true>();
					for (const item of value) {
						setMap.set(String(item), true);
					}
					entry.set(key, setMap);
				} else if (Array.isArray(value)) {
					const existing = entry.get(key);
					if (existing instanceof Y.Array) {
						existing.delete(0, existing.length);
						existing.push(value);
					} else {
						const yarray = new Y.Array<unknown>();
						yarray.push(value);
						entry.set(key, yarray);
					}
				} else if (value === undefined) {
					entry.delete(key);
				} else {
					entry.set(key, value);
				}
			}
		});
	}

	function deleteItem(mapName: string, id: string): void {
		doc.transact(() => {
			const map = doc.getMap(mapName);
			map.delete(id);
		});
	}

	function observe(
		mapName: string,
		callback: (changes: { action: string; key: string }[]) => void
	): () => void {
		const map = doc.getMap(mapName);
		const handler = (events: Y.YEvent<any>[]) => {
			const changes: { action: string; key: string }[] = [];
			const seen = new Set<string>();
			for (const event of events) {
				if (event.target === map && event instanceof Y.YMapEvent) {
					event.changes.keys.forEach((change, key) => {
						if (!seen.has(key)) {
							seen.add(key);
							changes.push({ action: change.action, key });
						}
					});
				} else {
					let target: Y.AbstractType<any> | null = event.target as Y.AbstractType<any>;
					while (target && target !== map) {
						const parent = target.parent;
						if (parent === map && parent instanceof Y.Map) {
							(parent as Y.Map<unknown>).forEach((value, key) => {
								if (value === target && !seen.has(key)) {
									seen.add(key);
									changes.push({ action: 'update', key });
								}
							});
						}
						target = parent as Y.AbstractType<any> | null;
					}
				}
			}
			if (changes.length > 0) {
				callback(changes);
			}
		};
		map.observeDeep(handler);
		return () => map.unobserveDeep(handler);
	}

	function getRawEntry(mapName: string, id: string): Y.Map<unknown> | undefined {
		const map = doc.getMap(mapName);
		const entry = map.get(id);
		if (!entry || !(entry instanceof Y.Map)) return undefined;
		return entry as Y.Map<unknown>;
	}

	return { getItem, getAll, filter, setItem, updateItem, deleteItem, observe, getRawEntry };
}
