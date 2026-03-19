<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { getCurrentStaff } from '$lib/modules/auth/stores.svelte';
  import { getRestockSuggestions } from '$lib/modules/restock/engine';
  import type { RestockSuggestion, RestockUrgency } from '$lib/modules/restock/types';

  let suggestions = $state<RestockSuggestion[]>([]);
  let loading = $state(true);
  let filterUrgency = $state<RestockUrgency | 'all'>('all');

  let staff = $derived(getCurrentStaff());

  onMount(async () => {
    if (!staff) return;
    try {
      suggestions = await getRestockSuggestions(staff.outlet_id);
    } catch (err) {
      console.error('Failed to load restock suggestions:', err);
    } finally {
      loading = false;
    }
  });

  let filtered = $derived(
    filterUrgency === 'all'
      ? suggestions
      : suggestions.filter(s => s.urgency === filterUrgency)
  );

  function urgencyClass(urgency: RestockUrgency): string {
    switch (urgency) {
      case 'critical': return 'bg-berry/10 text-berry';
      case 'urgent': return 'bg-accent/10 text-accent';
      case 'warning': return 'bg-gold/10 text-gold';
      default: return 'bg-sage/10 text-sage';
    }
  }

  function urgencyLabel(urgency: RestockUrgency): string {
    switch (urgency) {
      case 'critical': return t('restock.urgency_critical');
      case 'urgent': return t('restock.urgency_urgent');
      case 'warning': return t('restock.urgency_warning');
      default: return 'OK';
    }
  }

  const urgencies: Array<RestockUrgency | 'all'> = ['all', 'critical', 'urgent', 'warning'];
</script>

<div class="space-y-4">
  <h1 class="font-display text-xl font-bold text-ink">{t('restock.title')}</h1>

  <!-- Filter -->
  <div class="flex gap-2 overflow-x-auto pb-1">
    {#each urgencies as u}
      <button
        class="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors {filterUrgency === u ? 'bg-accent text-cream' : 'bg-surface text-ink-muted border border-warm-100'}"
        onclick={() => filterUrgency = u}
      >
        {u === 'all' ? 'All' : urgencyLabel(u)}
        ({u === 'all' ? suggestions.length : suggestions.filter(s => s.urgency === u).length})
      </button>
    {/each}
  </div>

  {#if loading}
    <div class="py-8 text-center text-sm text-ink-muted">Analyzing stock levels...</div>
  {:else if suggestions.length === 0}
    <div class="py-12 text-center">
      <p class="text-sm text-sage font-medium">{t('restock.no_suggestions')}</p>
    </div>
  {:else if filtered.length === 0}
    <div class="py-8 text-center text-sm text-ink-muted">No items at this urgency level</div>
  {:else}
    <div class="space-y-2">
      {#each filtered as item}
        <div class="bg-surface rounded-xl border border-warm-100 px-4 py-3">
          <div class="flex items-start justify-between">
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-ink truncate">{item.book_title}</p>
              {#if item.supplier_name}
                <p class="text-xs text-ink-muted">{item.supplier_name}</p>
              {/if}
            </div>
            <span class="text-[10px] px-1.5 py-0.5 rounded-full font-bold {urgencyClass(item.urgency)}">
              {urgencyLabel(item.urgency)}
            </span>
          </div>

          <div class="grid grid-cols-4 gap-2 mt-3 text-center">
            <div>
              <p class="text-[10px] text-ink-muted uppercase">{t('restock.current_stock')}</p>
              <p class="text-sm font-semibold text-ink">{item.current_stock}</p>
            </div>
            <div>
              <p class="text-[10px] text-ink-muted uppercase">{t('restock.avg_daily_sales')}</p>
              <p class="text-sm font-semibold text-ink">{item.avg_daily_sales.toFixed(1)}</p>
            </div>
            <div>
              <p class="text-[10px] text-ink-muted uppercase">{t('restock.days_until_stockout')}</p>
              <p class="text-sm font-semibold {item.days_until_stockout !== null && item.days_until_stockout < 7 ? 'text-berry' : 'text-ink'}">
                {item.days_until_stockout !== null ? `${item.days_until_stockout}d` : '-'}
              </p>
            </div>
            <div>
              <p class="text-[10px] text-ink-muted uppercase">{t('restock.suggested_qty')}</p>
              <p class="text-sm font-bold text-accent">{item.suggested_quantity}</p>
            </div>
          </div>

          {#if item.supplier_id}
            <a href="{base}/owner/purchase-orders/new?supplier={item.supplier_id}"
              class="mt-3 block w-full py-2 rounded-lg bg-accent/10 text-accent text-xs font-medium text-center">
              {t('restock.create_po')}
            </a>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
