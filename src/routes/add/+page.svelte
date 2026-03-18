<script lang="ts">
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { onMount, onDestroy } from 'svelte';
  import { addBook, hasBookWithISBN } from '$lib/services/books';
  import { showConfirm } from '$lib/stores/dialog.svelte';
  import { resizeImage } from '$lib/services/covers';
  import { searchOpenLibrary, lookupByISBN, type OpenLibraryResult } from '$lib/services/openlibrary';
  import { getAllSeries, createSeries } from '$lib/services/series';
  import { q } from '$lib/db';
  import { setCoverBase64 } from '$lib/services/coverCache';
  import type { Series } from '$lib/db';
  import BarcodeScanner from '$lib/components/BarcodeScanner.svelte';
  import { t } from '$lib/i18n/index.svelte';
  import { showToast } from '$lib/stores/toast.svelte';

  let mode = $state<'search' | 'manual' | 'scan'>('search');
  let searchQuery = $state('');
  let searchResults = $state<OpenLibraryResult[]>([]);
  let searching = $state(false);

  let title = $state('');
  let authors = $state('');
  let isbn = $state('');
  let categories = $state('');
  let coverFile = $state<File | null>(null);
  let coverPreview = $state<string | null>(null);
  let saving = $state(false);
  let error = $state('');

  let seriesList = $state<Series[]>([]);
  let selectedSeriesId = $state<string>('');
  let seriesOrder = $state<string>('');
  let newSeriesName = $state('');

  let unsubAdd: (() => void) | null = null;
  onMount(() => {
    seriesList = getAllSeries();
    unsubAdd = q.observe('series', () => { seriesList = getAllSeries(); });
  });
  onDestroy(() => unsubAdd?.());

  async function handleBarcode(code: string) {
    isbn = code;
    const result = await lookupByISBN(code);
    if (result) {
      title = result.title;
      authors = result.authors.join(', ');
      coverPreview = result.coverUrl || null;
    }
    mode = 'manual';
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    searching = true;
    searchResults = await searchOpenLibrary(searchQuery);
    searching = false;
  }

  function selectResult(result: OpenLibraryResult) {
    title = result.title;
    authors = result.authors.join(', ');
    isbn = result.isbn || '';
    coverPreview = result.coverUrl || null;
    mode = 'manual';
  }

  function handleCoverUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    coverFile = file;
    coverPreview = URL.createObjectURL(file);
  }

  async function handleSave() {
    if (!title.trim()) {
      error = t('add.error_title');
      return;
    }
    saving = true;
    error = '';

    try {
      let allowDuplicate = false;
      const trimmedIsbn = isbn.trim();
      if (trimmedIsbn && hasBookWithISBN(trimmedIsbn)) {
        const confirmed = await showConfirm({
          title: t('add.duplicate_title'),
          message: t('add.duplicate_message'),
          confirmLabel: t('add.duplicate_confirm')
        });
        if (!confirmed) {
          saving = false;
          return;
        }
        allowDuplicate = true;
      }

      const result = addBook({
        title: title.trim(),
        authors: authors.split(',').map((a) => a.trim()).filter(Boolean),
        isbn: trimmedIsbn || undefined,
        coverUrl: !coverFile && coverPreview ? coverPreview : undefined,
        categories: categories.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean),
        seriesId: selectedSeriesId || undefined,
        seriesOrder: seriesOrder ? parseInt(seriesOrder) : undefined
      }, allowDuplicate);

      if (result === null) {
        error = t('add.error_duplicate');
        saving = false;
        return;
      }

      // Store custom cover in coverCache if uploaded
      if (coverFile && result) {
        const blob = await resizeImage(coverFile);
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        await setCoverBase64(result.id, base64);
      }

      goto(`${base}/`);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        showToast('Storage full. Try exporting and clearing old data.', 'error');
      } else {
        showToast('Failed to save book.', 'error');
      }
      saving = false;
      return;
    }
  }
</script>

<div class="max-w-lg mx-auto animate-fade-up">
  <button onclick={() => history.back()} class="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink mb-4 transition-colors">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
    {t('common.back')}
  </button>

  <h1 class="font-display text-2xl font-bold text-ink tracking-tight mb-6">{t('add.title')}</h1>

  <div class="flex gap-2 mb-6">
    {#each [
      { key: 'search', label: t('add.search') },
      { key: 'manual', label: t('add.manual') },
      { key: 'scan', label: t('add.scan') }
    ] as tab_item}
      <button
        class="tab-pill {mode === tab_item.key ? 'tab-pill-active' : 'tab-pill-inactive'}"
        onclick={() => mode = tab_item.key as typeof mode}
      >{tab_item.label}</button>
    {/each}
  </div>

  {#if mode === 'search'}
    <form class="flex gap-2 mb-5" onsubmit={(e) => { e.preventDefault(); handleSearch(); }}>
      <div class="relative flex-1">
        <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 text-warm-300" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input
          type="text"
          bind:value={searchQuery}
          placeholder={t('add.search_placeholder')}
          class="input-field !pl-10"
        />
      </div>
      <button type="submit" class="btn-primary" disabled={searching}>
        {searching ? '...' : t('add.search')}
      </button>
    </form>

    <div class="flex flex-col gap-2">
      {#each searchResults as result, i}
        <button
          class="card w-full flex gap-4 p-4 text-left hover:shadow-md transition-shadow animate-fade-up"
          style="animation-delay: {i * 40}ms"
          onclick={() => selectResult(result)}
        >
          {#if result.coverUrl}
            <img src={result.coverUrl} alt={result.title} class="w-11 h-16 object-cover rounded book-shadow flex-shrink-0" />
          {:else}
            <div class="w-11 h-16 bg-warm-100 rounded flex items-center justify-center text-warm-300 flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
            </div>
          {/if}
          <div class="min-w-0">
            <div class="font-display text-sm font-semibold text-ink truncate">{result.title}</div>
            <div class="text-xs text-ink-muted truncate">{result.authors.join(', ')}</div>
            {#if result.publishYear}<div class="text-[11px] text-warm-400 mt-0.5">{result.publishYear}</div>{/if}
          </div>
        </button>
      {/each}
    </div>
  {/if}

  {#if mode === 'scan'}
    <div class="rounded-xl overflow-hidden">
      <BarcodeScanner onDetected={handleBarcode} />
    </div>
  {/if}

  {#if mode === 'manual'}
    <form class="flex flex-col gap-4" onsubmit={(e) => { e.preventDefault(); handleSave(); }}>
      {#if coverPreview}
        <div class="flex justify-center">
          <img src={coverPreview} alt="Cover" class="w-28 h-40 object-cover rounded-lg book-shadow-lg" />
        </div>
      {/if}

      <div class="card p-5 flex flex-col gap-4">
        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-semibold text-ink-muted uppercase tracking-wider">{t('add.cover_image')}</span>
          <input type="file" accept="image/*" onchange={handleCoverUpload}
            class="text-sm text-ink-muted file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-warm-100 file:text-ink-light file:font-medium file:text-xs file:cursor-pointer" />
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-semibold text-ink-muted uppercase tracking-wider">{t('add.book_title')} *</span>
          <input type="text" bind:value={title} class="input-field" />
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-semibold text-ink-muted uppercase tracking-wider">{t('add.authors')}</span>
          <input type="text" bind:value={authors} placeholder={t('add.authors_placeholder')} class="input-field" />
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-semibold text-ink-muted uppercase tracking-wider">{t('add.isbn')}</span>
          <input type="text" bind:value={isbn} class="input-field font-mono" />
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-semibold text-ink-muted uppercase tracking-wider">{t('add.categories')}</span>
          <input type="text" bind:value={categories} placeholder={t('add.categories_placeholder')} class="input-field" />
        </label>
      </div>

      <div class="card p-5 flex flex-col gap-4">
        <h3 class="text-xs font-semibold text-ink-muted uppercase tracking-wider">{t('add.series')}</h3>
        <select bind:value={selectedSeriesId} class="input-field">
          <option value="">{t('add.series_none')}</option>
          {#each seriesList as s}
            <option value={s.id}>{s.name}</option>
          {/each}
        </select>

        {#if selectedSeriesId}
          <label class="flex flex-col gap-1.5">
            <span class="text-xs font-semibold text-ink-muted uppercase tracking-wider">{t('add.series_position')}</span>
            <input type="number" bind:value={seriesOrder} min="1" placeholder="1" class="input-field" />
          </label>
        {/if}

        <div class="flex gap-2">
          <input type="text" bind:value={newSeriesName} placeholder={t('add.series_create')}
            class="input-field flex-1" />
          <button type="button" class="btn-secondary"
            onclick={() => {
              if (!newSeriesName.trim()) return;
              const s = createSeries(newSeriesName.trim());
              seriesList = getAllSeries();
              selectedSeriesId = s.id;
              newSeriesName = '';
            }}>{t('add.series_add')}</button>
        </div>
      </div>

      {#if error}
        <p class="text-berry text-sm font-medium">{error}</p>
      {/if}

      <button type="submit" class="btn-primary w-full" disabled={saving}>
        {saving ? t('add.saving') : t('add.save')}
      </button>
    </form>
  {/if}
</div>
