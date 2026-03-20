<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import TransferStatusBadge from '$lib/components/TransferStatusBadge.svelte';
  import { fetchTransfers, createTransfer } from '$lib/modules/outlet/transfer';
  import { fetchOutlets } from '$lib/modules/outlet/service';
  import { getInventoryByOutlet } from '$lib/modules/inventory/service';
  import { getCurrentStaff } from '$lib/modules/auth/stores.svelte';
  import { getActiveOutletId } from '$lib/modules/outlet/stores.svelte';
  import type { OutletTransfer, Outlet } from '$lib/modules/outlet/types';
  import type { TransferStatus } from '$lib/modules/outlet/types';

  let transfers = $state<OutletTransfer[]>([]);
  let outlets = $state<Outlet[]>([]);
  let loading = $state(true);
  let statusFilter = $state<TransferStatus | ''>('');

  // New transfer form state
  let showForm = $state(false);
  let fromOutletId = $state('');
  let toOutletId = $state('');
  let transferNotes = $state('');
  let transferItems = $state<{ inventory_id: string; book_id: string; title: string; quantity_requested: number }[]>([]);
  let inventoryList = $state<any[]>([]);
  let creating = $state(false);

  onMount(async () => {
    try {
      const [t, o] = await Promise.all([fetchTransfers(), fetchOutlets()]);
      transfers = t;
      outlets = o;
      fromOutletId = getActiveOutletId() ?? '';
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      loading = false;
    }
  });

  let filteredTransfers = $derived(
    statusFilter
      ? transfers.filter(tx => tx.status === statusFilter)
      : transfers
  );

  async function loadInventoryForOutlet(outletId: string) {
    try {
      inventoryList = await getInventoryByOutlet(outletId);
    } catch {
      inventoryList = [];
      showToast(t('error.generic'), 'error');
    }
  }

  function addItem(inv: any) {
    if (transferItems.find(i => i.inventory_id === inv.id)) return;
    transferItems = [...transferItems, {
      inventory_id: inv.id,
      book_id: inv.book_id,
      title: inv.book?.title ?? inv.book_id,
      quantity_requested: 1,
    }];
  }

  function removeItem(inventoryId: string) {
    transferItems = transferItems.filter(i => i.inventory_id !== inventoryId);
  }

  function updateItemQuantity(inventoryId: string, qty: number) {
    transferItems = transferItems.map(i =>
      i.inventory_id === inventoryId ? { ...i, quantity_requested: Math.max(1, qty) } : i
    );
  }

  async function handleCreateTransfer() {
    if (!fromOutletId || !toOutletId || transferItems.length === 0) return;
    const staff = getCurrentStaff();
    if (!staff) return;

    creating = true;
    try {
      await createTransfer({
        from_outlet_id: fromOutletId,
        to_outlet_id: toOutletId,
        items: transferItems,
        notes: transferNotes.trim() || undefined,
      }, staff.id);
      showToast(t('transfer.created'), 'success');
      showForm = false;
      transferItems = [];
      transferNotes = '';
      transfers = await fetchTransfers();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      creating = false;
    }
  }

  $effect(() => {
    if (fromOutletId) loadInventoryForOutlet(fromOutletId);
  });

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  }
</script>

<div class="p-4 max-w-3xl mx-auto">
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold text-ink">{t('transfer.title')}</h1>
    <button
      class="px-4 py-2 bg-sage text-white rounded-lg font-medium
             hover:bg-sage-600 transition-colors"
      onclick={() => { showForm = !showForm; }}
    >
      {t('transfer.create')}
    </button>
  </div>

  {#if showForm}
    <form
      class="bg-surface rounded-xl border border-warm-200 p-4 mb-6 space-y-4"
      onsubmit={(e) => { e.preventDefault(); handleCreateTransfer(); }}
    >
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-ink-light mb-1">{t('transfer.from')}</label>
          <select
            bind:value={fromOutletId}
            class="w-full px-3 py-2 rounded-lg border border-warm-200
                   focus:border-sage outline-none"
          >
            {#each outlets as o (o.id)}
              <option value={o.id}>{o.name}</option>
            {/each}
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-ink-light mb-1">{t('transfer.to')}</label>
          <select
            bind:value={toOutletId}
            class="w-full px-3 py-2 rounded-lg border border-warm-200
                   focus:border-sage outline-none"
          >
            <option value="">-- Select --</option>
            {#each outlets.filter(o => o.id !== fromOutletId) as o (o.id)}
              <option value={o.id}>{o.name}</option>
            {/each}
          </select>
        </div>
      </div>

      <!-- Inventory picker -->
      <div>
        <label class="block text-sm font-medium text-ink-light mb-1">{t('transfer.items')}</label>
        {#if inventoryList.length > 0}
          <div class="max-h-40 overflow-y-auto border border-warm-100 rounded-lg p-2 space-y-1">
            {#each inventoryList as inv (inv.id)}
              <button
                type="button"
                class="w-full text-left px-2 py-1 text-sm rounded hover:bg-warm-50
                       transition-colors flex justify-between items-center"
                onclick={() => addItem(inv)}
              >
                <span class="truncate">{inv.book?.title ?? inv.book_id}</span>
                <span class="text-xs text-warm-400 ml-2">stok: {inv.stock}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Selected items -->
      {#if transferItems.length > 0}
        <div class="space-y-2">
          {#each transferItems as item (item.inventory_id)}
            <div class="flex items-center gap-2 bg-warm-50 rounded-lg px-3 py-2">
              <span class="flex-1 text-sm truncate">{item.title}</span>
              <input
                type="number"
                value={item.quantity_requested}
                min="1"
                class="w-20 px-2 py-1 text-sm rounded border border-warm-200 text-center"
                onchange={(e) => updateItemQuantity(item.inventory_id, parseInt((e.target as HTMLInputElement).value) || 1)}
              />
              <button
                type="button"
                class="text-warm-400 hover:text-red-500 transition-colors"
                onclick={() => removeItem(item.inventory_id)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2">
                  <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                </svg>
              </button>
            </div>
          {/each}
        </div>
      {/if}

      <div>
        <label class="block text-sm font-medium text-ink-light mb-1">{t('transfer.notes')}</label>
        <textarea
          bind:value={transferNotes}
          rows="2"
          class="w-full px-3 py-2 rounded-lg border border-warm-200
                 focus:border-sage outline-none resize-none"
        ></textarea>
      </div>

      <div class="flex gap-2">
        <button
          type="submit"
          disabled={creating || !toOutletId || transferItems.length === 0}
          class="px-4 py-2 bg-sage text-white rounded-lg font-medium
                 hover:bg-sage-600 transition-colors disabled:opacity-50"
        >
          {creating ? t('app.loading') : t('transfer.create')}
        </button>
        <button
          type="button"
          onclick={() => { showForm = false; }}
          class="px-4 py-2 bg-warm-100 text-ink-light rounded-lg font-medium
                 hover:bg-warm-200 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  {/if}

  <!-- Status filter -->
  <div class="flex gap-2 mb-4 overflow-x-auto">
    <button
      class="px-3 py-1 rounded-full text-sm font-medium transition-colors
             {statusFilter === '' ? 'bg-warm-800 text-white' : 'bg-warm-100 text-ink-light'}"
      onclick={() => { statusFilter = ''; }}
    >
      All
    </button>
    {#each ['requested', 'approved', 'shipped', 'received', 'cancelled'] as s}
      <button
        class="px-3 py-1 rounded-full text-sm font-medium transition-colors
               {statusFilter === s ? 'bg-warm-800 text-white' : 'bg-warm-100 text-ink-light'}"
        onclick={() => { statusFilter = s as TransferStatus; }}
      >
        {t(`transfer.status.${s}`)}
      </button>
    {/each}
  </div>

  <!-- Transfer list -->
  {#if loading}
    <div class="text-center py-12 text-warm-400">{t('app.loading')}</div>
  {:else if filteredTransfers.length === 0}
    <div class="text-center py-12 text-warm-400">{t('transfer.empty')}</div>
  {:else}
    <div class="space-y-3">
      {#each filteredTransfers as tx (tx.id)}
        <a
          href="{base}/owner/transfers/{tx.id}"
          class="block bg-surface rounded-xl border border-warm-200 p-4
                 hover:border-warm-300 transition-colors"
        >
          <div class="flex items-center justify-between mb-2">
            <TransferStatusBadge status={tx.status} />
            <span class="text-xs text-warm-400">{formatDate(tx.requested_at)}</span>
          </div>
          <div class="flex items-center gap-2 text-sm">
            <span class="font-medium text-warm-700">{tx.from_outlet?.name ?? '—'}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2" class="text-warm-400">
              <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
            </svg>
            <span class="font-medium text-warm-700">{tx.to_outlet?.name ?? '—'}</span>
          </div>
          {#if tx.items}
            <div class="text-xs text-warm-400 mt-1">
              {tx.items.length} item{tx.items.length !== 1 ? 's' : ''},
              {tx.items.reduce((sum, i) => sum + i.quantity_requested, 0)} total qty
            </div>
          {/if}
        </a>
      {/each}
    </div>
  {/if}
</div>
