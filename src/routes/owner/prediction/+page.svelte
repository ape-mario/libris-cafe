<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/index.svelte';
  import { getPredictionStore } from '$lib/modules/prediction/stores.svelte';
  import { getCurrentStaff } from '$lib/modules/auth/stores.svelte';
  import RestockTable from '$lib/components/prediction/RestockTable.svelte';
  import VelocityBadge from '$lib/components/prediction/VelocityBadge.svelte';
  import StockoutChart from '$lib/components/prediction/StockoutChart.svelte';

  const prediction = getPredictionStore();

  const staff = getCurrentStaff();
  const outletId = staff?.outlet_id ?? '';
  let leadTimeDays = $state(7);

  onMount(() => {
    prediction.refresh(outletId, leadTimeDays);
  });

  function handleRefresh() {
    prediction.refresh(outletId, leadTimeDays);
  }
</script>

<div class="max-w-3xl mx-auto p-4 space-y-4">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-bold">{t('prediction.title')}</h1>
    <button class="btn btn-outline btn-sm" onclick={handleRefresh} disabled={prediction.isLoading}>
      {prediction.isLoading ? t('common.loading') : t('prediction.refresh')}
    </button>
  </div>

  <!-- Summary cards -->
  {#if prediction.summary}
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div class="bg-base-200 rounded-xl p-3 text-center">
        <div class="text-2xl font-bold">{prediction.summary.total_items}</div>
        <div class="text-xs text-base-content/60">{t('prediction.totalItems')}</div>
      </div>
      <div class="bg-error/10 rounded-xl p-3 text-center">
        <div class="text-2xl font-bold text-error">{prediction.summary.critical_count}</div>
        <div class="text-xs text-base-content/60">{t('prediction.critical')}</div>
      </div>
      <div class="bg-warning/10 rounded-xl p-3 text-center">
        <div class="text-2xl font-bold text-warning">{prediction.summary.urgent_count}</div>
        <div class="text-xs text-base-content/60">{t('prediction.urgent')}</div>
      </div>
      <div class="bg-base-200 rounded-xl p-3 text-center">
        <div class="text-2xl font-bold">
          {prediction.summary.avg_days_until_stockout !== null
            ? `${prediction.summary.avg_days_until_stockout}d`
            : '-'}
        </div>
        <div class="text-xs text-base-content/60">{t('prediction.avgStockout')}</div>
      </div>
    </div>
  {/if}

  <!-- Lead time config -->
  <div class="bg-base-200 rounded-xl p-3 flex items-center gap-3">
    <label class="text-sm font-medium shrink-0">{t('prediction.leadTime')}:</label>
    <input type="number" bind:value={leadTimeDays} min="1" max="90"
      class="w-20 px-2 py-1 rounded-lg border border-base-300 bg-base-100 text-sm text-center" />
    <span class="text-sm text-base-content/60">{t('common.days')}</span>
  </div>

  <!-- Stockout chart -->
  {#if prediction.velocityData.length > 0}
    <StockoutChart data={prediction.velocityData} />
  {/if}

  <!-- Restock recommendations table -->
  {#if prediction.recommendations.length > 0}
    <RestockTable recommendations={prediction.recommendations} />
  {:else if !prediction.isLoading}
    <div class="text-center py-8 text-base-content/40">
      {t('prediction.allGood')}
    </div>
  {/if}

  <!-- Top sellers with velocity badge -->
  {#if prediction.summary?.top_sellers.length}
    <div class="space-y-2">
      <h2 class="font-semibold">{t('prediction.topSellers')}</h2>
      {#each prediction.summary.top_sellers as seller}
        <div class="flex items-center justify-between bg-base-200 rounded-lg p-2">
          <span class="text-sm truncate">{seller.book_title ?? seller.book_id}</span>
          <VelocityBadge unitsSold30d={seller.units_sold_30d} />
        </div>
      {/each}
    </div>
  {/if}
</div>
