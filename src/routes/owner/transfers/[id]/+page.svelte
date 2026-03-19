<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import TransferStatusBadge from '$lib/components/TransferStatusBadge.svelte';
  import {
    fetchTransfer,
    approveTransfer,
    shipTransfer,
    receiveTransfer,
    cancelTransfer,
    getNextStatuses,
  } from '$lib/modules/outlet/transfer';
  import { getCurrentStaff } from '$lib/modules/auth/stores.svelte';
  import type { OutletTransfer, TransferStatus } from '$lib/modules/outlet/types';

  let transfer = $state<OutletTransfer | null>(null);
  let loading = $state(true);
  let acting = $state(false);
  let cancelReason = $state('');
  let showCancelForm = $state(false);

  // Editable shipped/received quantities
  let shippedQtys = $state<Record<string, number>>({});
  let receivedQtys = $state<Record<string, number>>({});

  const transferId = $derived(page.params.id);

  onMount(async () => {
    await loadTransfer();
  });

  async function loadTransfer() {
    loading = true;
    try {
      transfer = await fetchTransfer(transferId);
      if (transfer?.items) {
        // Init quantity editors
        for (const item of transfer.items) {
          shippedQtys[item.id] = item.quantity_shipped || item.quantity_requested;
          receivedQtys[item.id] = item.quantity_received || item.quantity_shipped || item.quantity_requested;
        }
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      loading = false;
    }
  }

  let nextStatuses = $derived(
    transfer ? getNextStatuses(transfer.status) : []
  );

  async function handleApprove() {
    const staff = getCurrentStaff();
    if (!staff) return;
    acting = true;
    try {
      await approveTransfer(transferId, staff.id);
      showToast(t('transfer.approved'), 'success');
      await loadTransfer();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      acting = false;
    }
  }

  async function handleShip() {
    const staff = getCurrentStaff();
    if (!staff || !transfer?.items) return;
    acting = true;
    try {
      const quantities = transfer.items.map(item => ({
        itemId: item.id,
        quantity: shippedQtys[item.id] ?? item.quantity_requested,
      }));
      await shipTransfer(transferId, staff.id, quantities);
      showToast(t('transfer.shipped'), 'success');
      await loadTransfer();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      acting = false;
    }
  }

  async function handleReceive() {
    const staff = getCurrentStaff();
    if (!staff || !transfer?.items) return;
    acting = true;
    try {
      const quantities = transfer.items.map(item => ({
        itemId: item.id,
        inventoryId: item.inventory_id,
        quantity: receivedQtys[item.id] ?? item.quantity_shipped,
      }));
      await receiveTransfer(transferId, staff.id, quantities);
      showToast(t('transfer.received'), 'success');
      await loadTransfer();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      acting = false;
    }
  }

  async function handleCancel() {
    if (!cancelReason.trim()) return;
    const staff = getCurrentStaff();
    if (!staff) return;
    acting = true;
    try {
      await cancelTransfer(transferId, staff.id, cancelReason.trim());
      showToast(t('transfer.cancelled'), 'success');
      showCancelForm = false;
      cancelReason = '';
      await loadTransfer();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      acting = false;
    }
  }

  function formatDateTime(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }
</script>

<div class="p-4 max-w-3xl mx-auto">
  <a href="{base}/owner/transfers" class="text-sm text-warm-400 hover:text-warm-600 mb-4 inline-block">
    &larr; {t('transfer.title')}
  </a>

  {#if loading}
    <div class="text-center py-12 text-warm-400">{t('app.loading')}</div>
  {:else if !transfer}
    <div class="text-center py-12 text-warm-400">Transfer not found</div>
  {:else}
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <div class="flex items-center gap-3 mb-1">
          <h1 class="text-2xl font-bold text-warm-800">Transfer</h1>
          <TransferStatusBadge status={transfer.status} />
        </div>
        <div class="text-sm text-warm-500">
          {transfer.from_outlet?.name ?? '—'}
          &rarr;
          {transfer.to_outlet?.name ?? '—'}
        </div>
      </div>
    </div>

    <!-- Timeline -->
    <div class="bg-white rounded-xl border border-warm-200 p-4 mb-4">
      <div class="space-y-3 text-sm">
        <div class="flex justify-between">
          <span class="text-warm-500">{t('transfer.requested_at')}</span>
          <span class="text-warm-700">{formatDateTime(transfer.requested_at)}</span>
        </div>
        {#if transfer.approved_at}
          <div class="flex justify-between">
            <span class="text-warm-500">{t('transfer.approved_at')}</span>
            <span class="text-warm-700">{formatDateTime(transfer.approved_at)}</span>
          </div>
        {/if}
        {#if transfer.shipped_at}
          <div class="flex justify-between">
            <span class="text-warm-500">{t('transfer.shipped_at')}</span>
            <span class="text-warm-700">{formatDateTime(transfer.shipped_at)}</span>
          </div>
        {/if}
        {#if transfer.received_at}
          <div class="flex justify-between">
            <span class="text-warm-500">{t('transfer.received_at')}</span>
            <span class="text-warm-700">{formatDateTime(transfer.received_at)}</span>
          </div>
        {/if}
        {#if transfer.cancel_reason}
          <div class="flex justify-between text-red-600">
            <span>Cancellation reason</span>
            <span>{transfer.cancel_reason}</span>
          </div>
        {/if}
        {#if transfer.notes}
          <div class="flex justify-between">
            <span class="text-warm-500">{t('transfer.notes')}</span>
            <span class="text-warm-700">{transfer.notes}</span>
          </div>
        {/if}
      </div>
    </div>

    <!-- Items -->
    <div class="bg-white rounded-xl border border-warm-200 p-4 mb-4">
      <h2 class="font-semibold text-warm-800 mb-3">{t('transfer.items')}</h2>
      <div class="space-y-2">
        {#each transfer.items ?? [] as item (item.id)}
          <div class="flex items-center gap-3 py-2 border-b border-warm-100 last:border-0">
            <div class="flex-1 min-w-0">
              <div class="font-medium text-warm-700 truncate">{item.title}</div>
              <div class="text-xs text-warm-400">{item.book_id}</div>
            </div>
            <div class="grid grid-cols-3 gap-3 text-center text-sm">
              <div>
                <div class="text-xs text-warm-400">{t('transfer.qty_requested')}</div>
                <div class="font-medium">{item.quantity_requested}</div>
              </div>
              <div>
                <div class="text-xs text-warm-400">{t('transfer.qty_shipped')}</div>
                {#if transfer.status === 'approved'}
                  <input
                    type="number"
                    bind:value={shippedQtys[item.id]}
                    min="0" max={item.quantity_requested}
                    class="w-16 px-1 py-0.5 text-center text-sm rounded border
                           border-warm-200 focus:border-sage outline-none"
                  />
                {:else}
                  <div class="font-medium">{item.quantity_shipped}</div>
                {/if}
              </div>
              <div>
                <div class="text-xs text-warm-400">{t('transfer.qty_received')}</div>
                {#if transfer.status === 'shipped'}
                  <input
                    type="number"
                    bind:value={receivedQtys[item.id]}
                    min="0" max={item.quantity_shipped}
                    class="w-16 px-1 py-0.5 text-center text-sm rounded border
                           border-warm-200 focus:border-sage outline-none"
                  />
                {:else}
                  <div class="font-medium">{item.quantity_received}</div>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>

    <!-- Actions -->
    {#if nextStatuses.length > 0}
      <div class="flex flex-wrap gap-2">
        {#if nextStatuses.includes('approved')}
          <button
            disabled={acting}
            class="px-4 py-2 bg-sky-500 text-white rounded-lg font-medium
                   hover:bg-sky-600 transition-colors disabled:opacity-50"
            onclick={handleApprove}
          >
            {t('transfer.approve')}
          </button>
        {/if}
        {#if nextStatuses.includes('shipped')}
          <button
            disabled={acting}
            class="px-4 py-2 bg-violet-500 text-white rounded-lg font-medium
                   hover:bg-violet-600 transition-colors disabled:opacity-50"
            onclick={handleShip}
          >
            {t('transfer.ship')}
          </button>
        {/if}
        {#if nextStatuses.includes('received')}
          <button
            disabled={acting}
            class="px-4 py-2 bg-sage text-white rounded-lg font-medium
                   hover:bg-sage-600 transition-colors disabled:opacity-50"
            onclick={handleReceive}
          >
            {t('transfer.receive')}
          </button>
        {/if}
        {#if nextStatuses.includes('cancelled')}
          {#if showCancelForm}
            <div class="flex gap-2 items-center">
              <input
                type="text"
                bind:value={cancelReason}
                placeholder={t('transfer.cancel_reason')}
                class="px-3 py-2 rounded-lg border border-warm-200
                       focus:border-red-300 outline-none text-sm"
              />
              <button
                disabled={acting || !cancelReason.trim()}
                class="px-4 py-2 bg-red-500 text-white rounded-lg font-medium
                       hover:bg-red-600 transition-colors disabled:opacity-50"
                onclick={handleCancel}
              >
                {t('transfer.cancel')}
              </button>
            </div>
          {:else}
            <button
              class="px-4 py-2 bg-warm-100 text-warm-600 rounded-lg font-medium
                     hover:bg-warm-200 transition-colors"
              onclick={() => { showCancelForm = true; }}
            >
              {t('transfer.cancel')}
            </button>
          {/if}
        {/if}
      </div>
    {/if}
  {/if}
</div>
