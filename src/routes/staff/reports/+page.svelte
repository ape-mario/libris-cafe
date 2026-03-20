<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import ReportBuilder from '$lib/components/reports/ReportBuilder.svelte';
  import ExportButton from '$lib/components/reports/ExportButton.svelte';
  import { getReportsStore } from '$lib/modules/reports/stores.svelte';
  import type { ReportConfig } from '$lib/modules/reports/types';

  const reports = getReportsStore();

  let currentConfig = $state<ReportConfig | null>(null);

  function handleConfigChange(config: ReportConfig) {
    currentConfig = config;
  }

  async function handleExport() {
    if (!currentConfig) return;
    await reports.export(currentConfig);
  }
</script>

<div class="max-w-2xl mx-auto p-4 space-y-4">
  <h1 class="text-xl font-bold">{t('reports.title')}</h1>

  <ReportBuilder onchange={handleConfigChange} />

  {#if currentConfig}
    <ExportButton
      config={currentConfig}
      progress={reports.progress}
      onexport={handleExport}
    />
  {/if}

  {#if reports.progress.status === 'error'}
    <div class="bg-berry/10 text-berry text-sm rounded-lg p-3">
      {reports.progress.error}
    </div>
  {/if}
</div>
