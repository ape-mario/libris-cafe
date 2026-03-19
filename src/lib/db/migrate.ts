import Dexie from 'dexie';
import * as Y from 'yjs';

const MIGRATION_FLAG = 'libris_migrated_at';
const GOAL_KEY_PREFIX = 'reading_goal_';

export async function migrateFromDexie(
	doc: Y.Doc
): Promise<{ migrated: boolean; stats?: Record<string, number> }> {
	// Check if already migrated and Y.Doc has data
	const flag = localStorage.getItem(MIGRATION_FLAG);
	const docHasData = doc.getMap('books').size > 0 || doc.getMap('users').size > 0;

	if (flag && docHasData) {
		return { migrated: false };
	}

	if (docHasData) {
		// Y.Doc populated (e.g., via sync), just set the flag
		localStorage.setItem(MIGRATION_FLAG, new Date().toISOString());
		return { migrated: false };
	}

	// Check if Dexie DB exists
	const databases = await Dexie.getDatabaseNames();
	if (!databases.includes('MyBooksDB')) {
		return { migrated: false };
	}

	// Open old Dexie DB
	const oldDb = new Dexie('MyBooksDB');
	oldDb.version(3).stores({
		users: 'id, name',
		books: 'id, title, isbn, *categories, seriesId, dateAdded',
		userBookData: 'id, [userId+bookId], userId, bookId, status, isWishlist',
		series: 'id, name',
		categories: 'id, name',
		shelves: 'id, userId, name',
		syncConfig: 'id'
	});

	const stats: Record<string, number> = {};

	try {
		// Read all data from Dexie
		const [users, books, userBookData, series, categories, shelves] = await Promise.all([
			oldDb.table('users').toArray(),
			oldDb.table('books').toArray(),
			oldDb.table('userBookData').toArray(),
			oldDb.table('series').toArray(),
			oldDb
				.table('categories')
				.toArray()
				.catch(() => []),
			oldDb
				.table('shelves')
				.toArray()
				.catch(() => [])
		]);

		// Warn about categories with color data
		const coloredCats = categories.filter((c: any) => c.color);
		if (coloredCats.length > 0) {
			console.warn(
				`[Libris Migration] ${coloredCats.length} categories with color data will not be migrated.`
			);
		}

		// Write all data in a single transaction using direct Y.Map access
		doc.transact(() => {
			const usersMap = doc.getMap('users');
			const booksMap = doc.getMap('books');
			const ubdMap = doc.getMap('userBookData');
			const seriesMap = doc.getMap('series');
			const shelvesMap = doc.getMap('shelves');
			const goalsMap = doc.getMap('goals');

			// Migrate users
			for (const user of users) {
				const ymap = new Y.Map<any>();
				ymap.set('id', user.id);
				ymap.set('name', user.name);
				if (user.avatar) ymap.set('avatar', user.avatar);
				usersMap.set(user.id, ymap);
			}
			stats.users = users.length;

			// Migrate books (drop coverBlob, convert dates)
			for (const book of books) {
				const ymap = new Y.Map<any>();
				ymap.set('id', book.id);
				ymap.set('title', book.title);
				const authorsArr = new Y.Array<string>();
				authorsArr.push(book.authors || []);
				ymap.set('authors', authorsArr);
				if (book.isbn) ymap.set('isbn', book.isbn);
				if (book.coverUrl) ymap.set('coverUrl', book.coverUrl);
				const catsArr = new Y.Array<string>();
				catsArr.push(book.categories || []);
				ymap.set('categories', catsArr);
				if (book.seriesId) ymap.set('seriesId', book.seriesId);
				if (book.seriesOrder) ymap.set('seriesOrder', book.seriesOrder);
				ymap.set(
					'dateAdded',
					book.dateAdded instanceof Date ? book.dateAdded.toISOString() : book.dateAdded
				);
				ymap.set(
					'dateModified',
					book.dateModified instanceof Date
						? book.dateModified.toISOString()
						: book.dateModified
				);
				booksMap.set(book.id, ymap);
			}
			stats.books = books.length;

			// Migrate userBookData (drop id, use compound key)
			for (const ubd of userBookData) {
				const key = `${ubd.userId}:${ubd.bookId}`;
				const ymap = new Y.Map<any>();
				ymap.set('userId', ubd.userId);
				ymap.set('bookId', ubd.bookId);
				ymap.set('status', ubd.status || 'unread');
				if (ubd.rating) ymap.set('rating', ubd.rating);
				if (ubd.notes) ymap.set('notes', ubd.notes);
				if (ubd.lentTo) ymap.set('lentTo', ubd.lentTo);
				if (ubd.lentDate)
					ymap.set(
						'lentDate',
						ubd.lentDate instanceof Date ? ubd.lentDate.toISOString() : ubd.lentDate
					);
				ymap.set('isWishlist', ubd.isWishlist || false);
				if (ubd.currentPage) ymap.set('currentPage', ubd.currentPage);
				if (ubd.totalPages) ymap.set('totalPages', ubd.totalPages);
				// Backfill dateRead for read books using book's dateAdded as best guess
				if ((ubd.status || 'unread') === 'read') {
					const book = books.find((b: any) => b.id === ubd.bookId);
					if (book) {
						const dateAdded = book.dateAdded instanceof Date ? book.dateAdded.toISOString() : book.dateAdded;
						ymap.set('dateRead', dateAdded);
					}
				}
				ubdMap.set(key, ymap);
			}
			stats.userBookData = userBookData.length;

			// Migrate series
			for (const s of series) {
				const ymap = new Y.Map<any>();
				ymap.set('id', s.id);
				ymap.set('name', s.name);
				if (s.description) ymap.set('description', s.description);
				seriesMap.set(s.id, ymap);
			}
			stats.series = series.length;

			// Migrate shelves (bookIds as Y.Map set semantics)
			for (const shelf of shelves) {
				const ymap = new Y.Map<any>();
				ymap.set('id', shelf.id);
				ymap.set('userId', shelf.userId);
				ymap.set('name', shelf.name);
				ymap.set(
					'dateCreated',
					shelf.dateCreated instanceof Date
						? shelf.dateCreated.toISOString()
						: shelf.dateCreated
				);
				const bookIdsMap = new Y.Map<any>();
				for (const bookId of shelf.bookIds || []) {
					bookIdsMap.set(bookId, true);
				}
				ymap.set('bookIds', bookIdsMap);
				shelvesMap.set(shelf.id, ymap);
			}
			stats.shelves = shelves.length;

			// Migrate goals from localStorage
			let goalCount = 0;
			for (let i = 0; i < localStorage.length; i++) {
				const key = localStorage.key(i);
				if (key && key.startsWith(GOAL_KEY_PREFIX)) {
					const value = localStorage.getItem(key);
					if (value) {
						const rest = key.slice(GOAL_KEY_PREFIX.length);
						const lastUnderscore = rest.lastIndexOf('_');
						if (lastUnderscore > 0) {
							const userId = rest.slice(0, lastUnderscore);
							const year = rest.slice(lastUnderscore + 1);
							const target = parseInt(value);
							if (!Number.isFinite(target) || target < 1) continue;
							const ymap = new Y.Map<any>();
							ymap.set('target', target);
							ymap.set('userId', userId);
							ymap.set('year', parseInt(year));
							goalsMap.set(`${userId}:${year}`, ymap);
							goalCount++;
						}
					}
				}
			}
			stats.goals = goalCount;
		});

		// Migrate cover blobs asynchronously (outside transact)
		for (const book of books) {
			if (book.coverBlob) {
				try {
					const reader = new FileReader();
					const base64 = await new Promise<string>((resolve, reject) => {
						reader.onloadend = () => resolve(reader.result as string);
						reader.onerror = reject;
						reader.readAsDataURL(book.coverBlob);
					});
					const { setCoverBase64 } = await import('../services/coverCache');
					await setCoverBase64(book.id, base64);
				} catch (e) {
					console.warn(
						`[Libris Migration] Failed to migrate cover for book ${book.id}:`,
						e
					);
				}
			}
		}

		localStorage.setItem(MIGRATION_FLAG, new Date().toISOString());
		console.log('[Libris Migration] Complete:', stats);
		return { migrated: true, stats };
	} catch (e) {
		console.error('[Libris Migration] Failed:', e);
		throw e;
	}
}

export function shouldCleanupDexie(): boolean {
	const flag = localStorage.getItem(MIGRATION_FLAG);
	if (!flag) return false;
	const migrationDate = new Date(flag);
	const daysSince = (Date.now() - migrationDate.getTime()) / (1000 * 60 * 60 * 24);
	return daysSince >= 90;
}

export async function cleanupDexie(): Promise<void> {
	try {
		await Dexie.delete('MyBooksDB');
		console.log('[Libris Migration] Old Dexie database cleaned up.');
	} catch (e) {
		console.warn('[Libris Migration] Failed to cleanup Dexie:', e);
	}
}
