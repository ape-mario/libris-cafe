export default {
  // App
  'app.name': 'buku saya',
  'app.loading': 'Memuat...',

  // Profile picker
  'profile.title': 'buku saya',
  'profile.subtitle': 'Siapa yang membaca hari ini?',
  'profile.add': 'Tambah Profil',
  'profile.placeholder': 'Nama kamu',
  'profile.go': 'Mulai',

  // Top bar
  'topbar.add': '+ Tambah Buku',

  // Bottom nav
  'nav.library': 'Koleksi',
  'nav.browse': 'Jelajahi',
  'nav.mine': 'Milik Saya',

  // Library page
  'library.title': 'Koleksi',
  'library.search': 'Cari koleksi buku...',
  'library.empty.title': 'Koleksi masih kosong',
  'library.empty.subtitle': 'Mulai bangun koleksi bukumu',
  'library.empty.cta': 'Tambah buku pertama',
  'library.no_results': 'Tidak ada buku yang cocok',
  'library.book_count': '{count} buku',

  // Browse page
  'browse.title': 'Jelajahi',
  'browse.categories': 'Kategori',
  'browse.series': 'Seri',
  'browse.authors': 'Penulis',
  'browse.no_categories': 'Belum ada kategori. Tambahkan kategori saat menambah buku.',
  'browse.no_series': 'Belum ada seri.',
  'browse.no_authors': 'Belum ada penulis.',

  // Mine page
  'mine.title': 'Buku Saya',
  'mine.reading': 'Sedang Dibaca',
  'mine.finished': 'Selesai',
  'mine.dnf': 'DNF',
  'mine.wishlist': 'Daftar Keinginan',
  'mine.lent': 'Dipinjamkan',
  'mine.empty': 'Belum ada buku di sini.',
  'mine.lent_to': 'Dipinjamkan ke',

  // Add book page
  'add.title': 'Tambah Buku',
  'add.search': 'Cari',
  'add.manual': 'Manual',
  'add.scan': 'Pindai',
  'add.search_placeholder': 'Cari berdasarkan judul atau penulis...',
  'add.cover_image': 'Gambar Sampul',
  'add.book_title': 'Judul',
  'add.authors': 'Penulis',
  'add.authors_placeholder': 'Pisahkan dengan koma',
  'add.isbn': 'ISBN',
  'add.categories': 'Kategori',
  'add.categories_placeholder': 'cth. fiksi-ilmiah, novel',
  'add.series': 'Seri',
  'add.series_none': 'Tidak ada',
  'add.series_position': 'Posisi dalam seri',
  'add.series_create': 'Atau buat seri baru...',
  'add.series_add': 'Tambah',
  'add.save': 'Tambah Buku',
  'add.saving': 'Menyimpan...',
  'add.error_title': 'Judul wajib diisi',
  'add.error_duplicate': 'Buku dengan ISBN ini sudah ada',

  // Book detail page
  'book.not_found': 'Buku tidak ditemukan.',
  'book.change_cover': 'Ganti sampul',
  'book.status': 'Status',
  'book.status_unread': 'Belum Dibaca',
  'book.status_reading': 'Sedang Dibaca',
  'book.status_read': 'Selesai',
  'book.status_dnf': 'DNF',
  'book.notes': 'Catatan',
  'book.notes_placeholder': 'Pendapatmu tentang buku ini...',
  'book.lending': 'Peminjaman',
  'book.lend': 'Pinjamkan buku ini',
  'book.lent_to': 'Dipinjamkan ke',
  'book.return': 'Kembalikan',
  'book.wishlist_add': 'Tambah ke Daftar Keinginan',
  'book.wishlist_in': 'Di Daftar Keinginan',
  'book.delete': 'Hapus buku ini dari koleksi',
  'book.edit': 'Edit Detail',
  'book.edit_subtitle': 'Perbarui metadata, kategori, dan seri buku',
  'book.save': 'Simpan Perubahan',
  'book.book_number': 'Buku {n}',

  // Dialogs
  'dialog.cancel': 'Batal',
  'dialog.lend_title': 'Pinjamkan buku ini',
  'dialog.lend_message': 'Siapa yang meminjam buku ini?',
  'dialog.lend_placeholder': 'Masukkan nama',
  'dialog.lend_confirm': 'Pinjamkan',
  'dialog.delete_title': 'Hapus buku',
  'dialog.delete_message': 'Yakin ingin menghapus "{title}" dari koleksi? Tindakan ini tidak bisa dibatalkan.',
  'dialog.delete_confirm': 'Hapus',

  // Toasts
  'toast.lent': 'Dipinjamkan ke {name}',
  'toast.returned': 'Buku ditandai sudah dikembalikan',
  'toast.deleted': 'Buku dihapus dari koleksi',
  'toast.exported': 'Koleksi berhasil diekspor',
  'toast.imported': 'Koleksi berhasil diimpor',
  'toast.import_failed': 'Impor gagal — file tidak valid',

  // Settings
  'settings.title': 'Pengaturan',
  'settings.language': 'Bahasa',
  'settings.export_title': 'Ekspor Koleksi',
  'settings.export_desc': 'Unduh seluruh koleksi sebagai file cadangan JSON.',
  'settings.export_btn': 'Ekspor Data',
  'settings.import_title': 'Impor Koleksi',
  'settings.import_desc': 'Pulihkan dari file cadangan. Data yang ada akan digabungkan.',

  // Scanner
  'scanner.hint': 'Arahkan kamera ke barcode buku',
  'scanner.error': 'Akses kamera ditolak atau tidak tersedia',

  // Common
  'common.back': 'Kembali',
  'common.books': 'buku',
  'common.book': 'buku',
} as const;
