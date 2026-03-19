<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { getCurrentStaff } from '$lib/modules/auth/stores.svelte';
  import { getInventoryByOutlet } from '$lib/modules/inventory/service';
  import { enrichInventory, type EnrichedInventory } from '$lib/modules/inventory/bridge';

  let items = $state<EnrichedInventory[]>([]);
  let loading = $state(true);
  let filter = $state<'all' | 'low_stock' | 'out_of_stock'>('all');
  let staff = $derived(getCurrentStaff());

  onMount(async () => {
    if (!staff) return;
    try {
      const raw = await getInventoryByOutlet(staff.outlet_id);
      items = enrichInventory(raw);
    } catch (err) {
      console.error('Failed to load inventory:', err);
    } finally {
      loading = false;
    }
  });

  let filtered = $derived(
    filter === 'all' ? items
    : filter === 'low_stock' ? items.filter(i => i.stock > 0 && i.stock <= i.min_stock)
    : items.filter(i => i.stock <= 0)
  );

  function stockBadge(item: EnrichedInventory): { label: string; class: string } {
    if (item.stock <= 0) return { label: t('inventory.out_of_stock'), class: 'bg-berry/10 text-berry' };
    if (item.stock <= item.min_stock) return { label: t('inventory.low_stock'), class: 'bg-gold/10 text-gold' };
    return { label: t('inventory.in_stock'), class: 'bg-sage/10 text-sage' };
  }

  function formatPrice(amount: number | null): string {
    if (amount === null) return '-';
    return `Rp ${amount.toLocaleString('id-ID')}`;
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h1 class="font-display text-xl font-bold text-ink">{t('inventory.title')}</h1>
    <a
      href="{base}/add"
      class="px-4 py-2 rounded-xl bg-accent text-cream text-sm font-medium"
    >
      + {t('inventory.add')}
    </a>
  </div>

  <!-- Filter -->
  <div class="flex gap-2">
    {#each ['all', 'low_stock', 'out_of_stock'] as f}
      <button
        class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors {filter === f ? 'bg-accent text-cream' : 'bg-surface text-ink-muted border border-warm-100'}"
        onclick={() => filter = f as any}
      >
        {f === 'all' ? 'All' : f === 'low_stock' ? t('inventory.low_stock') : t('inventory.out_of_stock')}
        {#if f === 'low_stock'}
          ({items.filter(i => i.stock > 0 && i.stock <= i.min_stock).length})
        {:else if f === 'out_of_stock'}
          ({items.filter(i => i.stock <= 0).length})
        {/if}
      </button>
    {/each}
  </div>

  <!-- List -->
  {#if loading}
    <div class="py-8 text-center text-sm text-ink-muted">{t('common.loading')}</div>
  {:else if filtered.length === 0}
    <div class="py-8 text-center text-sm text-ink-muted">No items</div>
  {:else}
    <div class="space-y-2">
      {#each filtered as item}
        <a
          href="{base}/staff/inventory/{item.id}"
          class="block bg-surface rounded-xl border border-warm-100 px-4 py-3 hover:border-accent/30 transition-colors"
        >
          <div class="flex items-center gap-3">
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-ink truncate">
                {item.book?.title ?? `Book: ${item.book_id.slice(0, 8)}...`}
              </p>
              <p class="text-xs text-ink-muted">
                {item.book?.authors?.join(', ') ?? ''}
                {item.is_preloved ? ' · Preloved' : ''}
              </p>
            </div>
            <div class="text-right">
              <p class="text-sm font-semibold text-ink">{formatPrice(item.price)}</p>
              <div class="flex items-center gap-2 mt-0.5">
                <span class="text-xs text-ink-muted">{t('inventory.stock')}: {item.stock}</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded-full font-medium {stockBadge(item).class}">
                  {stockBadge(item).label}
                </span>
              </div>
            </div>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
