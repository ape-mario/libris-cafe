// src/lib/db/reactive.ts
import * as Y from 'yjs';
import { readable, type Readable } from 'svelte/store';
import { yMapToObject } from './query';

function getAllFromMap<T>(map: Y.Map<any>): T[] {
	const items: T[] = [];
	map.forEach((value) => {
		if (value instanceof Y.Map) {
			items.push(yMapToObject(value) as T);
		}
	});
	return items;
}

export function createLiveQuery<T>(doc: Y.Doc, mapName: string): Readable<T[]> {
	return readable<T[]>([], (set) => {
		const map = doc.getMap(mapName);

		// Emit initial value
		set(getAllFromMap<T>(map));

		// Observe changes
		const handler = () => {
			set(getAllFromMap<T>(map));
		};
		map.observeDeep(handler);

		// Cleanup
		return () => {
			map.unobserveDeep(handler);
		};
	});
}

export function createLiveItem<T>(
	doc: Y.Doc,
	mapName: string,
	id: string
): Readable<T | undefined> {
	return readable<T | undefined>(undefined, (set) => {
		const map = doc.getMap(mapName);

		const emit = () => {
			const entry = map.get(id);
			if (entry instanceof Y.Map) {
				set(yMapToObject(entry) as T);
			} else {
				set(undefined);
			}
		};

		emit();
		map.observeDeep(emit);

		return () => map.unobserveDeep(emit);
	});
}
