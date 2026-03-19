<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/index.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import ConsolidatedChart from '$lib/components/ConsolidatedChart.svelte';
  import { fetchConsolidatedDashboard, formatRupiah } from '$lib/modules/reporting/consolidated';
  import { getOutlets } from '$lib/modules/outlet/stores.svelte';
  import type { ConsolidatedDashboard } from '$lib/modules/reporting/types';
  import type { Outlet } from '$lib/modules/outlet/types';

  let dashboard = $state<ConsolidatedDashboard | null>(null);
  let loading = $state(true);
  let outlets = $derived(getOutlets());

  // Date range defaults to last 30 days
  let dateTo = $state(new Date().toISOString().split('T')[0]);
  let dateFrom = $state(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  let selectedOutletIds = $state<string[]>([]);  // empty = all

  onMount(async () => {
    await loadDashboard();
  });

  async function loadDashboard() {
    loading = true;
    try {
      dashboard = await fetchConsolidatedDashboard({
        dateRange: { from: dateFrom, to: dateTo },
        outletIds: selectedOutletIds.length > 0 ? selectedOutletIds : undefined,
      });
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      loading = false;
    }
  }

  function toggleOutletFilter(outletId: string) {
    if (selectedOutletIds.includes(outletId)) {
      selectedOutletIds = selectedOutletIds.filter(id => id !== outletId);
    } else {
      selectedOutletIds = [...selectedOutletIds, outletId];
    }
  }
</script>

<div class="p-4 max-w-4xl mx-auto">
  <h1 class="text-2xl font-bold text-warm-800 mb-6">{t('consolidated.title')}</h1>

  <!-- Filters -->
  <div class="bg-white rounded-xl border border-warm-200 p-4 mb-6">
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div>
        <label class="block text-sm font-medium text-warm-600 mb-1">{t('consolidated.date_range')}</label>
        <div class="flex gap-2">
          <input type="date" bind:value={dateFrom}
                 class="flex-1 px-2 py-1.5 rounded-lg border border-warm-200 text-sm
                        focus:border-sage outline-none" />
          <input type="date" bind:value={dateTo}
                 class="flex-1 px-2 py-1.5 rounded-lg border border-warm-200 text-sm
                        focus:border-sage outline-none" />
        </div>
      </div>
      <div>
        <label class="block text-sm font-medium text-warm-600 mb-1">{t('consolidated.filter_outlets')}</label>
        <div class="flex flex-wrap gap-1">
          {#each outlets as outlet (outlet.id)}
            <button
              class="px-2 py-1 rounded-full text-xs font-medium transition-colors
                     {selectedOutletIds.includes(outlet.id)
                       ? 'bg-sage text-white'
                       : 'bg-warm-100 text-warm-600 hover:bg-warm-200'}"
              onclick={() => toggleOutletFilter(outlet.id)}
            >
              {outlet.name}
            </button>
          {/each}
        </div>
      </div>
      <div class="flex items-end">
        <button
          class="px-4 py-2 bg-sage text-white rounded-lg font-medium
                 hover:bg-sage-600 transition-colors w-full"
          onclick={loadDashboard}
        >
          {loading ? t('app.loading') : t('app.reload')}
        </button>
      </div>
    </div>
  </div>

  {#if loading}
    <div class="text-center py-12 text-warm-400">{t('app.loading')}</div>
  {:else if dashboard}
    <!-- Grand Totals -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <div class="bg-white rounded-xl border border-warm-200 p-4">
        <div class="text-sm text-warm-500">{t('consolidated.total_sales')}</div>
        <div class="text-xl font-bold text-warm-800">{formatRupiah(dashboard.totals.totalSales)}</div>
      </div>
      <div class="bg-white rounded-xl border border-warm-200 p-4">
        <div class="text-sm text-warm-500">{t('consolidated.total_transactions')}</div>
        <div class="text-xl font-bold text-warm-800">{dashboard.totals.totalTransactions}</div>
      </div>
      <div class="bg-white rounded-xl border border-warm-200 p-4">
        <div class="text-sm text-warm-500">{t('consolidated.avg_transaction')}</div>
        <div class="text-xl font-bold text-warm-800">{formatRupiah(dashboard.totals.avgTransactionValue)}</div>
      </div>
      <div class="bg-white rounded-xl border border-warm-200 p-4">
        <div class="text-sm text-warm-500">{t('consolidated.stock_value')}</div>
        <div class="text-xl font-bold text-warm-800">{formatRupiah(dashboard.totals.totalStockValue)}</div>
      </div>
    </div>

    <!-- Daily Trend Chart -->
    {#if dashboard.dailyTrend.length > 0}
      <div class="bg-white rounded-xl border border-warm-200 p-4 mb-6">
        <h2 class="font-semibold text-warm-800 mb-3">{t('consolidated.daily_trend')}</h2>
        <ConsolidatedChart trendData={dashboard.dailyTrend} />
      </div>
    {/if}

    <!-- Sales by Outlet -->
    <div class="bg-white rounded-xl border border-warm-200 p-4 mb-6">
      <h2 class="font-semibold text-warm-800 mb-3">{t('consolidated.sales_comparison')}</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-warm-200">
              <th class="text-left py-2 px-2 text-warm-500 font-medium">Outlet</th>
              <th class="text-right py-2 px-2 text-warm-500 font-medium">{t('consolidated.total_sales')}</th>
              <th class="text-right py-2 px-2 text-warm-500 font-medium">{t('consolidated.total_transactions')}</th>
              <th class="text-right py-2 px-2 text-warm-500 font-medium">{t('consolidated.total_items')}</th>
              <th class="text-right py-2 px-2 text-warm-500 font-medium">{t('consolidated.avg_transaction')}</th>
            </tr>
          </thead>
          <tbody>
            {#each dashboard.sales as row (row.outlet_id)}
              <tr class="border-b border-warm-100">
                <td class="py-2 px-2 font-medium text-warm-700">{row.outlet_name}</td>
                <td class="py-2 px-2 text-right">{formatRupiah(row.total_sales)}</td>
                <td class="py-2 px-2 text-right">{row.total_transactions}</td>
                <td class="py-2 px-2 text-right">{row.total_items_sold}</td>
                <td class="py-2 px-2 text-right">{formatRupiah(row.avg_transaction_value)}</td>
              </tr>
            {:else}
              <tr><td colspan="5" class="py-6 text-center text-sm text-warm-400">No sales data</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Inventory by Outlet -->
    <div class="bg-white rounded-xl border border-warm-200 p-4 mb-6">
      <h2 class="font-semibold text-warm-800 mb-3">{t('consolidated.inventory_overview')}</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-warm-200">
              <th class="text-left py-2 px-2 text-warm-500 font-medium">Outlet</th>
              <th class="text-right py-2 px-2 text-warm-500 font-medium">{t('consolidated.total_skus')}</th>
              <th class="text-right py-2 px-2 text-warm-500 font-medium">{t('consolidated.total_stock')}</th>
              <th class="text-right py-2 px-2 text-warm-500 font-medium">{t('consolidated.stock_value')}</th>
            </tr>
          </thead>
          <tbody>
            {#each dashboard.inventory as row (row.outlet_id)}
              <tr class="border-b border-warm-100">
                <td class="py-2 px-2 font-medium text-warm-700">{row.outlet_name}</td>
                <td class="py-2 px-2 text-right">{row.total_skus}</td>
                <td class="py-2 px-2 text-right">{row.total_stock}</td>
                <td class="py-2 px-2 text-right">{formatRupiah(row.total_stock_value)}</td>
              </tr>
            {:else}
              <tr><td colspan="4" class="py-6 text-center text-sm text-warm-400">No inventory data</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Top Books across Outlets -->
    {#if dashboard.topBooks.length > 0}
      <div class="bg-white rounded-xl border border-warm-200 p-4 mb-6">
        <h2 class="font-semibold text-warm-800 mb-3">{t('consolidated.top_books')}</h2>
        <div class="space-y-2">
          {#each dashboard.topBooks as book, i (book.book_id)}
            <div class="flex items-center gap-3 py-2 border-b border-warm-100 last:border-0">
              <span class="text-sm text-warm-400 w-6 text-right">#{i + 1}</span>
              <div class="flex-1 min-w-0">
                <div class="font-medium text-warm-700 truncate">{book.title}</div>
                <div class="text-xs text-warm-400">
                  {book.total_sold} sold across {book.outlet_count} outlet{book.outlet_count !== 1 ? 's' : ''}
                </div>
              </div>
              <span class="text-sm font-medium text-warm-600">{formatRupiah(book.total_revenue)}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>
