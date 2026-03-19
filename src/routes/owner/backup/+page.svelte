<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import { getCurrentStaff } from '$lib/modules/auth/stores.svelte';
  import { getActiveOutlet } from '$lib/modules/outlet/stores.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import { exportFullBackup, downloadBackupJson, downloadBackupSql } from '$lib/modules/backup/service';
  import type { BackupData } from '$lib/modules/backup/types';

  let staff = $derived(getCurrentStaff());
  let outlet = $derived(getActiveOutlet());
  let exporting = $state(false);
  let backupData = $state<BackupData | null>(null);

  const tableLabels: Record<string, string> = {
    outlet: 'Outlets',
    staff: 'Staff',
    inventory: 'Inventory',
    stock_movements: 'Stock Movements',
    transactions: 'Transactions',
    transaction_items: 'Transaction Items',
    payments: 'Payments',
    receipts: 'Receipts',
    suppliers: 'Suppliers',
    purchase_orders: 'Purchase Orders',
    purchase_order_items: 'PO Items',
    consignors: 'Consignors',
    consignment_settlements: 'Settlements',
    notifications: 'Notifications',
    reading_sessions: 'Reading Sessions',
    outlet_transfers: 'Transfers',
    outlet_transfer_items: 'Transfer Items',
  };

  async function handleExport(format: 'json' | 'sql') {
    if (!staff || !outlet) return;
    exporting = true;
    try {
      const data = await exportFullBackup(outlet.id, outlet.name);
      backupData = data;
      if (format === 'json') {
        downloadBackupJson(data);
      } else {
        downloadBackupSql(data);
      }
      showToast(t('backup.success'), 'success');
    } catch (e) {
      console.error('Backup failed:', e);
      showToast(t('backup.error'), 'error');
    } finally {
      exporting = false;
    }
  }

  function totalRecords(data: BackupData): number {
    let count = 0;
    for (const rows of Object.values(data.tables)) {
      count += rows?.length ?? 0;
    }
    count += data.yjs_catalog.books.length;
    count += data.yjs_catalog.series.length;
    count += data.yjs_catalog.users.length;
    return count;
  }
</script>

<div class="space-y-6 pb-8">
  <!-- Header -->
  <div>
    <h1 class="font-display text-xl font-bold text-ink">{t('backup.title')}</h1>
    <p class="text-sm text-ink-muted mt-1">{t('backup.description')}</p>
  </div>

  <!-- Export Buttons -->
  <div class="grid gap-4">
    <!-- JSON Export -->
    <button
      class="w-full text-left bg-cream rounded-xl p-4 shadow-sm border border-sand/50 hover:border-accent/30 transition-colors disabled:opacity-50"
      onclick={() => handleExport('json')}
      disabled={exporting || !outlet}
    >
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div class="min-w-0">
          <div class="font-semibold text-ink text-sm">
            {exporting ? t('backup.exporting') : t('backup.export_json')}
          </div>
          <div class="text-xs text-ink-muted mt-0.5">{t('backup.json_desc')}</div>
        </div>
      </div>
    </button>

    <!-- SQL Export -->
    <button
      class="w-full text-left bg-cream rounded-xl p-4 shadow-sm border border-sand/50 hover:border-accent/30 transition-colors disabled:opacity-50"
      onclick={() => handleExport('sql')}
      disabled={exporting || !outlet}
    >
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg bg-berry/10 flex items-center justify-center text-berry shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
          </svg>
        </div>
        <div class="min-w-0">
          <div class="font-semibold text-ink text-sm">
            {exporting ? t('backup.exporting') : t('backup.export_sql')}
          </div>
          <div class="text-xs text-ink-muted mt-0.5">{t('backup.sql_desc')}</div>
        </div>
      </div>
    </button>
  </div>

  <!-- Data Summary (shown after export) -->
  {#if backupData}
    <div class="bg-cream rounded-xl p-4 shadow-sm border border-sand/50">
      <h2 class="font-semibold text-ink text-sm mb-3">{t('backup.tables')}</h2>
      <div class="text-xs text-ink-muted mb-3">
        {t('backup.records', { count: totalRecords(backupData) })} total
      </div>
      <div class="space-y-1.5">
        {#each Object.entries(backupData.tables) as [key, rows]}
          <div class="flex items-center justify-between text-xs">
            <span class="text-ink-muted">{tableLabels[key] ?? key}</span>
            <span class="font-medium text-ink tabular-nums">{rows?.length ?? 0}</span>
          </div>
        {/each}
        <!-- Yjs catalog -->
        <div class="border-t border-sand/50 pt-1.5 mt-2">
          <div class="flex items-center justify-between text-xs">
            <span class="text-ink-muted">Catalog Books</span>
            <span class="font-medium text-ink tabular-nums">{backupData.yjs_catalog.books.length}</span>
          </div>
          <div class="flex items-center justify-between text-xs">
            <span class="text-ink-muted">Catalog Series</span>
            <span class="font-medium text-ink tabular-nums">{backupData.yjs_catalog.series.length}</span>
          </div>
          <div class="flex items-center justify-between text-xs">
            <span class="text-ink-muted">Catalog Users</span>
            <span class="font-medium text-ink tabular-nums">{backupData.yjs_catalog.users.length}</span>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
