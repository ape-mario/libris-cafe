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
  coverBlob?: Blob;
  categories: string[];
  seriesId?: string;
  seriesOrder?: number;
  dateAdded: Date;
  dateModified: Date;
}

export interface UserBookData {
  id: string;
  userId: string;
  bookId: string;
  status: 'unread' | 'reading' | 'read' | 'dnf';
  rating?: number;
  notes?: string;
  lentTo?: string;
  lentDate?: Date;
  isWishlist: boolean;
}

export interface Series {
  id: string;
  name: string;
  description?: string;
}

export interface Category {
  id: string;
  name: string;
  color?: string;
}
