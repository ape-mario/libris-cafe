<script lang="ts">
  import { onMount } from 'svelte';
  import { goto, afterNavigate } from '$app/navigation';
  import { getBooks, searchBooks, getBooksByCategory } from '$lib/services/books';
  import { db } from '$lib/db';
  import type { Book } from '$lib/db';
  import BookCard from '$lib/components/BookCard.svelte';
  import { t, bookCount } from '$lib/i18n/index.svelte';

  type SortKey = 'recent' | 'title' | 'author';

  let allBooks = $state<Book[]>([]);
  let books = $state<Book[]>([]);
  let query = $state('');
  let loading = $state(true);
  let sortBy = $state<SortKey>('recent');
  let filterCategory = $state('');
  let categories = $state<string[]>([]);
  let showFilters = $state(false);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let initialized = false;

  onMount(() => {
    loadLibrary();
  });

  // Reload data when navigating back to this page (e.g., after adding a book)
  afterNavigate(() => {
    if (initialized) {
      loadLibrary();
    }
  });

  async function loadLibrary() {
    loading = true;
    allBooks = await getBooks();
    const catSet = new Set<string>();
    for (const book of allBooks) {
      for (const cat of book.categories) catSet.add(cat);
    }
    categories = [...catSet].sort();
    await applyFilters();
    loading = false;
    initialized = true;
  }

  async function applyFilters() {
    let result: Book[];

    if (query.trim()) {
      result = await searchBooks(query);
    } else if (filterCategory) {
      result = await getBooksByCategory(filterCategory);
    } else {
      result = await getBooks();
    }

    // Apply sort
    if (sortBy === 'title') {
      result.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === 'author') {
      result.sort((a, b) => (a.authors[0] || '').localeCompare(b.authors[0] || ''));
    } else {
      result.sort((a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime());
    }

    books = result;
  }

  function handleSearch() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (query.trim()) filterCategory = '';
      applyFilters();
    }, 200);
  }

  function setSort(key: SortKey) {
    sortBy = key;
    applyFilters();
  }

  function setFilter(cat: string) {
    filterCategory = cat;
    if (cat) query = '';
    applyFilters();
  }

  let sortOptions = $derived([
    { key: 'recent' as SortKey, label: t('library.sort.recent') },
    { key: 'title' as SortKey, label: t('library.sort.title') },
    { key: 'author' as SortKey, label: t('library.sort.author') },
  ]);
</script>

<div class="animate-fade-up">
  <div class="flex items-end justify-between mb-6">
    <div>
      <h1 class="font-display text-2xl font-bold text-ink tracking-tight">{t('library.title')}</h1>
      {#if allBooks.length > 0}
        <p class="text-sm text-ink-muted mt-0.5">{bookCount(allBooks.length)}</p>
      {/if}
    </div>
    {#if allBooks.length > 0}
      <button
        class="flex items-center gap-1.5 text-xs font-medium transition-colors {showFilters ? 'text-accent' : 'text-ink-muted hover:text-ink'}"
        onclick={() => showFilters = !showFilters}
        aria-label={t('library.filter')}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
        {t('library.filter')}
      </button>
    {/if}
  </div>

  <!-- Search -->
  <div class="mb-4">
    <div class="relative">
      <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 text-warm-300" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      <input
        type="search"
        bind:value={query}
        oninput={handleSearch}
        placeholder={t('library.search')}
        class="input-field !pl-10"
      />
    </div>
  </div>

  <!-- Sort & Filter controls -->
  {#if showFilters && allBooks.length > 0}
    <div class="mb-5 flex flex-col gap-3 animate-fade-up">
      <!-- Sort -->
      <div class="flex items-center gap-2">
        <span class="text-xs font-semibold text-ink-muted uppercase tracking-wider w-14 flex-shrink-0">{t('library.sort')}</span>
        <div class="flex gap-1.5 overflow-x-auto pb-0.5">
          {#each sortOptions as opt}
            <button
              class="tab-pill !py-1 !px-3 !text-xs {sortBy === opt.key ? 'tab-pill-active' : 'tab-pill-inactive'}"
              onclick={() => setSort(opt.key)}
            >{opt.label}</button>
          {/each}
        </div>
      </div>

      <!-- Category filter -->
      {#if categories.length > 0}
        <div class="flex items-center gap-2">
          <span class="text-xs font-semibold text-ink-muted uppercase tracking-wider w-14 flex-shrink-0">{t('library.filter')}</span>
          <div class="flex gap-1.5 overflow-x-auto pb-0.5">
            <button
              class="tab-pill !py-1 !px-3 !text-xs {filterCategory === '' ? 'tab-pill-active' : 'tab-pill-inactive'}"
              onclick={() => setFilter('')}
            >{t('library.filter.all')}</button>
            {#each categories as cat}
              <button
                class="tab-pill !py-1 !px-3 !text-xs capitalize {filterCategory === cat ? 'tab-pill-active' : 'tab-pill-inactive'}"
                onclick={() => setFilter(cat)}
              >{cat}</button>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}

  {#if loading}
    <div class="flex justify-center py-16">
      <div class="w-8 h-0.5 bg-warm-300 rounded-full animate-pulse"></div>
    </div>
  {:else if books.length === 0 && !query && !filterCategory}
    <div class="text-center py-16 animate-fade-in">
      <div class="w-16 h-16 rounded-2xl bg-warm-100 mx-auto mb-4 flex items-center justify-center">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-warm-400"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
      </div>
      <p class="font-display text-lg text-ink-light mb-1">{t('library.empty.title')}</p>
      <p class="text-sm text-ink-muted mb-6">{t('library.empty.subtitle')}</p>
      <a href="/add" class="btn-primary inline-block">{t('library.empty.cta')}</a>
    </div>
  {:else if books.length === 0}
    <p class="text-center text-ink-muted py-12">{t('library.no_results')} "{query || filterCategory}"</p>
  {:else}
    <div class="flex flex-wrap gap-x-4 gap-y-6">
      {#each books as book, i}
        <div style="animation-delay: {Math.min(i * 40, 400)}ms" class="animate-fade-up">
          <BookCard {book} onclick={() => goto(`/book/${book.id}`)} />
        </div>
      {/each}
    </div>
  {/if}
</div>
