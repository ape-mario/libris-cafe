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

  let mode = $state<'search' | 'manual' | 'scan' | 'bulk'>('search');
  let searchQuery = $state('');
  let searchResults = $state<OpenLibraryResult[]>([]);
  let searching = $state(false);

  let title = $state('');
  let authors = $state('');
  let isbn = $state('');
  let publisher = $state('');
  let publishYear = $state('');
  let edition = $state('');
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

  // Bulk import
  interface BulkItem {
    isbn: string;
    result: OpenLibraryResult | null;
    status: 'pending' | 'loading' | 'found' | 'not_found' | 'error' | 'duplicate' | 'added';
  }

  let bulkInput = $state('');
  let bulkItems = $state<BulkItem[]>([]);
  let bulkProcessing = $state(false);
  let bulkProgress = $state(0);

  function parseBulkISBNs(): string[] {
    return bulkInput
      .split(/[\n,;]+/)
      .map(s => s.replace(/[^0-9Xx]/g, '').trim())
      .filter(s => s.length >= 10);
  }

  async function startBulkLookup() {
    const isbns = parseBulkISBNs();
    if (isbns.length === 0) return;

    bulkItems = isbns.map(isbn => ({ isbn, result: null, status: 'pending' }));
    bulkProcessing = true;
    bulkProgress = 0;

    // Process with concurrency limit of 3
    const concurrency = 3;
    let index = 0;

    async function processNext() {
      while (index < bulkItems.length) {
        const i = index++;
        const item = bulkItems[i];

        // Check duplicate first
        if (hasBookWithISBN(item.isbn)) {
          bulkItems[i] = { ...item, status: 'duplicate' };
          bulkProgress++;
          continue;
        }

        bulkItems[i] = { ...item, status: 'loading' };
        bulkItems = [...bulkItems]; // trigger reactivity

        if (!navigator.onLine) {
          bulkItems[i] = { ...item, status: 'error' };
        } else {
          const result = await lookupByISBN(item.isbn);
          if (result) {
            bulkItems[i] = { ...item, result, status: 'found' };
          } else {
            bulkItems[i] = { ...item, status: 'not_found' };
          }
        }
        bulkProgress++;
        bulkItems = [...bulkItems];

        // Rate limit: small delay between requests
        await new Promise(r => setTimeout(r, 300));
      }
    }

    await Promise.all(Array.from({ length: concurrency }, processNext));
    bulkProcessing = false;
  }

  function bulkAddAll() {
    let added = 0;
    for (const item of bulkItems) {
      if (item.status !== 'found' || !item.result) continue;
      const r = item.result;
      const book = addBook({
        title: r.title,
        authors: r.authors,
        isbn: r.isbn,
        coverUrl: r.coverUrl,
        publisher: r.publisher,
        publishYear: r.publishYear,
        categories: []
      });
      if (book) {
        item.status = 'added';
        added++;
      }
    }
    bulkItems = [...bulkItems];
    showToast(t('add.bulk.added', { count: added.toString() }), 'success');
  }

  let bulkFoundCount = $derived(bulkItems.filter(i => i.status === 'found').length);
  let bulkAddedCount = $derived(bulkItems.filter(i => i.status === 'added').length);

  async function handleBarcode(code: string) {
    isbn = code;
    const result = await lookupByISBN(code);
    if (result) {
      title = result.title;
      authors = result.authors.join(', ');
      coverPreview = result.coverUrl || null;
      publisher = result.publisher || '';
      publishYear = result.publishYear?.toString() || '';
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
    publisher = result.publisher || '';
    publishYear = result.publishYear?.toString() || '';
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
        publisher: publisher.trim() || undefined,
        publishYear: publishYear ? parseInt(publishYear) : undefined,
        edition: edition.trim() || undefined,
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

  <div class="flex gap-2 mb-6 overflow-x-auto pb-0.5">
    {#each [
      { key: 'search', label: t('add.search') },
      { key: 'manual', label: t('add.manual') },
      { key: 'scan', label: t('add.scan') },
      { key: 'bulk', label: t('add.bulk') }
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

  {#if mode === 'bulk'}
    <div class="flex flex-col gap-4">
      <div class="card p-5 flex flex-col gap-3">
        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-semibold text-ink-muted uppercase tracking-wider">{t('add.bulk.input_label')}</span>
          <textarea
            bind:value={bulkInput}
            placeholder={t('add.bulk.input_placeholder')}
            rows="6"
            class="input-field font-mono text-xs leading-relaxed resize-y"
          ></textarea>
        </label>
        <div class="flex items-center gap-3">
          <button
            class="btn-primary"
            onclick={startBulkLookup}
            disabled={bulkProcessing || parseBulkISBNs().length === 0}
          >
            {bulkProcessing ? t('add.bulk.looking_up') : t('add.bulk.lookup', { count: parseBulkISBNs().length.toString() })}
          </button>
          {#if bulkProcessing}
            <span class="text-xs text-ink-muted">{bulkProgress}/{bulkItems.length}</span>
          {/if}
        </div>
      </div>

      {#if bulkItems.length > 0}
        <!-- Progress bar -->
        {#if bulkProcessing}
          <div class="h-1.5 rounded-full bg-warm-100 overflow-hidden">
            <div class="h-full rounded-full bg-accent transition-all duration-300" style="width: {(bulkProgress / bulkItems.length) * 100}%"></div>
          </div>
        {/if}

        <!-- Results -->
        <div class="flex flex-col gap-2">
          {#each bulkItems as item}
            <div class="card flex items-center gap-3 p-3">
              <span class="font-mono text-[10px] text-warm-400 w-28 flex-shrink-0 truncate">{item.isbn}</span>
              {#if item.status === 'loading'}
                <div class="w-6 h-0.5 bg-warm-300 rounded-full animate-pulse"></div>
              {:else if item.status === 'found' || item.status === 'added'}
                <div class="flex-1 min-w-0">
                  <span class="text-sm font-medium text-ink truncate block">{item.result?.title}</span>
                  <span class="text-xs text-ink-muted truncate block">{item.result?.authors.join(', ')}</span>
                </div>
                {#if item.status === 'added'}
                  <span class="text-xs text-sage font-medium flex-shrink-0">✓</span>
                {/if}
              {:else if item.status === 'duplicate'}
                <span class="text-xs text-warm-400 flex-1">{t('add.bulk.duplicate')}</span>
              {:else if item.status === 'not_found'}
                <span class="text-xs text-warm-400 flex-1">{t('add.bulk.not_found')}</span>
              {:else if item.status === 'error'}
                <span class="text-xs text-berry flex-1">{t('add.bulk.error')}</span>
              {:else}
                <span class="text-xs text-warm-300 flex-1">—</span>
              {/if}
            </div>
          {/each}
        </div>

        <!-- Add all button -->
        {#if !bulkProcessing && bulkFoundCount > 0 && bulkAddedCount < bulkFoundCount}
          <button class="btn-primary w-full" onclick={bulkAddAll}>
            {t('add.bulk.add_all', { count: bulkFoundCount.toString() })}
          </button>
        {/if}

        {#if bulkAddedCount > 0 && bulkAddedCount === bulkFoundCount}
          <div class="text-center py-4">
            <p class="text-sm text-sage font-medium">{t('add.bulk.complete')}</p>
            <a href="{base}/" class="text-xs text-accent mt-2 inline-block">{t('add.bulk.go_library')}</a>
          </div>
        {/if}
      {/if}
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
          <span class="text-xs font-semibold text-ink-muted uppercase tracking-wider">{t('add.publisher')}</span>
          <input type="text" bind:value={publisher} placeholder={t('add.publisher_placeholder')} class="input-field" />
        </label>

        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1.5">
            <span class="text-xs font-semibold text-ink-muted uppercase tracking-wider">{t('add.publish_year')}</span>
            <input type="number" bind:value={publishYear} placeholder="2024" class="input-field" />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-xs font-semibold text-ink-muted uppercase tracking-wider">{t('add.edition')}</span>
            <input type="text" bind:value={edition} placeholder={t('add.edition_placeholder')} class="input-field" />
          </label>
        </div>

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
