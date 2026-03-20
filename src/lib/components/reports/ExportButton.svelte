<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import type { ReportConfig, ExportProgress } from '$lib/modules/reports/types';

  let { config, progress, onexport }: {
    config: ReportConfig;
    progress: ExportProgress;
    onexport: () => void;
  } = $props();

  const isExporting = $derived(
    progress.status === 'fetching' || progress.status === 'generating' || progress.status === 'downloading'
  );

  const statusText = $derived(() => {
    switch (progress.status) {
      case 'fetching': return t('reports.fetching');
      case 'generating': return t('reports.generating');
      case 'downloading': return t('reports.downloading');
      case 'done': return t('reports.done');
      case 'error': return t('reports.error');
      default: return '';
    }
  });
</script>

<div class="space-y-2">
  <button
    class="w-full py-3 rounded-xl font-semibold transition-all disabled:opacity-50
      {isExporting ? 'bg-warm-100 text-ink' : 'bg-accent text-cream'}"
    disabled={isExporting}
    onclick={onexport}
  >
    {#if isExporting}
      <span class="flex items-center justify-center gap-2">
        <svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
        {statusText()}
      </span>
    {:else}
      {t('reports.export')} {config.format.toUpperCase()}
    {/if}
  </button>

  {#if isExporting}
    <div class="w-full bg-warm-100 rounded-full h-1.5">
      <div
        class="bg-accent h-1.5 rounded-full transition-all duration-300"
        style="width: {progress.progress}%"
      ></div>
    </div>
  {/if}
</div>
