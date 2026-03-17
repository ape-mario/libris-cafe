export default {
  // App
  'app.name': 'my books',
  'app.loading': 'Loading...',

  // Profile picker
  'profile.title': 'my books',
  'profile.subtitle': "Who's reading today?",
  'profile.add': 'Add Profile',
  'profile.placeholder': 'Your name',
  'profile.go': 'Go',

  // Top bar
  'topbar.add': '+ Add Book',

  // Bottom nav
  'nav.library': 'Library',
  'nav.browse': 'Browse',
  'nav.mine': 'Mine',

  // Library page
  'library.title': 'Library',
  'library.search': 'Search your library...',
  'library.empty.title': 'Your library is empty',
  'library.empty.subtitle': 'Start building your collection',
  'library.empty.cta': 'Add your first book',
  'library.no_results': 'No books match',
  'library.book_count': '{count} {count, plural, one {book} other {books}}',

  // Browse page
  'browse.title': 'Browse',
  'browse.categories': 'Categories',
  'browse.series': 'Series',
  'browse.authors': 'Authors',
  'browse.no_categories': 'No categories yet. Add categories when adding books.',
  'browse.no_series': 'No series yet.',
  'browse.no_authors': 'No authors yet.',

  // Mine page
  'mine.title': 'My Books',
  'mine.reading': 'Reading',
  'mine.finished': 'Finished',
  'mine.dnf': 'DNF',
  'mine.wishlist': 'Wishlist',
  'mine.lent': 'Lent Out',
  'mine.empty': 'Nothing here yet.',
  'mine.lent_to': 'Lent to',

  // Add book page
  'add.title': 'Add Book',
  'add.search': 'Search',
  'add.manual': 'Manual',
  'add.scan': 'Scan',
  'add.search_placeholder': 'Search by title or author...',
  'add.cover_image': 'Cover Image',
  'add.book_title': 'Title',
  'add.authors': 'Authors',
  'add.authors_placeholder': 'Comma-separated',
  'add.isbn': 'ISBN',
  'add.categories': 'Categories',
  'add.categories_placeholder': 'e.g. sci-fi, novel',
  'add.series': 'Series',
  'add.series_none': 'None',
  'add.series_position': 'Position in series',
  'add.series_create': 'Or create new series...',
  'add.series_add': 'Add',
  'add.save': 'Add Book',
  'add.saving': 'Saving...',
  'add.error_title': 'Title is required',
  'add.error_duplicate': 'A book with this ISBN already exists',

  // Book detail page
  'book.not_found': 'Book not found.',
  'book.change_cover': 'Change cover',
  'book.status': 'Status',
  'book.status_unread': 'Unread',
  'book.status_reading': 'Reading',
  'book.status_read': 'Read',
  'book.status_dnf': 'DNF',
  'book.notes': 'Notes',
  'book.notes_placeholder': 'Your thoughts on this book...',
  'book.lending': 'Lending',
  'book.lend': 'Lend this book',
  'book.lent_to': 'Lent to',
  'book.return': 'Return',
  'book.wishlist_add': 'Add to Wishlist',
  'book.wishlist_in': 'In Wishlist',
  'book.delete': 'Remove this book from library',
  'book.edit': 'Edit Details',
  'book.edit_subtitle': 'Update book metadata, categories, and series',
  'book.save': 'Save Changes',
  'book.book_number': 'Book {n}',

  // Dialogs
  'dialog.cancel': 'Cancel',
  'dialog.lend_title': 'Lend this book',
  'dialog.lend_message': 'Who are you lending this to?',
  'dialog.lend_placeholder': 'Enter name',
  'dialog.lend_confirm': 'Lend',
  'dialog.delete_title': 'Remove book',
  'dialog.delete_message': 'Are you sure you want to remove "{title}" from your library? This cannot be undone.',
  'dialog.delete_confirm': 'Remove',

  // Toasts
  'toast.lent': 'Lent to {name}',
  'toast.returned': 'Book marked as returned',
  'toast.deleted': 'Book removed from library',
  'toast.exported': 'Library exported',
  'toast.imported': 'Library imported successfully',
  'toast.import_failed': 'Import failed — invalid file',

  // Settings
  'settings.title': 'Settings',
  'settings.language': 'Language',
  'settings.export_title': 'Export Library',
  'settings.export_desc': 'Download your entire library as a JSON backup file.',
  'settings.export_btn': 'Export Data',
  'settings.import_title': 'Import Library',
  'settings.import_desc': 'Restore from a backup file. Existing data will be merged.',

  // Scanner
  'scanner.hint': 'Point your camera at the book\'s barcode',
  'scanner.error': 'Camera access denied or not available',

  // Common
  'common.back': 'Back',
  'common.books': 'books',
  'common.book': 'book',
} as const;
