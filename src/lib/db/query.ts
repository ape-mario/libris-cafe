import * as Y from 'yjs';

/**
 * Fields that should be stored as Y.Map<string, true> for concurrent-safe set operations.
 * When read back, these Y.Maps (where all values are `true`) are converted to string[].
 */
const SET_FIELDS: Record<string, string[]> = {
	shelves: ['bookIds']
};

/**
 * Convert a nested Y.Map entry back to a plain JS object.
 * Detects "set" Y.Maps (all values === true) and converts them to string[].
 */
export function yMapToObject(ymap: Y.Map<unknown>): Record<string, unknown> {
	const obj: Record<string, unknown> = {};
	ymap.forEach((value, key) => {
		if (value instanceof Y.Map) {
			// Check if this is a "set" map (all values are true)
			let isSet = true;
			const entries: string[] = [];
			value.forEach((v, k) => {
				if (v !== true) isSet = false;
				entries.push(k);
			});
			if (isSet && entries.length > 0) {
				obj[key] = entries;
			} else if (isSet && entries.length === 0) {
				// Empty set → empty array
				obj[key] = [];
			} else {
				// Nested object (not a set)
				obj[key] = yMapToObject(value as Y.Map<unknown>);
			}
		} else if (value instanceof Y.Array) {
			obj[key] = value.toArray();
		} else {
			obj[key] = value;
		}
	});
	return obj;
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
		if (setFields.includes(key) && Array.isArray(value)) {
			// Store as Y.Map set
			const setMap = new Y.Map<true>();
			for (const item of value) {
				setMap.set(String(item), true);
			}
			ymap.set(key, setMap);
		} else if (Array.isArray(value)) {
			const yarray = new Y.Array<unknown>();
			yarray.push(value);
			ymap.set(key, yarray);
		} else if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
			// Nested object → nested Y.Map
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
	function getItem(mapName: string, id: string): Record<string, unknown> | undefined {
		const map = doc.getMap(mapName);
		const entry = map.get(id);
		if (!entry || !(entry instanceof Y.Map)) return undefined;
		return yMapToObject(entry as Y.Map<unknown>);
	}

	function getAll(mapName: string): Record<string, unknown>[] {
		const map = doc.getMap(mapName);
		const results: Record<string, unknown>[] = [];
		map.forEach((value) => {
			if (value instanceof Y.Map) {
				results.push(yMapToObject(value as Y.Map<unknown>));
			}
		});
		return results;
	}

	function filter(
		mapName: string,
		predicate: (item: Record<string, unknown>) => boolean
	): Record<string, unknown>[] {
		return getAll(mapName).filter(predicate);
	}

	function search(mapName: string, query: string): Record<string, unknown>[] {
		const words = query.toLowerCase().split(/\s+/).filter(Boolean);
		if (words.length === 0) return getAll(mapName);

		return filter(mapName, (item) => {
			// Build searchable text from all string/array fields
			const parts: string[] = [];
			for (const value of Object.values(item)) {
				if (typeof value === 'string') {
					parts.push(value);
				} else if (Array.isArray(value)) {
					parts.push(value.join(' '));
				}
			}
			const text = parts.join(' ').toLowerCase();
			// AND logic: every word must match
			return words.every((word) => text.includes(word));
		});
	}

	function setItem(mapName: string, id: string, data: Record<string, unknown>): void {
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
					// Replace Y.Array contents in-place for field-level CRDT merge
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
					// Direct child add/update/delete
					event.changes.keys.forEach((change, key) => {
						if (!seen.has(key)) {
							seen.add(key);
							changes.push({ action: change.action, key });
						}
					});
				} else {
					// Nested change — walk up to find the top-level key
					let target: Y.AbstractType<any> | null = event.target as Y.AbstractType<any>;
					while (target && target !== map) {
						const parent = target.parent;
						if (parent === map && parent instanceof Y.Map) {
							// Find the key for this target in the parent map
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

	return { getItem, getAll, filter, search, setItem, updateItem, deleteItem, observe, getRawEntry };
}
