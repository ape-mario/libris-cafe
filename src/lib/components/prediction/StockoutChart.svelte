<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import type { SalesVelocity } from '$lib/modules/prediction/types';

  let { data }: { data: SalesVelocity[] } = $props();

  // Show top 15 items sorted by soonest stockout
  const chartData = $derived(
    [...data]
      .filter(d => d.days_until_stockout !== null && d.days_until_stockout < 60)
      .sort((a, b) => (a.days_until_stockout ?? 999) - (b.days_until_stockout ?? 999))
      .slice(0, 15)
  );

  const maxDays = $derived(
    Math.max(...chartData.map(d => d.days_until_stockout ?? 0), 1)
  );

  function barColor(days: number | null): string {
    if (days === null) return 'bg-warm-100';
    if (days <= 7) return 'bg-berry';
    if (days <= 14) return 'bg-gold';
    if (days <= 30) return 'bg-amber-400';
    return 'bg-success';
  }
</script>

<div class="space-y-2">
  <h2 class="font-semibold">{t('prediction.stockoutTimeline')}</h2>
  <div class="bg-warm-50 rounded-xl p-3 space-y-1.5">
    {#each chartData as item (item.inventory_id)}
      {@const days = item.days_until_stockout ?? 0}
      {@const pct = Math.max(2, (days / maxDays) * 100)}
      <div class="flex items-center gap-2">
        <span class="text-xs w-24 truncate shrink-0 text-ink-muted">
          {item.book_id.substring(0, 12)}
        </span>
        <div class="flex-1 h-4 bg-warm-100 rounded-full overflow-hidden">
          <div
            class="h-full rounded-full transition-all {barColor(item.days_until_stockout)}"
            style="width: {pct}%"
          ></div>
        </div>
        <span class="text-xs font-mono w-8 text-right shrink-0">
          {Math.round(days)}d
        </span>
      </div>
    {/each}

    {#if chartData.length === 0}
      <div class="text-center text-sm text-ink-muted py-4">
        {t('prediction.noStockoutRisk')}
      </div>
    {/if}
  </div>
</div>
