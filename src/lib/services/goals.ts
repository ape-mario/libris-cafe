import { db } from '$lib/db';

const GOAL_KEY_PREFIX = 'reading_goal_';

export interface ReadingGoal {
  year: number;
  target: number;
}

export function getGoal(userId: string, year: number = new Date().getFullYear()): ReadingGoal | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(`${GOAL_KEY_PREFIX}${userId}_${year}`);
  if (!raw) return null;
  return { year, target: parseInt(raw) };
}

export function setGoal(userId: string, target: number, year: number = new Date().getFullYear()) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(`${GOAL_KEY_PREFIX}${userId}_${year}`, target.toString());
}

export function removeGoal(userId: string, year: number = new Date().getFullYear()) {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(`${GOAL_KEY_PREFIX}${userId}_${year}`);
}

export async function getBooksReadThisYear(userId: string): Promise<number> {
  const year = new Date().getFullYear();
  const allBooks = await db.books.toArray();
  const userData = await db.userBookData.where('userId').equals(userId).toArray();

  const readBookIds = new Set(userData.filter(d => d.status === 'read').map(d => d.bookId));

  return allBooks.filter(b => {
    if (!readBookIds.has(b.id)) return false;
    const added = new Date(b.dateAdded);
    return added.getFullYear() === year;
  }).length;
}
