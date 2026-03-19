<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import { showConfirm } from '$lib/stores/dialog.svelte';
  import { getSupplierById, deactivateSupplier, getSupplierPOs } from '$lib/modules/supplier/service';
  import type { Supplier, PurchaseOrder } from '$lib/modules/supplier/types';

  let supplier = $state<Supplier | null>(null);
  let orders = $state<PurchaseOrder[]>([]);
  let loading = $state(true);

  const supplierId = page.params.id;

  onMount(async () => {
    try {
      supplier = await getSupplierById(supplierId);
      if (supplier) {
        orders = await getSupplierPOs(supplierId);
      }
    } finally {
      loading = false;
    }
  });

  async function handleDeactivate() {
    if (!supplier) return;
    const confirmed = await showConfirm({
      title: t('supplier.deactivate'),
      message: `Deactivate ${supplier.name}?`,
    });
    if (!confirmed) return;

    try {
      await deactivateSupplier(supplier.id);
      showToast('Supplier deactivated', 'success');
      goto(`${base}/owner/suppliers`);
    } catch (err) {
      showToast('Failed to deactivate', 'error');
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
  <div class="py-8 text-center text-sm text-ink-muted">Loading...</div>
{:else if !supplier}
  <div class="py-8 text-center text-sm text-ink-muted">Supplier not found</div>
{:else}
  <div class="space-y-4">
    <button class="text-sm text-ink-muted hover:text-accent" onclick={() => goto(`${base}/owner/suppliers`)}>
      &larr; {t('supplier.title')}
    </button>

    <!-- Supplier Info -->
    <div class="bg-surface rounded-xl border border-warm-100 p-4">
      <div class="flex items-start justify-between">
        <div>
          <h1 class="font-display text-lg font-bold text-ink">{supplier.name}</h1>
          {#if supplier.contact_name}
            <p class="text-sm text-ink-muted">{supplier.contact_name}</p>
          {/if}
        </div>
        <span class="text-[10px] px-1.5 py-0.5 rounded-full font-medium {supplier.is_active ? 'bg-sage/10 text-sage' : 'bg-warm-100 text-ink-muted'}">
          {supplier.is_active ? t('supplier.active') : t('supplier.inactive')}
        </span>
      </div>

      <div class="grid grid-cols-2 gap-3 mt-3 text-sm">
        <div>
          <span class="text-xs text-ink-muted uppercase">{t('supplier.phone')}</span>
          <p class="font-medium text-ink">{supplier.phone ?? '-'}</p>
        </div>
        <div>
          <span class="text-xs text-ink-muted uppercase">{t('supplier.email')}</span>
          <p class="font-medium text-ink">{supplier.email ?? '-'}</p>
        </div>
        <div>
          <span class="text-xs text-ink-muted uppercase">{t('supplier.address')}</span>
          <p class="font-medium text-ink">{supplier.address ?? '-'}</p>
        </div>
        <div>
          <span class="text-xs text-ink-muted uppercase">{t('supplier.lead_time')}</span>
          <p class="font-medium text-ink">{supplier.lead_time_days} days</p>
        </div>
      </div>

      {#if supplier.notes}
        <p class="text-xs text-ink-muted mt-3">{supplier.notes}</p>
      {/if}

      <div class="flex gap-2 mt-4">
        <a href="{base}/owner/purchase-orders/new?supplier={supplier.id}"
          class="flex-1 py-2.5 rounded-xl bg-accent text-cream font-medium text-sm text-center">
          {t('po.create')}
        </a>
        {#if supplier.is_active}
          <button onclick={handleDeactivate}
            class="px-4 py-2.5 rounded-xl bg-berry/10 text-berry font-medium text-sm">
            {t('supplier.deactivate')}
          </button>
        {/if}
      </div>
    </div>

    <!-- Purchase Order History -->
    <div class="bg-surface rounded-xl border border-warm-100">
      <div class="px-4 py-3 border-b border-warm-50">
        <h2 class="text-sm font-semibold text-ink uppercase tracking-wide">{t('po.title')}</h2>
      </div>

      {#if orders.length === 0}
        <div class="px-4 py-6 text-center text-sm text-ink-muted">{t('po.no_orders')}</div>
      {:else}
        <div class="divide-y divide-warm-50">
          {#each orders as po}
            <a href="{base}/owner/purchase-orders/{po.id}" class="block px-4 py-3 hover:bg-warm-50 transition-colors">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-medium text-ink">{formatDate(po.created_at)}</p>
                  <span class="text-[10px] px-1.5 py-0.5 rounded-full font-medium {statusClass(po.status)}">
                    {po.status}
                  </span>
                </div>
                <p class="text-sm font-semibold text-ink">{formatPrice(po.total)}</p>
              </div>
            </a>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}
