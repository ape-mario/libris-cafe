<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto, afterNavigate } from '$app/navigation';
  import { base } from '$app/paths';
  import { getBooks, searchBooks, getBooksByCategory } from '$lib/services/books';
  import { getUserBookData, setUserBookData } from '$lib/services/userbooks';
  import { getUserShelves, addBookToShelf } from '$lib/services/shelves';
  import { getCurrentUser } from '$lib/stores/user.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import { q } from '$lib/db';
  import type { Book, Shelf } from '$lib/db';
  import BookCard from '$lib/components/BookCard.svelte';
  import { t, bookCount } from '$lib/i18n/index.svelte';

  type SortKey = 'recent' | 'title' | 'author' | 'rating' | 'year' | 'publisher';
  type StatusFilter = '' | 'read' | 'reading' | 'unread' | 'dnf' | 'wishlist';
  const PAGE_SIZE = 60;

  let allBooks = $state<Book[]>([]);
  let books = $state<Book[]>([]);
  let visibleCount = $state(PAGE_SIZE);
  let query = $state('');
  let loading = $state(false);
  let sortBy = $state<SortKey>('recent');
  let filterCategory = $state('');
  let filterStatus = $state<StatusFilter>('');
  let filterRating = $state(0);
  let categories = $state<string[]>([]);
  let showFilters = $state(false);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let unsubBooks: (() => void) | null = null;
  let sentinelRef = $state<HTMLDivElement | null>(null);
  let observer: IntersectionObserver | null = null;

  // Bulk selection
  let selectMode = $state(false);
  let selected = $state<Set<string>>(new Set());
  let showBulkShelf = $state(false);
  let shelves = $state<Shelf[]>([]);

  function toggleSelect(bookId: string) {
    const next = new Set(selected);
    if (next.has(bookId)) next.delete(bookId);
    else next.add(bookId);
    selected = next;
  }

  function selectAll() {
    selected = new Set(books.map(b => b.id));
  }

  function clearSelection() {
    selected = new Set();
    selectMode = false;
    showBulkShelf = false;
  }

  function bulkSetStatus(status: 'read' | 'reading' | 'unread' | 'dnf') {
    const user = getCurrentUser();
    if (!user || selected.size === 0) return;
    for (const bookId of selected) {
      setUserBookData(user.id, bookId, { status });
    }
    showToast(t('library.bulk.done', { count: selected.size.toString() }), 'success');
    clearSelection();
  }

  function bulkAddToShelf(shelfId: string) {
    if (selected.size === 0) return;
    for (const bookId of selected) {
      addBookToShelf(shelfId, bookId);
    }
    const shelf = shelves.find(s => s.id === shelfId);
    showToast(t('toast.book_added_to_shelf', { name: shelf?.name || '' }), 'success');
    showBulkShelf = false;
    clearSelection();
  }

  function enterSelectMode() {
    const user = getCurrentUser();
    if (user) shelves = getUserShelves(user.id);
    selectMode = true;
  }

  let syncTimer: ReturnType<typeof setTimeout> | null = null;

  onMount(() => {
    loadLibrary();
    // Observe Y.Doc for remote sync updates — debounce to avoid re-rendering on every update
    unsubBooks = q.observe('books', () => {
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(() => loadLibrary(), 300);
    });
  });

  onDestroy(() => {
    unsubBooks?.();
    observer?.disconnect();
    if (syncTimer) clearTimeout(syncTimer);
    if (debounceTimer) clearTimeout(debounceTimer);
  });

  $effect(() => {
    if (sentinelRef && !observer) {
      observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && books.length > visibleCount) {
          visibleCount += PAGE_SIZE;
        }
      }, { rootMargin: '200px' });
      observer.observe(sentinelRef);
    }
  });

  // afterNavigate fires on every client-side navigation back to this page
  afterNavigate(() => {
    loadLibrary();
  });

  function loadLibrary() {
    allBooks = getBooks();
    const catSet = new Set<string>();
    for (const book of allBooks) {
      for (const cat of (book.categories || [])) catSet.add(cat);
    }
    categories = [...catSet].sort();
    applyFilters();
  }

  let visibleBooks = $derived(books.slice(0, visibleCount));
  let hasMore = $derived(books.length > visibleCount);

  function applyFilters() {
    visibleCount = PAGE_SIZE;
    let result: Book[];

    if (query.trim()) {
      result = searchBooks(query);
    } else if (filterCategory) {
      result = getBooksByCategory(filterCategory);
    } else {
      result = [...allBooks];
    }

    const user = getCurrentUser();

    // Filter by status
    if (filterStatus && user) {
      if (filterStatus === 'wishlist') {
        result = result.filter(b => getUserBookData(user.id, b.id)?.isWishlist);
      } else {
        result = result.filter(b => getUserBookData(user.id, b.id)?.status === filterStatus);
      }
    }

    // Filter by minimum rating
    if (filterRating > 0 && user) {
      result = result.filter(b => (getUserBookData(user.id, b.id)?.rating || 0) >= filterRating);
    }

    // Sort
    if (sortBy === 'title') {
      result.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === 'author') {
      result.sort((a, b) => (a.authors[0] || '').localeCompare(b.authors[0] || ''));
    } else if (sortBy === 'rating' && user) {
      result.sort((a, b) => {
        const ra = getUserBookData(user.id, a.id)?.rating || 0;
        const rb = getUserBookData(user.id, b.id)?.rating || 0;
        return rb - ra;
      });
    } else if (sortBy === 'year') {
      result.sort((a, b) => (b.publishYear || 0) - (a.publishYear || 0));
    } else if (sortBy === 'publisher') {
      result.sort((a, b) => (a.publisher || 'zzz').localeCompare(b.publisher || 'zzz'));
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

  function setStatusFilter(status: StatusFilter) {
    filterStatus = status;
    applyFilters();
  }

  function setRatingFilter(rating: number) {
    filterRating = filterRating === rating ? 0 : rating;
    applyFilters();
  }

  let sortOptions = $derived([
    { key: 'recent' as SortKey, label: t('library.sort.recent') },
    { key: 'title' as SortKey, label: t('library.sort.title') },
    { key: 'author' as SortKey, label: t('library.sort.author') },
    { key: 'rating' as SortKey, label: t('library.sort.rating') },
    { key: 'year' as SortKey, label: t('library.sort.year') },
    { key: 'publisher' as SortKey, label: t('library.sort.publisher') },
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
      <div class="flex items-center gap-3">
        <button
          class="flex items-center gap-1.5 text-xs font-medium transition-colors {selectMode ? 'text-accent' : 'text-ink-muted hover:text-ink'}"
          onclick={() => selectMode ? clearSelection() : enterSelectMode()}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          {t('library.select')}
        </button>
        <button
          class="flex items-center gap-1.5 text-xs font-medium transition-colors {showFilters ? 'text-accent' : 'text-ink-muted hover:text-ink'}"
          onclick={() => showFilters = !showFilters}
          aria-label={t('library.filter')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
          {t('library.filter')}
        </button>
      </div>
    {/if}
  </div>

  <div class="mb-4">
    <div class="relative">
      <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 text-warm-300" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      <input
        type="search"
        bind:value={query}
        oninput={handleSearch}
        placeholder={t('library.search')}
        aria-label={t('library.search')}
        class="input-field !pl-10"
      />
    </div>
  </div>

  {#if showFilters && allBooks.length > 0}
    <div class="mb-5 flex flex-col gap-3 animate-fade-up">
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

      <div class="flex items-center gap-2">
        <span class="text-xs font-semibold text-ink-muted uppercase tracking-wider w-14 flex-shrink-0">{t('library.filter.status')}</span>
        <div class="flex gap-1.5 overflow-x-auto pb-0.5">
          {#each [
            { key: '' as StatusFilter, label: t('library.filter.all') },
            { key: 'read' as StatusFilter, label: t('book.status_read') },
            { key: 'reading' as StatusFilter, label: t('book.status_reading') },
            { key: 'unread' as StatusFilter, label: t('book.status_unread') },
            { key: 'dnf' as StatusFilter, label: t('book.status_dnf') },
            { key: 'wishlist' as StatusFilter, label: t('book.wishlist_in') }
          ] as opt}
            <button
              class="tab-pill !py-1 !px-3 !text-xs {filterStatus === opt.key ? 'tab-pill-active' : 'tab-pill-inactive'}"
              onclick={() => setStatusFilter(opt.key)}
            >{opt.label}</button>
          {/each}
        </div>
      </div>

      <div class="flex items-center gap-2">
        <span class="text-xs font-semibold text-ink-muted uppercase tracking-wider w-14 flex-shrink-0">{t('library.filter.rating')}</span>
        <div class="flex gap-1 pb-0.5">
          {#each [1, 2, 3, 4, 5] as star}
            <button
              class="text-lg transition-colors {filterRating >= star ? 'text-gold' : 'text-warm-200 hover:text-warm-300'}"
              onclick={() => setRatingFilter(star)}
              aria-label="{star}+ stars"
            >&#9733;</button>
          {/each}
          {#if filterRating > 0}
            <span class="text-[10px] text-ink-muted ml-1 self-center">{filterRating}+</span>
          {/if}
        </div>
      </div>

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
      <a href="{base}/add" class="btn-primary inline-block">{t('library.empty.cta')}</a>
    </div>
  {:else if books.length === 0}
    <p class="text-center text-ink-muted py-12">{t('library.no_results')} "{query || filterCategory}"</p>
  {:else}
    {#if books.length !== allBooks.length || filterStatus || filterRating > 0}
      <p class="text-xs text-ink-muted mb-3">{t('library.showing', { count: books.length.toString(), total: allBooks.length.toString() })}</p>
    {/if}
    <div class="flex flex-wrap gap-x-4 gap-y-6">
      {#each visibleBooks as book, i}
        <div
          style={i < 20 ? `animation-delay: ${Math.min(i * 40, 400)}ms` : ''}
          class="relative {i < 20 ? 'animate-fade-up' : ''}"
        >
          {#if selectMode}
            <button
              class="absolute -top-1 -left-1 z-10 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all {selected.has(book.id) ? 'bg-accent border-accent text-cream' : 'bg-surface border-warm-300 hover:border-accent'}"
              onclick={() => toggleSelect(book.id)}
              aria-label="Select {book.title}"
            >
              {#if selected.has(book.id)}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              {/if}
            </button>
          {/if}
          <BookCard {book} onclick={() => selectMode ? toggleSelect(book.id) : goto(`${base}/book/${book.id}`)} />
        </div>
      {/each}
    </div>
    {#if hasMore}
      <div bind:this={sentinelRef} class="flex justify-center mt-8">
        <div class="w-8 h-0.5 bg-warm-300 rounded-full animate-pulse"></div>
      </div>
    {/if}
  {/if}
</div>

{#if selectMode && selected.size > 0}
  <div class="fixed bottom-16 left-0 right-0 z-40 flex justify-center px-3 animate-fade-up">
    <div class="card p-2.5 shadow-lg max-w-lg w-full">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-xs font-semibold text-ink">{selected.size} {t('library.bulk.selected')}</span>
        <button class="text-xs text-ink-muted hover:text-ink ml-auto" onclick={selectAll}>{t('library.bulk.select_all')}</button>
      </div>
      <div class="flex items-center gap-1.5 flex-wrap">
        <button class="tab-pill !py-1 !px-2.5 !text-[10px] tab-pill-inactive" onclick={() => bulkSetStatus('read')}>{t('book.status_read')}</button>
        <button class="tab-pill !py-1 !px-2.5 !text-[10px] tab-pill-inactive" onclick={() => bulkSetStatus('reading')}>{t('book.status_reading')}</button>
        <button class="tab-pill !py-1 !px-2.5 !text-[10px] tab-pill-inactive" onclick={() => bulkSetStatus('dnf')}>{t('book.status_dnf')}</button>
        {#if shelves.length > 0}
          <div class="relative">
            <button class="tab-pill !py-1 !px-2.5 !text-[10px] tab-pill-inactive" onclick={() => showBulkShelf = !showBulkShelf}>
              + {t('shelves.add_to')}
            </button>
            {#if showBulkShelf}
              <div class="absolute bottom-full mb-1 right-0 card p-2 shadow-lg min-w-[10rem] animate-scale-in">
                {#each shelves as shelf}
                  <button
                    class="block w-full text-left text-xs text-ink-light hover:bg-warm-100 px-3 py-1.5 rounded-lg transition-colors"
                    onclick={() => bulkAddToShelf(shelf.id)}
                  >{shelf.name}</button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
        <button class="tab-pill !py-1 !px-2.5 !text-[10px] tab-pill-inactive !text-warm-400" onclick={clearSelection}>✕</button>
      </div>
    </div>
  </div>
{/if}
