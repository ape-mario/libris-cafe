<script lang="ts">
  import { exportData, importData } from '$lib/services/backup';
  import { importGoodreadsCSV } from '$lib/services/goodreads';
  import { showToast } from '$lib/stores/toast.svelte';
  import { getCurrentUser } from '$lib/stores/user.svelte';
  import { t } from '$lib/i18n/index.svelte';
  import { getLocale, setLocale, type Locale } from '$lib/i18n/index.svelte';
  import { getTheme, setTheme, type Theme } from '$lib/stores/theme.svelte';

  let importing = $state(false);
  let currentTheme = $derived(getTheme());
  let importingGoodreads = $state(false);
  let locale = $derived(getLocale());
  let user = $derived(getCurrentUser());

  function handleLocale(newLocale: Locale) {
    setLocale(newLocale);
  }

  async function handleExport() {
    const json = await exportData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `libris-backup-${new Date().toISOString().slice(0, 10)}.json`;
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

  async function handleGoodreads(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !user) return;
    importingGoodreads = true;
    try {
      const csv = await file.text();
      const count = importGoodreadsCSV(csv, user.id);
      showToast(t('toast.goodreads_imported', { count: count.toString() }), 'success');
    } catch {
      showToast(t('toast.goodreads_failed'), 'error');
    }
    importingGoodreads = false;
    input.value = '';
  }
</script>

<div class="max-w-lg mx-auto animate-fade-up">
  <button onclick={() => history.back()} class="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink mb-4 transition-colors">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
    {t('common.back')}
  </button>

  <h1 class="font-display text-2xl font-bold text-ink tracking-tight mb-6">{t('settings.title')}</h1>

  <div class="space-y-4">
    <!-- Language -->
    <div class="card p-5">
      <h2 class="font-display font-semibold text-ink mb-3">{t('settings.language')}</h2>
      <div class="flex gap-2">
        <button
          class="tab-pill {locale === 'en' ? 'tab-pill-active' : 'tab-pill-inactive'}"
          onclick={() => handleLocale('en')}
        >English</button>
        <button
          class="tab-pill {locale === 'id' ? 'tab-pill-active' : 'tab-pill-inactive'}"
          onclick={() => handleLocale('id')}
        >Bahasa Indonesia</button>
      </div>
    </div>

    <!-- Theme -->
    <div class="card p-5">
      <h2 class="font-display font-semibold text-ink mb-3">{t('settings.theme')}</h2>
      <div class="flex gap-2">
        {#each [
          { key: 'light', label: t('settings.theme.light'), icon: '☀' },
          { key: 'dark', label: t('settings.theme.dark'), icon: '🌙' },
          { key: 'system', label: t('settings.theme.system'), icon: '⚙' }
        ] as opt}
          <button
            class="tab-pill {currentTheme === opt.key ? 'tab-pill-active' : 'tab-pill-inactive'}"
            onclick={() => setTheme(opt.key as Theme)}
          >{opt.label}</button>
        {/each}
      </div>
    </div>

    <!-- Goodreads Import -->
    <div class="card p-5">
      <h2 class="font-display font-semibold text-ink mb-1">{t('settings.goodreads_title')}</h2>
      <p class="text-sm text-ink-muted mb-2">{t('settings.goodreads_desc')}</p>
      <p class="text-[11px] text-warm-400 mb-4 font-mono">{t('settings.goodreads_help')}</p>
      <input type="file" accept=".csv" onchange={handleGoodreads} disabled={importingGoodreads}
        class="text-sm text-ink-muted file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-warm-100 file:text-ink-light file:font-medium file:text-xs file:cursor-pointer" />
    </div>

    <!-- Export -->
    <div class="card p-5">
      <h2 class="font-display font-semibold text-ink mb-1">{t('settings.export_title')}</h2>
      <p class="text-sm text-ink-muted mb-4">{t('settings.export_desc')}</p>
      <button class="btn-primary" onclick={handleExport}>{t('settings.export_btn')}</button>
    </div>

    <!-- Import -->
    <div class="card p-5">
      <h2 class="font-display font-semibold text-ink mb-1">{t('settings.import_title')}</h2>
      <p class="text-sm text-ink-muted mb-4">{t('settings.import_desc')}</p>
      <input type="file" accept=".json" onchange={handleImport} disabled={importing}
        class="text-sm text-ink-muted file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-warm-100 file:text-ink-light file:font-medium file:text-xs file:cursor-pointer" />
    </div>
  </div>
</div>
