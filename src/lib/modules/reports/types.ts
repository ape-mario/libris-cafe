export type ExportFormat = 'csv' | 'pdf' | 'excel';

export type ReportType =
  | 'sales_daily'
  | 'sales_weekly'
  | 'sales_monthly'
  | 'inventory_status'
  | 'stock_movement'
  | 'dead_stock'
  | 'profit_margin'
  | 'consignment_summary'
  | 'supplier_performance'
  | 'lending_sessions';

export interface ReportConfig {
  type: ReportType;
  format: ExportFormat;
  outlet_id: string;
  date_from: string;  // ISO date
  date_to: string;    // ISO date
  /** Optional filters (e.g., category, supplier_id). */
  filters?: Record<string, string>;
}

export interface ReportColumn {
  key: string;
  label_en: string;
  label_id: string;
  /** Format type for display/export. */
  format?: 'text' | 'number' | 'currency' | 'date' | 'percentage';
}

export interface ReportData {
  title_en: string;
  title_id: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  generated_at: string;
  config: ReportConfig;
}

export interface ExportProgress {
  status: 'idle' | 'fetching' | 'generating' | 'downloading' | 'done' | 'error';
  progress: number; // 0-100
  error?: string;
}

/** Report definitions — maps ReportType to its column schema. */
export const REPORT_SCHEMAS: Record<ReportType, { title_en: string; title_id: string; columns: ReportColumn[] }> = {
  sales_daily: {
    title_en: 'Daily Sales Report',
    title_id: 'Laporan Penjualan Harian',
    columns: [
      { key: 'date', label_en: 'Date', label_id: 'Tanggal', format: 'date' },
      { key: 'transactions', label_en: 'Transactions', label_id: 'Transaksi', format: 'number' },
      { key: 'items_sold', label_en: 'Items Sold', label_id: 'Item Terjual', format: 'number' },
      { key: 'subtotal', label_en: 'Subtotal', label_id: 'Subtotal', format: 'currency' },
      { key: 'discount', label_en: 'Discount', label_id: 'Diskon', format: 'currency' },
      { key: 'tax', label_en: 'Tax', label_id: 'Pajak', format: 'currency' },
      { key: 'total', label_en: 'Total', label_id: 'Total', format: 'currency' },
    ],
  },
  sales_weekly: {
    title_en: 'Weekly Sales Report',
    title_id: 'Laporan Penjualan Mingguan',
    columns: [
      { key: 'week', label_en: 'Week', label_id: 'Minggu', format: 'text' },
      { key: 'transactions', label_en: 'Transactions', label_id: 'Transaksi', format: 'number' },
      { key: 'total', label_en: 'Total', label_id: 'Total', format: 'currency' },
      { key: 'avg_per_transaction', label_en: 'Avg/Transaction', label_id: 'Rata-rata/Transaksi', format: 'currency' },
    ],
  },
  sales_monthly: {
    title_en: 'Monthly Sales Report',
    title_id: 'Laporan Penjualan Bulanan',
    columns: [
      { key: 'month', label_en: 'Month', label_id: 'Bulan', format: 'text' },
      { key: 'transactions', label_en: 'Transactions', label_id: 'Transaksi', format: 'number' },
      { key: 'total', label_en: 'Total', label_id: 'Total', format: 'currency' },
      { key: 'growth', label_en: 'Growth', label_id: 'Pertumbuhan', format: 'percentage' },
    ],
  },
  inventory_status: {
    title_en: 'Inventory Status Report',
    title_id: 'Laporan Status Inventaris',
    columns: [
      { key: 'title', label_en: 'Book Title', label_id: 'Judul Buku', format: 'text' },
      { key: 'isbn', label_en: 'ISBN', label_id: 'ISBN', format: 'text' },
      { key: 'type', label_en: 'Type', label_id: 'Tipe', format: 'text' },
      { key: 'stock', label_en: 'Stock', label_id: 'Stok', format: 'number' },
      { key: 'price', label_en: 'Price', label_id: 'Harga', format: 'currency' },
      { key: 'condition', label_en: 'Condition', label_id: 'Kondisi', format: 'text' },
    ],
  },
  stock_movement: {
    title_en: 'Stock Movement Report',
    title_id: 'Laporan Pergerakan Stok',
    columns: [
      { key: 'date', label_en: 'Date', label_id: 'Tanggal', format: 'date' },
      { key: 'title', label_en: 'Book', label_id: 'Buku', format: 'text' },
      { key: 'type', label_en: 'Movement Type', label_id: 'Jenis Pergerakan', format: 'text' },
      { key: 'quantity', label_en: 'Quantity', label_id: 'Jumlah', format: 'number' },
      { key: 'staff', label_en: 'Staff', label_id: 'Staf', format: 'text' },
      { key: 'reason', label_en: 'Reason', label_id: 'Alasan', format: 'text' },
    ],
  },
  dead_stock: {
    title_en: 'Dead Stock Report (>90 days unsold)',
    title_id: 'Laporan Stok Mati (>90 hari tidak terjual)',
    columns: [
      { key: 'title', label_en: 'Book Title', label_id: 'Judul Buku', format: 'text' },
      { key: 'stock', label_en: 'Stock', label_id: 'Stok', format: 'number' },
      { key: 'last_sold', label_en: 'Last Sold', label_id: 'Terakhir Terjual', format: 'date' },
      { key: 'days_unsold', label_en: 'Days Unsold', label_id: 'Hari Tidak Terjual', format: 'number' },
      { key: 'value', label_en: 'Stock Value', label_id: 'Nilai Stok', format: 'currency' },
    ],
  },
  profit_margin: {
    title_en: 'Profit Margin Report',
    title_id: 'Laporan Margin Keuntungan',
    columns: [
      { key: 'title', label_en: 'Book Title', label_id: 'Judul Buku', format: 'text' },
      { key: 'sold', label_en: 'Sold', label_id: 'Terjual', format: 'number' },
      { key: 'revenue', label_en: 'Revenue', label_id: 'Pendapatan', format: 'currency' },
      { key: 'cost', label_en: 'Cost', label_id: 'Biaya', format: 'currency' },
      { key: 'margin', label_en: 'Margin', label_id: 'Margin', format: 'currency' },
      { key: 'margin_pct', label_en: 'Margin %', label_id: 'Margin %', format: 'percentage' },
    ],
  },
  consignment_summary: {
    title_en: 'Consignment Summary',
    title_id: 'Ringkasan Konsinyasi',
    columns: [
      { key: 'consignor', label_en: 'Consignor', label_id: 'Konsinyur', format: 'text' },
      { key: 'books_count', label_en: 'Books', label_id: 'Jumlah Buku', format: 'number' },
      { key: 'sold', label_en: 'Sold', label_id: 'Terjual', format: 'number' },
      { key: 'total_sales', label_en: 'Total Sales', label_id: 'Total Penjualan', format: 'currency' },
      { key: 'commission', label_en: 'Commission', label_id: 'Komisi', format: 'currency' },
      { key: 'payout', label_en: 'Payout', label_id: 'Pembayaran', format: 'currency' },
    ],
  },
  supplier_performance: {
    title_en: 'Supplier Performance Report',
    title_id: 'Laporan Kinerja Supplier',
    columns: [
      { key: 'supplier', label_en: 'Supplier', label_id: 'Supplier', format: 'text' },
      { key: 'orders', label_en: 'Orders', label_id: 'Pesanan', format: 'number' },
      { key: 'total_spent', label_en: 'Total Spent', label_id: 'Total Belanja', format: 'currency' },
      { key: 'avg_lead_days', label_en: 'Avg Lead Time', label_id: 'Rata-rata Lead Time', format: 'number' },
      { key: 'fulfillment_rate', label_en: 'Fulfillment %', label_id: 'Fulfillment %', format: 'percentage' },
    ],
  },
  lending_sessions: {
    title_en: 'Lending Sessions Report',
    title_id: 'Laporan Sesi Peminjaman',
    columns: [
      { key: 'date', label_en: 'Date', label_id: 'Tanggal', format: 'date' },
      { key: 'title', label_en: 'Book', label_id: 'Buku', format: 'text' },
      { key: 'customer', label_en: 'Customer', label_id: 'Pelanggan', format: 'text' },
      { key: 'level', label_en: 'Level', label_id: 'Level', format: 'text' },
      { key: 'duration_min', label_en: 'Duration (min)', label_id: 'Durasi (menit)', format: 'number' },
      { key: 'deposit', label_en: 'Deposit', label_id: 'Deposit', format: 'currency' },
      { key: 'status', label_en: 'Status', label_id: 'Status', format: 'text' },
    ],
  },
};
