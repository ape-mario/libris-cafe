<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import { showConfirm } from '$lib/stores/dialog.svelte';
  import { getCurrentStaff } from '$lib/modules/auth/stores.svelte';
  import {
    getPurchaseOrderById, updatePOStatus, receivePurchaseOrder,
  } from '$lib/modules/supplier/service';
  import { addInventoryItem } from '$lib/modules/inventory/service';
  import { getInventoryByBookId } from '$lib/modules/inventory/service';
  import type { PurchaseOrder, PurchaseOrderItem } from '$lib/modules/supplier/types';

  let po = $state<PurchaseOrder | null>(null);
  let loading = $state(true);
  let processing = $state(false);
  let receivedQtys = $state<Record<string, number>>({});

  const poId = page.params.id;
  let staff = $derived(getCurrentStaff());

  onMount(async () => {
    try {
      po = await getPurchaseOrderById(poId);
      if (po?.items) {
        for (const item of po.items) {
          receivedQtys[item.id] = item.received_quantity;
        }
      }
    } finally {
      loading = false;
    }
  });

  async function handleMarkOrdered() {
    if (!po) return;
    const confirmed = await showConfirm({
      title: t('po.mark_ordered'),
      message: 'This will mark the PO as sent to supplier.',
    });
    if (!confirmed) return;

    processing = true;
    try {
      await updatePOStatus(po.id, 'ordered');
      po = { ...po, status: 'ordered', ordered_at: new Date().toISOString() };
      showToast('PO marked as ordered', 'success');
    } catch (err) {
      showToast('Failed to update PO', 'error');
    } finally {
      processing = false;
    }
  }

  async function handleReceiveGoods() {
    if (!po?.items || !staff) return;

    const confirmed = await showConfirm({
      title: t('po.receive_goods'),
      message: t('po.receive_confirm'),
    });
    if (!confirmed) return;

    processing = true;
    try {
      const receivedItems = [];

      for (const item of po.items) {
        const qty = receivedQtys[item.id] ?? 0;
        if (qty <= 0) continue;

        // Find or create inventory record for this book
        let inventoryId: string;

        if (item.book_id) {
          const existing = await getInventoryByBookId(item.book_id, staff.outlet_id);
          if (existing) {
            inventoryId = existing.id;
          } else {
            const newInv = await addInventoryItem({
              book_id: item.book_id,
              outlet_id: staff.outlet_id,
              type: 'for_sale',
              source: 'supplier',
              is_preloved: false,
              price: item.unit_price,
              cost_price: item.unit_price,
              stock: 0, // Will be updated via stock movement
              condition: 'new',
            });
            inventoryId = newInv.id;
          }
        } else {
          // No book_id — need to create a placeholder.
          // In practice, the owner should link the book_id before receiving.
          continue;
        }

        receivedItems.push({
          itemId: item.id,
          inventoryId,
          receivedQty: qty,
        });
      }

      await receivePurchaseOrder(po.id, receivedItems, staff.id);
      po = { ...po, status: 'received', received_at: new Date().toISOString() };
      showToast('Goods received and stock updated', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to receive goods', 'error');
    } finally {
      processing = false;
    }
  }

  async function handleCancel() {
    if (!po) return;
    const confirmed = await showConfirm({
      title: t('po.cancel'),
      message: 'Cancel this purchase order?',
    });
    if (!confirmed) return;

    processing = true;
    try {
      await updatePOStatus(po.id, 'cancelled');
      po = { ...po, status: 'cancelled' };
      showToast('PO cancelled', 'success');
    } catch (err) {
      showToast('Failed to cancel PO', 'error');
    } finally {
      processing = false;
    }
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatPrice(amount: number): string {
    return `Rp ${amount.toLocaleString('id-ID')}`;
  }

  function statusClass(status: string): string {
    switch (status) {
      case 'draft': return 'bg-warm-100 text-ink-muted';
      case 'ordered': return 'bg-accent/10 text-accent';
      case 'received': return 'bg-sage/10 text-sage';
      case 'cancelled': return 'bg-berry/10 text-berry';
      default: return 'bg-warm-100 text-ink-muted';
    }
  }
</script>

{#if loading}
  <div class="py-8 text-center text-sm text-ink-muted">{t('common.loading')}</div>
{:else if !po}
  <div class="py-8 text-center text-sm text-ink-muted">Purchase order not found</div>
{:else}
  <div class="space-y-4">
    <button class="text-sm text-ink-muted hover:text-accent" onclick={() => goto(`${base}/owner/purchase-orders`)}>
      &larr; {t('po.title')}
    </button>

    <!-- PO Header -->
    <div class="bg-surface rounded-xl border border-warm-100 p-4">
      <div class="flex items-start justify-between">
        <div>
          <h1 class="font-display text-lg font-bold text-ink">
            {(po.supplier as any)?.name ?? 'Unknown Supplier'}
          </h1>
          <p class="text-xs text-ink-muted">Created: {formatDate(po.created_at)}</p>
          {#if po.ordered_at}
            <p class="text-xs text-ink-muted">Ordered: {formatDate(po.ordered_at)}</p>
          {/if}
          {#if po.received_at}
            <p class="text-xs text-ink-muted">Received: {formatDate(po.received_at)}</p>
          {/if}
        </div>
        <span class="text-xs px-2 py-0.5 rounded-full font-medium {statusClass(po.status)}">
          {t(`po.status_${po.status}`)}
        </span>
      </div>

      {#if po.notes}
        <p class="text-xs text-ink-muted mt-2">{po.notes}</p>
      {/if}

      <p class="text-lg font-bold text-ink mt-3">{t('po.total')}: {formatPrice(po.total)}</p>
    </div>

    <!-- Items -->
    <div class="bg-surface rounded-xl border border-warm-100">
      <div class="px-4 py-3 border-b border-warm-50">
        <h2 class="text-sm font-semibold text-ink uppercase tracking-wide">{t('po.items')}</h2>
      </div>
      <div class="divide-y divide-warm-50">
        {#each (po.items ?? []) as item}
          <div class="px-4 py-3">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium text-ink">{item.title}</p>
                {#if item.isbn}
                  <p class="text-xs text-ink-muted">ISBN: {item.isbn}</p>
                {/if}
              </div>
              <div class="text-right text-sm">
                <p>{item.quantity} x {formatPrice(item.unit_price)}</p>
                <p class="font-semibold">{formatPrice(item.quantity * item.unit_price)}</p>
              </div>
            </div>

            {#if po.status === 'ordered'}
              <div class="mt-2 flex items-center gap-2">
                <label class="text-xs text-ink-muted">{t('po.received_qty')}:</label>
                <input type="number" min="0" max={item.quantity}
                  bind:value={receivedQtys[item.id]}
                  class="w-20 px-2 py-1 rounded-lg bg-cream border border-warm-100 text-sm text-center focus:outline-none focus:ring-2 focus:ring-accent/30" />
                <span class="text-xs text-ink-muted">/ {item.quantity}</span>
              </div>
            {:else if po.status === 'received'}
              <p class="text-xs text-sage mt-1">{t('po.received_qty')}: {item.received_quantity} / {item.quantity}</p>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <!-- Actions -->
    {#if po.status === 'draft'}
      <div class="flex gap-2">
        <button onclick={handleMarkOrdered} disabled={processing}
          class="flex-1 py-3 rounded-xl bg-accent text-cream font-semibold text-sm disabled:opacity-50">
          {t('po.mark_ordered')}
        </button>
        <button onclick={handleCancel} disabled={processing}
          class="px-4 py-3 rounded-xl bg-berry/10 text-berry font-medium text-sm">
          {t('po.cancel')}
        </button>
      </div>
    {:else if po.status === 'ordered'}
      <button onclick={handleReceiveGoods} disabled={processing}
        class="w-full py-3 rounded-xl bg-sage text-cream font-semibold text-sm disabled:opacity-50">
        {t('po.receive_goods')}
      </button>
    {/if}
  </div>
{/if}
