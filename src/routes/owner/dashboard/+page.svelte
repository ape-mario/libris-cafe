<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/index.svelte';
  import { getCurrentStaff } from '$lib/modules/auth/stores.svelte';
  import {
    getDashboardState,
    loadDashboard,
    setDateRange,
  } from '$lib/modules/dashboard/stores.svelte';
  import DashboardCard from '$lib/components/DashboardCard.svelte';
  import SalesChart from '$lib/components/SalesChart.svelte';
  import type { DateRange } from '$lib/modules/dashboard/types';

  let staff = $derived(getCurrentStaff());
  let dashboard = $derived(getDashboardState());

  onMount(async () => {
    if (staff) {
      await loadDashboard(staff.outlet_id);
    }
  });

  async function handleDateRange(range: DateRange) {
    setDateRange(range);
    if (staff) await loadDashboard(staff.outlet_id);
  }

  function formatRp(amount: number): string {
    if (amount >= 1_000_000) return `Rp ${(amount / 1_000_000).toFixed(1)}jt`;
    if (amount >= 1_000) return `Rp ${(amount / 1_000).toFixed(0)}rb`;
    return `Rp ${amount.toLocaleString('id-ID')}`;
  }

  async function handleRefresh() {
    if (staff) await loadDashboard(staff.outlet_id);
  }
</script>

<div class="space-y-4">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <h1 class="font-display text-xl font-bold text-ink">{t('dashboard.title')}</h1>
    <button
      class="text-xs text-accent font-medium px-3 py-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 transition-colors"
      onclick={handleRefresh}
      disabled={dashboard.loading}
    >
      {t('dashboard.refresh')}
    </button>
  </div>

  {#if dashboard.loading && !dashboard.metrics}
    <div class="py-8 text-center text-sm text-ink-muted">{t('common.loading')}</div>
  {:else if dashboard.error}
    <div class="py-8 text-center text-sm text-berry">{dashboard.error}</div>
  {:else if dashboard.metrics}
    <!-- Today's Metrics -->
    <div>
      <h2 class="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">{t('dashboard.today')}</h2>
      <div class="grid grid-cols-2 gap-3">
        <DashboardCard
          label={t('dashboard.total_sales')}
          value={formatRp(dashboard.metrics.total_sales)}
          subtitle="{dashboard.metrics.transaction_count} {t('dashboard.transactions').toLowerCase()}"
          color="accent"
        />
        <DashboardCard
          label={t('dashboard.margin')}
          value={formatRp(dashboard.metrics.total_margin)}
          color="sage"
        />
        <DashboardCard
          label={t('dashboard.low_stock')}
          value={String(dashboard.metrics.low_stock_count)}
          color="gold"
        />
        <DashboardCard
          label={t('dashboard.out_of_stock')}
          value={String(dashboard.metrics.out_of_stock_count)}
          color="berry"
        />
      </div>
    </div>

    <!-- Payment Breakdown -->
    {#if dashboard.metrics.payment_breakdown && dashboard.metrics.payment_breakdown.length > 0}
      <div class="bg-surface rounded-xl border border-warm-100 p-4">
        <h3 class="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-3">{t('dashboard.payment_breakdown')}</h3>
        <div class="space-y-2">
          {#each dashboard.metrics.payment_breakdown as pb}
            <div class="flex items-center justify-between text-sm">
              <span class="text-ink-muted capitalize">{pb.method === 'cash' ? t('payment.cash') : pb.method.toUpperCase()}</span>
              <div class="text-right">
                <span class="font-semibold text-ink">{formatRp(pb.total)}</span>
                <span class="text-xs text-ink-muted ml-1">({pb.count}x)</span>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Sales Trend -->
    <div>
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-xs font-semibold text-ink-muted uppercase tracking-wide">{t('dashboard.sales_trend')}</h2>
        <div class="flex gap-1">
          {#each (['7d', '30d', '12m'] as const) as range}
            <button
              class="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors {dashboard.dateRange === range ? 'bg-accent text-cream' : 'bg-warm-50 text-ink-muted'}"
              onclick={() => handleDateRange(range)}
            >
              {t(`dashboard.period_${range}`)}
            </button>
          {/each}
        </div>
      </div>

      {#if dashboard.salesTrend.length > 0}
        <SalesChart data={dashboard.salesTrend} />
      {:else}
        <div class="bg-surface rounded-xl border border-warm-100 p-8 text-center text-sm text-ink-muted">
          {t('dashboard.no_data')}
        </div>
      {/if}
    </div>

    <!-- Top Books -->
    {#if dashboard.topBooks.length > 0}
      <div class="bg-surface rounded-xl border border-warm-100">
        <div class="px-4 py-3 border-b border-warm-50">
          <h3 class="text-xs font-semibold text-ink-muted uppercase tracking-wide">{t('dashboard.top_books')}</h3>
        </div>
        <div class="divide-y divide-warm-50">
          {#each dashboard.topBooks as book, i}
            <div class="px-4 py-3 flex items-center gap-3">
              <span class="w-6 h-6 rounded-full bg-accent/10 text-accent text-xs font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-ink truncate">{book.title}</p>
                <p class="text-xs text-ink-muted">{book.total_sold} {t('dashboard.sold')}</p>
              </div>
              <p class="text-sm font-semibold text-ink">{formatRp(book.total_revenue)}</p>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>
