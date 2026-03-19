export interface User {
  id: string;
  name: string;
  avatar?: string;
}

export interface Book {
  id: string;
  title: string;
  authors: string[];
  isbn?: string;
  coverUrl?: string;
  categories: string[];
  publisher?: string;
  publishYear?: number;
  edition?: string;
  seriesId?: string;
  seriesOrder?: number;
  dateAdded: string;
  dateModified: string;
}

export interface UserBookData {
  userId: string;
  bookId: string;
  status: 'unread' | 'reading' | 'read' | 'dnf';
  rating?: number;
  notes?: string;
  lentTo?: string;
  lentDate?: string;
  dateRead?: string;
  isWishlist: boolean;
  currentPage?: number;
  totalPages?: number;
  progressHistory?: { date: string; page: number }[];
}

export interface Series {
  id: string;
  name: string;
  description?: string;
}

export interface Shelf {
  id: string;
  userId: string;
  name: string;
  bookIds: string[];
  dateCreated: string;
}

export interface ReadingGoal {
  userId: string;
  year: number;
  target: number;
}
