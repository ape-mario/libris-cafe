import { q, type User } from '$lib/db';

let currentUser = $state<User | null>(null);

export function getCurrentUser(): User | null {
	return currentUser;
}

export function setCurrentUser(user: User | null) {
	currentUser = user;
	if (user) {
		localStorage.setItem('currentUserId', user.id);
	} else {
		localStorage.removeItem('currentUserId');
	}
}

export function restoreUser(): User | null {
	const id = localStorage.getItem('currentUserId');
	if (id) {
		const user = q.getItem('users', id) as User | undefined;
		if (user) {
			currentUser = user;
			return user;
		}
	}
	return null;
}

export function createUser(name: string, avatar?: string): User {
	const user: User = { id: crypto.randomUUID(), name, avatar };
	q.setItem('users', user.id, user as unknown as Record<string, unknown>);
	return user;
}

export function deleteUser(id: string): void {
	// Cascade delete userBookData
	const ubds = q.filter('userBookData', (d) => d.userId === id);
	for (const ubd of ubds) {
		q.deleteItem('userBookData', `${ubd.userId}:${ubd.bookId}`);
	}
	q.deleteItem('users', id);
	if (currentUser?.id === id) {
		setCurrentUser(null);
	}
}

export function getAllUsers(): User[] {
	return q.getAll('users') as unknown as User[];
}
