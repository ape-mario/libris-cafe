<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import type { ReportConfig, ReportType, ExportFormat } from '$lib/modules/reports/types';
  import { REPORT_SCHEMAS } from '$lib/modules/reports/types';
  import { getCurrentStaff } from '$lib/modules/auth/stores.svelte';

  let { onchange }: { onchange: (config: ReportConfig) => void } = $props();

  let reportType = $state<ReportType>('sales_daily');
  let format = $state<ExportFormat>('csv');
  let dateFrom = $state(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  let dateTo = $state(new Date().toISOString().split('T')[0]);

  let staff = $derived(getCurrentStaff());
  let outletId = $derived(staff?.outlet_id ?? '');

  const reportTypes = Object.entries(REPORT_SCHEMAS).map(([key, schema]) => ({
    value: key as ReportType,
    label_en: schema.title_en,
    label_id: schema.title_id,
  }));

  $effect(() => {
    onchange({
      type: reportType,
      format,
      outlet_id: outletId,
      date_from: dateFrom,
      date_to: dateTo,
    });
  });
</script>

<div class="bg-warm-50 rounded-xl p-4 space-y-4">
  <!-- Report type -->
  <div>
    <label class="text-sm font-medium">{t('reports.type')}</label>
    <select bind:value={reportType}
      class="w-full mt-1 px-3 py-2 rounded-lg border border-warm-100 bg-cream text-sm">
      {#each reportTypes as rt}
        <option value={rt.value}>{rt.label_en}</option>
      {/each}
    </select>
  </div>

  <!-- Date range -->
  <div class="grid grid-cols-2 gap-3">
    <div>
      <label class="text-sm font-medium">{t('reports.from')}</label>
      <input type="date" bind:value={dateFrom}
        class="w-full mt-1 px-3 py-2 rounded-lg border border-warm-100 bg-cream text-sm" />
    </div>
    <div>
      <label class="text-sm font-medium">{t('reports.to')}</label>
      <input type="date" bind:value={dateTo}
        class="w-full mt-1 px-3 py-2 rounded-lg border border-warm-100 bg-cream text-sm" />
    </div>
  </div>

  <!-- Export format -->
  <div>
    <label class="text-sm font-medium">{t('reports.format')}</label>
    <div class="flex gap-2 mt-1">
      {#each ['csv', 'pdf', 'excel'] as fmt}
        <button
          class="flex-1 py-2 rounded-lg text-sm font-medium transition-colors {format === fmt ? 'bg-accent text-cream' : 'bg-cream border border-warm-100'}"
          onclick={() => format = fmt as ExportFormat}
        >
          {fmt.toUpperCase()}
        </button>
      {/each}
    </div>
  </div>
</div>
