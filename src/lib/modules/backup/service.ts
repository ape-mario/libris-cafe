import { getSupabase } from '$lib/supabase/client';
import { q } from '$lib/db';
import type { Book, Series, User } from '$lib/db';
import type { BackupData } from './types';

/**
 * Export ALL business data for the given outlet as a JSON backup.
 * Includes both Supabase data and Yjs catalog data.
 */
export async function exportFullBackup(outletId: string, outletName: string): Promise<BackupData> {
  const supabase = getSupabase();

  // Fetch all tables in parallel
  const [
    { data: outlet },
    { data: staff },
    { data: inventory },
    { data: stockMovements },
    { data: transactions },
    { data: transactionItems },
    { data: payments },
    { data: receipts },
    { data: suppliers },
    { data: purchaseOrders },
    { data: purchaseOrderItems },
    { data: consignors },
    { data: settlements },
    { data: notifications },
    { data: readingSessions },
    { data: transfers },
    { data: transferItems },
  ] = await Promise.all([
    supabase.from('outlet').select('*').eq('id', outletId),
    supabase.from('staff').select('id, name, email, role, outlet_id, is_active, created_at').eq('outlet_id', outletId),
    supabase.from('inventory').select('*').eq('outlet_id', outletId),
    supabase.from('stock_movement').select('*').in('inventory_id',
      // subquery: get inventory IDs for this outlet
      (await supabase.from('inventory').select('id').eq('outlet_id', outletId)).data?.map(i => i.id) ?? []
    ),
    supabase.from('transaction').select('*').eq('outlet_id', outletId).order('created_at', { ascending: false }),
    supabase.from('transaction_item').select('*').in('transaction_id',
      (await supabase.from('transaction').select('id').eq('outlet_id', outletId)).data?.map(t => t.id) ?? []
    ),
    supabase.from('payment').select('*').in('transaction_id',
      (await supabase.from('transaction').select('id').eq('outlet_id', outletId)).data?.map(t => t.id) ?? []
    ),
    supabase.from('receipt').select('*').in('transaction_id',
      (await supabase.from('transaction').select('id').eq('outlet_id', outletId)).data?.map(t => t.id) ?? []
    ),
    supabase.from('supplier').select('*'),
    supabase.from('purchase_order').select('*').eq('outlet_id', outletId),
    supabase.from('purchase_order_item').select('*').in('purchase_order_id',
      (await supabase.from('purchase_order').select('id').eq('outlet_id', outletId)).data?.map(p => p.id) ?? []
    ),
    supabase.from('consignor').select('*'),
    supabase.from('consignment_settlement').select('*').in('consignor_id',
      (await supabase.from('consignor').select('id')).data?.map(c => c.id) ?? []
    ),
    supabase.from('notification').select('*').eq('outlet_id', outletId).order('created_at', { ascending: false }).limit(1000),
    supabase.from('reading_session').select('*').in('inventory_id',
      (await supabase.from('inventory').select('id').eq('outlet_id', outletId)).data?.map(i => i.id) ?? []
    ),
    supabase.from('outlet_transfer').select('*').or(`from_outlet_id.eq.${outletId},to_outlet_id.eq.${outletId}`),
    supabase.from('outlet_transfer_item').select('*'),
  ]);

  // Get Yjs catalog data
  const books = q.getAll<Book>('books');
  const series = q.getAll<Series>('series');
  const users = q.getAll<User>('users');

  return {
    version: '1.0.0',
    exported_at: new Date().toISOString(),
    outlet_id: outletId,
    outlet_name: outletName,
    tables: {
      outlet: outlet ?? [],
      staff: staff ?? [],
      inventory: inventory ?? [],
      stock_movements: stockMovements ?? [],
      transactions: transactions ?? [],
      transaction_items: transactionItems ?? [],
      payments: payments ?? [],
      receipts: receipts ?? [],
      suppliers: suppliers ?? [],
      purchase_orders: purchaseOrders ?? [],
      purchase_order_items: purchaseOrderItems ?? [],
      consignors: consignors ?? [],
      consignment_settlements: settlements ?? [],
      notifications: notifications ?? [],
      reading_sessions: readingSessions ?? [],
      outlet_transfers: transfers ?? [],
      outlet_transfer_items: transferItems ?? [],
    },
    yjs_catalog: { books, series, users },
  };
}

/**
 * Download backup as JSON file.
 */
export function downloadBackupJson(backup: BackupData): void {
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `libris-cafe-backup-${backup.outlet_name.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Generate SQL INSERT statements for all data (for migration to raw PostgreSQL).
 */
export function generateSqlBackup(backup: BackupData): string {
  const lines: string[] = [
    '-- Libris Cafe Data Backup',
    `-- Exported: ${backup.exported_at}`,
    `-- Outlet: ${backup.outlet_name} (${backup.outlet_id})`,
    '',
    'BEGIN;',
    '',
  ];

  for (const [tableName, rows] of Object.entries(backup.tables)) {
    if (!rows || rows.length === 0) continue;
    const dbTable = tableName === 'transactions' ? '"transaction"'
      : tableName === 'transaction_items' ? 'transaction_item'
      : tableName === 'stock_movements' ? 'stock_movement'
      : tableName === 'purchase_orders' ? 'purchase_order'
      : tableName === 'purchase_order_items' ? 'purchase_order_item'
      : tableName === 'consignment_settlements' ? 'consignment_settlement'
      : tableName === 'reading_sessions' ? 'reading_session'
      : tableName === 'outlet_transfers' ? 'outlet_transfer'
      : tableName === 'outlet_transfer_items' ? 'outlet_transfer_item'
      : tableName;

    lines.push(`-- ${tableName} (${rows.length} rows)`);
    for (const row of rows) {
      const cols = Object.keys(row);
      const vals = cols.map(c => {
        const v = row[c];
        if (v === null || v === undefined) return 'NULL';
        if (typeof v === 'number' || typeof v === 'boolean') return String(v);
        if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
        return `'${String(v).replace(/'/g, "''")}'`;
      });
      lines.push(`INSERT INTO ${dbTable} (${cols.join(', ')}) VALUES (${vals.join(', ')}) ON CONFLICT DO NOTHING;`);
    }
    lines.push('');
  }

  lines.push('COMMIT;');
  return lines.join('\n');
}

/**
 * Download backup as SQL file.
 */
export function downloadBackupSql(backup: BackupData): void {
  const sql = generateSqlBackup(backup);
  const blob = new Blob([sql], { type: 'text/sql' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `libris-cafe-backup-${backup.outlet_name.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.sql`;
  a.click();
  URL.revokeObjectURL(url);
}
