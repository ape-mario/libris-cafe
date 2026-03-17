<script lang="ts">
  import { exportData, importData } from '$lib/services/backup';
  import { showToast } from '$lib/stores/toast.svelte';
  import { t } from '$lib/i18n/index.svelte';

  let importing = $state(false);

  async function handleExport() {
    const json = await exportData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `my-books-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(t('toast.exported'), 'success');
  }

  async function handleImport(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    importing = true;
    try {
      const json = await file.text();
      await importData(json);
      showToast(t('toast.imported'), 'success');
    } catch {
      showToast(t('toast.import_failed'), 'error');
    }
    importing = false;
  }
</script>

<div class="max-w-lg mx-auto animate-fade-up">
  <button onclick={() => history.back()} class="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink mb-4 transition-colors">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
    {t('common.back')}
  </button>

  <h1 class="font-display text-2xl font-bold text-ink tracking-tight mb-6">{t('settings.title')}</h1>

  <div class="space-y-4">
    <div class="card p-5">
      <h2 class="font-display font-semibold text-ink mb-1">{t('settings.export_title')}</h2>
      <p class="text-sm text-ink-muted mb-4">{t('settings.export_desc')}</p>
      <button class="btn-primary" onclick={handleExport}>{t('settings.export_btn')}</button>
    </div>

    <div class="card p-5">
      <h2 class="font-display font-semibold text-ink mb-1">{t('settings.import_title')}</h2>
      <p class="text-sm text-ink-muted mb-4">{t('settings.import_desc')}</p>
      <input type="file" accept=".json" onchange={handleImport} disabled={importing}
        class="text-sm text-ink-muted file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-warm-100 file:text-ink-light file:font-medium file:text-xs file:cursor-pointer" />
    </div>
  </div>
</div>
