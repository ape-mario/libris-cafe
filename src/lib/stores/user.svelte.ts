import { db, type User } from '$lib/db';

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

export async function restoreUser(): Promise<User | null> {
  const id = localStorage.getItem('currentUserId');
  if (id) {
    const user = await db.users.get(id);
    if (user) {
      currentUser = user;
      return user;
    }
  }
  return null;
}

export async function createUser(name: string, avatar?: string): Promise<User> {
  const user: User = { id: crypto.randomUUID(), name, avatar };
  await db.users.add(user);
  return user;
}

export async function deleteUser(id: string): Promise<void> {
  await db.userBookData.where('userId').equals(id).delete();
  await db.users.delete(id);
  if (currentUser?.id === id) {
    setCurrentUser(null);
  }
}

export async function getAllUsers(): Promise<User[]> {
  return db.users.toArray();
}
