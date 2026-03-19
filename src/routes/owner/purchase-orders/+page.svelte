<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { getCurrentStaff } from '$lib/modules/auth/stores.svelte';
  import { getPurchaseOrders } from '$lib/modules/supplier/service';
  import type { PurchaseOrder, PurchaseOrderStatus } from '$lib/modules/supplier/types';

  let orders = $state<PurchaseOrder[]>([]);
  let loading = $state(true);
  let filterStatus = $state<PurchaseOrderStatus | 'all'>('all');

  const staff = getCurrentStaff();

  onMount(async () => {
    if (!staff) return;
    try {
      orders = await getPurchaseOrders(staff.outlet_id);
    } finally {
      loading = false;
    }
  });

  let filtered = $derived(
    filterStatus === 'all' ? orders : orders.filter(o => o.status === filterStatus)
  );

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

  const statuses: Array<PurchaseOrderStatus | 'all'> = ['all', 'draft', 'ordered', 'received', 'cancelled'];
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h1 class="font-display text-xl font-bold text-ink">{t('po.title')}</h1>
    <a href="{base}/owner/purchase-orders/new"
      class="px-4 py-2 rounded-xl bg-accent text-cream text-sm font-medium">
      + {t('po.create')}
    </a>
  </div>

  <!-- Status filter -->
  <div class="flex gap-2 overflow-x-auto pb-1">
    {#each statuses as s}
      <button
        class="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors {filterStatus === s ? 'bg-accent text-cream' : 'bg-surface text-ink-muted border border-warm-100'}"
        onclick={() => filterStatus = s}
      >
        {s === 'all' ? 'All' : t(`po.status_${s}`)}
        ({s === 'all' ? orders.length : orders.filter(o => o.status === s).length})
      </button>
    {/each}
  </div>

  {#if loading}
    <div class="py-8 text-center text-sm text-ink-muted">Loading...</div>
  {:else if filtered.length === 0}
    <div class="py-8 text-center text-sm text-ink-muted">{t('po.no_orders')}</div>
  {:else}
    <div class="space-y-2">
      {#each filtered as po}
        <a href="{base}/owner/purchase-orders/{po.id}"
          class="block bg-surface rounded-xl border border-warm-100 px-4 py-3 hover:border-accent/30 transition-colors">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-ink">{(po as any).supplier?.name ?? 'Unknown Supplier'}</p>
              <p class="text-xs text-ink-muted">{formatDate(po.created_at)}</p>
            </div>
            <div class="text-right">
              <p class="text-sm font-semibold text-ink">{formatPrice(po.total)}</p>
              <span class="text-[10px] px-1.5 py-0.5 rounded-full font-medium {statusClass(po.status)}">
                {t(`po.status_${po.status}`)}
              </span>
            </div>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
