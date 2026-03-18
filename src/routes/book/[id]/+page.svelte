<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { onMount, onDestroy } from 'svelte';
  import { getBookById, updateBook, deleteBook } from '$lib/services/books';
  import { getUserBookData, setUserBookData } from '$lib/services/userbooks';
  import { resizeImage } from '$lib/services/covers';
  import { getCurrentUser } from '$lib/stores/user.svelte';
  import { getAllSeries, createSeries } from '$lib/services/series';
  import { q } from '$lib/db';
  import type { Book, UserBookData, Series, Shelf } from '$lib/db';
  import { showConfirm, showPrompt } from '$lib/stores/dialog.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import { t } from '$lib/i18n/index.svelte';
  import { cacheCoverIfNeeded, getCoverBase64, setCoverBase64 } from '$lib/services/coverCache';
  import { getUserShelves, addBookToShelf, removeBookFromShelf } from '$lib/services/shelves';

  let book = $state<Book | null>(null);
  let userData = $state<UserBookData | null>(null);
  let shelves = $state<Shelf[]>([]);
  let bookShelfIds = $state<Set<string>>(new Set());
  let user = $derived(getCurrentUser());
  let editing = $state(false);
  let coverSrc = $state<string | null>(null);

  // Edit form fields
  let editTitle = $state('');
  let editAuthors = $state('');
  let editIsbn = $state('');
  let editCategories = $state('');
  let editSeriesId = $state('');
  let editSeriesOrder = $state('');
  let seriesList = $state<Series[]>([]);
  let newSeriesName = $state('');
  let seriesName = $state('');

  let unsubBook: (() => void)[] = [];

  function reloadBookData() {
    const id = page.params.id;
    if (!id) return;
    book = getBookById(id) || null;
    if (!book) return;
    if (user) {
      userData = getUserBookData(user.id, book.id);
      shelves = getUserShelves(user.id);
      bookShelfIds = new Set(shelves.filter(s => s.bookIds.includes(book!.id)).map(s => s.id));
    }
    if (book.seriesId) {
      const s = q.getItem('series', book.seriesId) as Series | undefined;
      if (s) seriesName = s.name;
    }
  }

  onMount(async () => {
    reloadBookData();
    // Load cover from cache or URL
    if (book) {
      const base64 = await getCoverBase64(book.id);
      coverSrc = base64 || book.coverUrl || null;
      cacheCoverIfNeeded(book.id);
    }
    unsubBook = [
      q.observe('books', () => reloadBookData()),
      q.observe('userBookData', () => reloadBookData()),
      q.observe('shelves', () => reloadBookData())
    ];
  });

  onDestroy(() => unsubBook.forEach(f => f()));

  function startEditing() {
    if (!book) return;
    editTitle = book.title;
    editAuthors = book.authors.join(', ');
    editIsbn = book.isbn || '';
    editCategories = book.categories.join(', ');
    editSeriesId = book.seriesId || '';
    editSeriesOrder = book.seriesOrder?.toString() || '';
    newSeriesName = '';
    seriesList = getAllSeries();
    editing = true;
  }

  function saveEdit() {
    if (!book || !editTitle.trim()) return;
    updateBook(book.id, {
      title: editTitle.trim(),
      authors: editAuthors.split(',').map(a => a.trim()).filter(Boolean),
      isbn: editIsbn.trim() || undefined,
      categories: editCategories.split(',').map(c => c.trim().toLowerCase()).filter(Boolean),
      seriesId: editSeriesId || undefined,
      seriesOrder: editSeriesOrder ? parseInt(editSeriesOrder) : undefined
    });
    book = getBookById(book.id) || null;
    if (book?.seriesId) {
      const s = q.getItem('series', book.seriesId) as Series | undefined;
      seriesName = s?.name || '';
    } else {
      seriesName = '';
    }
    editing = false;
  }

  function updateStatus(status: 'unread' | 'reading' | 'read' | 'dnf') {
    if (!user || !book) return;
    userData = setUserBookData(user.id, book.id, { status });
  }

  function updateRating(rating: number) {
    if (!user || !book) return;
    const clamped = Math.max(1, Math.min(5, Math.round(rating)));
    userData = setUserBookData(user.id, book.id, { rating: clamped });
  }

  function updateNotes(e: Event) {
    const textarea = e.target as HTMLTextAreaElement;
    if (!user || !book) return;
    userData = setUserBookData(user.id, book.id, { notes: textarea.value });
  }

  function toggleWishlist() {
    if (!user || !book) return;
    userData = setUserBookData(user.id, book.id, { isWishlist: !userData?.isWishlist });
  }

  async function handleLend() {
    if (!user || !book) return;
    const name = await showPrompt({
      title: t('dialog.lend_title'),
      message: t('dialog.lend_message'),
      placeholder: t('dialog.lend_placeholder'),
      confirmLabel: t('dialog.lend_confirm')
    });
    if (!name) return;
    userData = setUserBookData(user.id, book.id, { lentTo: name, lentDate: new Date().toISOString() });
    showToast(t('toast.lent', { name }), 'success');
  }

  function handleReturn() {
    if (!user || !book) return;
    userData = setUserBookData(user.id, book.id, { lentTo: undefined, lentDate: undefined });
    showToast(t('toast.returned'), 'success');
  }

  async function handleCoverUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !book) return;
    const blob = await resizeImage(file);
    const reader = new FileReader();
    const base64 = await new Promise<string>((resolve, reject) => {
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    await setCoverBase64(book.id, base64);
    coverSrc = base64;
  }

  async function handleDelete() {
    if (!book) return;
    const confirmed = await showConfirm({
      title: t('dialog.delete_title'),
      message: t('dialog.delete_message', { title: book.title }),
      confirmLabel: t('dialog.delete_confirm'),
      danger: true
    });
    if (!confirmed) return;
    deleteBook(book.id);
    showToast(t('toast.deleted'), 'info');
    goto(`${base}/`);
  }

  let progressPercent = $derived(
    userData?.currentPage && userData?.totalPages && userData.totalPages > 0
      ? Math.min(100, Math.round((userData.currentPage / userData.totalPages) * 100))
      : null
  );

  function updateProgress(field: 'currentPage' | 'totalPages', value: string) {
    if (!user || !book) return;
    const num = parseInt(value) || undefined;
    userData = setUserBookData(user.id, book.id, { [field]: num });
  }

  function toggleShelf(shelf: Shelf) {
    if (!book) return;
    if (bookShelfIds.has(shelf.id)) {
      removeBookFromShelf(shelf.id, book.id);
      bookShelfIds.delete(shelf.id);
      bookShelfIds = new Set(bookShelfIds);
      showToast(t('toast.book_removed_from_shelf', { name: shelf.name }), 'info');
    } else {
      addBookToShelf(shelf.id, book.id);
      bookShelfIds.add(shelf.id);
      bookShelfIds = new Set(bookShelfIds);
      showToast(t('toast.book_added_to_shelf', { name: shelf.name }), 'success');
    }
  }

  let statusConfig = $derived({
    unread: { label: t('book.status_unread'), color: 'bg-warm-200 text-warm-700' },
    reading: { label: t('book.status_reading'), color: 'bg-accent/10 text-accent' },
    read: { label: t('book.status_read'), color: 'bg-sage-light text-sage' },
    dnf: { label: t('book.status_dnf'), color: 'bg-berry/10 text-berry' }
  });
</script>

{#if !book}
  <p class="text-ink-muted text-center py-12">{t('book.not_found')}</p>
{:else}
  <div class="max-w-lg mx-auto animate-fade-up">
    <button onclick={() => history.back()} class="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink mb-4 transition-colors">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
      {t('common.back')}
    </button>

    {#if editing}
      <div class="flex gap-5 mb-6 items-start">
        <div class="w-20 h-28 rounded-lg overflow-hidden book-shadow bg-warm-100 flex-shrink-0">
          {#if coverSrc}
            <img src={coverSrc} alt={book.title} class="w-full h-full object-cover" />
          {:else}
            <div class="w-full h-full flex items-center justify-center bg-gradient-to-br from-warm-100 to-warm-200 text-ink-muted text-[10px] text-center px-2 font-display">{book.title}</div>
          {/if}
        </div>
        <div>
          <h2 class="font-display text-lg font-bold text-ink leading-snug">{t('book.edit')}</h2>
          <p class="text-xs text-ink-muted mt-0.5">{t('book.edit_subtitle')}</p>
        </div>
      </div>

      <form class="flex flex-col gap-4 animate-fade-up" onsubmit={(e) => { e.preventDefault(); saveEdit(); }}>
        <div class="card p-5 flex flex-col gap-4">
          <label class="flex flex-col gap-1.5">
            <span class="text-xs font-semibold text-ink-muted uppercase tracking-wider">{t('add.book_title')} *</span>
            <input type="text" bind:value={editTitle} class="input-field" />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-xs font-semibold text-ink-muted uppercase tracking-wider">{t('add.authors')}</span>
            <input type="text" bind:value={editAuthors} placeholder={t('add.authors_placeholder')} class="input-field" />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-xs font-semibold text-ink-muted uppercase tracking-wider">{t('add.isbn')}</span>
            <input type="text" bind:value={editIsbn} class="input-field font-mono" />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-xs font-semibold text-ink-muted uppercase tracking-wider">{t('add.categories')}</span>
            <input type="text" bind:value={editCategories} placeholder={t('add.categories_placeholder')} class="input-field" />
          </label>
        </div>

        <div class="card p-5 flex flex-col gap-4">
          <h3 class="text-xs font-semibold text-ink-muted uppercase tracking-wider">{t('add.series')}</h3>
          <select bind:value={editSeriesId} class="input-field">
            <option value="">{t('add.series_none')}</option>
            {#each seriesList as s}
              <option value={s.id}>{s.name}</option>
            {/each}
          </select>

          {#if editSeriesId}
            <label class="flex flex-col gap-1.5">
              <span class="text-xs font-semibold text-ink-muted uppercase tracking-wider">{t('add.series_position')}</span>
              <input type="number" bind:value={editSeriesOrder} min="1" placeholder="1" class="input-field" />
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
                editSeriesId = s.id;
                newSeriesName = '';
              }}>{t('add.series_add')}</button>
          </div>
        </div>

        <div class="flex gap-3 pt-1">
          <button type="submit" class="btn-primary flex-1">{t('book.save')}</button>
          <button type="button" class="btn-secondary" onclick={() => editing = false}>{t('dialog.cancel')}</button>
        </div>
      </form>
    {:else}
      <div class="flex gap-6 mb-8">
        <div class="flex-shrink-0">
          <div class="w-32 h-44 rounded-lg overflow-hidden book-shadow-lg bg-warm-100">
            {#if coverSrc}
              <img src={coverSrc} alt={book.title} class="w-full h-full object-cover" />
            {:else}
              <div class="w-full h-full flex items-center justify-center bg-gradient-to-br from-warm-100 to-warm-200 text-ink-muted text-xs text-center px-3 font-display">
                {book.title}
              </div>
            {/if}
          </div>
          <label class="block mt-2 text-xs text-accent cursor-pointer text-center font-medium hover:text-accent-dark transition-colors">
            {t('book.change_cover')}
            <input type="file" accept="image/*" class="hidden" onchange={handleCoverUpload} />
          </label>
        </div>

        <div class="flex flex-col justify-center min-w-0">
          <div class="flex items-start gap-1.5">
            <h1 class="font-display text-2xl font-bold text-ink tracking-tight leading-snug flex-1">{book.title}</h1>
            <button onclick={toggleWishlist} class="mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all {userData?.isWishlist ? 'text-accent bg-accent/10' : 'text-warm-300 hover:text-accent hover:bg-accent/5'}" aria-label="{userData?.isWishlist ? t('book.wishlist_in') : t('book.wishlist_add')}">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="{userData?.isWishlist ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            </button>
            <button onclick={startEditing} class="mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-warm-300 hover:text-accent hover:bg-accent/5 transition-colors" aria-label={t('book.edit')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
            </button>
          </div>
          <p class="text-sm text-ink-muted mt-1">{book.authors.join(', ')}</p>
          {#if book.isbn}<p class="text-xs text-warm-400 mt-1 font-mono">ISBN {book.isbn}</p>{/if}

          {#if book.categories.length}
            <div class="flex gap-1.5 mt-3 flex-wrap">
              {#each book.categories as cat}
                <span class="text-xs px-2.5 py-0.5 bg-warm-100 text-ink-muted rounded-full capitalize font-medium">{cat}</span>
              {/each}
            </div>
          {/if}

          {#if seriesName}
            <p class="text-xs text-accent mt-2 font-medium">
              {seriesName}{#if book.seriesOrder} &middot; {t('book.book_number', { n: book.seriesOrder })}{/if}
            </p>
          {/if}

          <div class="flex gap-0.5 mt-3">
            {#each [1, 2, 3, 4, 5] as star}
              <button
                class="star-btn {(userData?.rating || 0) >= star ? 'star-active' : 'star-inactive'}"
                onclick={() => updateRating(star)}
              >&#9733;</button>
            {/each}
          </div>
        </div>
      </div>

      <div class="mb-6">
        <h2 class="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2.5">{t('book.status')}</h2>
        <div class="flex gap-2">
          {#each (['unread', 'reading', 'read', 'dnf'] as const) as status}
            <button
              class="tab-pill {userData?.status === status ? 'tab-pill-active' : 'tab-pill-inactive'}"
              onclick={() => updateStatus(status)}
            >{statusConfig[status].label}</button>
          {/each}
        </div>
      </div>

      {#if userData?.status === 'reading'}
        <div class="mb-6 animate-fade-up">
          <h2 class="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2.5">{t('book.progress')}</h2>
          <div class="card p-4">
            <div class="flex gap-3 mb-3">
              <label class="flex-1 flex flex-col gap-1">
                <span class="text-xs text-ink-muted">{t('book.progress.current_page')}</span>
                <input
                  type="number"
                  min="0"
                  max={userData?.totalPages || undefined}
                  value={userData?.currentPage || ''}
                  onblur={(e) => updateProgress('currentPage', (e.target as HTMLInputElement).value)}
                  class="input-field !py-1.5 text-sm text-center"
                />
              </label>
              <label class="flex-1 flex flex-col gap-1">
                <span class="text-xs text-ink-muted">{t('book.progress.total_pages')}</span>
                <input
                  type="number"
                  min="1"
                  value={userData?.totalPages || ''}
                  onblur={(e) => updateProgress('totalPages', (e.target as HTMLInputElement).value)}
                  class="input-field !py-1.5 text-sm text-center"
                />
              </label>
            </div>
            {#if progressPercent !== null}
              <div class="flex items-center gap-3">
                <div class="flex-1 h-2 rounded-full bg-warm-100 overflow-hidden">
                  <div
                    class="h-full rounded-full bg-accent transition-all duration-500 ease-out"
                    style="width: {progressPercent}%"
                  ></div>
                </div>
                <span class="text-xs font-medium text-accent flex-shrink-0">
                  {t('book.progress.percent', { percent: progressPercent })}
                </span>
              </div>
              {#if userData?.currentPage && userData?.totalPages}
                <p class="text-xs text-ink-muted mt-1.5">{t('book.progress.pages', { current: userData.currentPage, total: userData.totalPages })}</p>
              {/if}
            {/if}
          </div>
        </div>
      {/if}

      <div class="mb-6">
        <h2 class="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2.5">{t('book.notes')}</h2>
        <textarea
          class="input-field resize-none h-24 text-sm"
          placeholder={t('book.notes_placeholder')}
          value={userData?.notes || ''}
          onblur={updateNotes}
        ></textarea>
      </div>

      <div class="mb-6">
        <h2 class="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2.5">{t('book.lending')}</h2>
        {#if userData?.lentTo}
          <div class="card flex items-center justify-between p-4">
            <div>
              <span class="text-sm text-ink">{t('book.lent_to')} <strong class="font-semibold">{userData.lentTo}</strong></span>
            </div>
            <button class="text-sm text-accent font-medium hover:text-accent-dark transition-colors" onclick={handleReturn}>{t('book.return')}</button>
          </div>
        {:else}
          <button class="btn-secondary" onclick={handleLend}>
            {t('book.lend')}
          </button>
        {/if}
      </div>

      <div class="mb-6">
        <h2 class="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2.5">{t('shelves.add_to')}</h2>
        {#if shelves.length > 0}
          <div class="flex gap-2 flex-wrap">
            {#each shelves as shelf}
              <button
                class="tab-pill !py-1 !px-3 !text-xs {bookShelfIds.has(shelf.id) ? 'tab-pill-active' : 'tab-pill-inactive'}"
                onclick={() => toggleShelf(shelf)}
              >{shelf.name}</button>
            {/each}
          </div>
        {:else}
          <a href="{base}/shelves" class="text-xs text-accent hover:text-accent-dark transition-colors font-medium">
            + {t('shelves.create')}
          </a>
        {/if}
      </div>

      <div class="mt-8 pt-6 border-t border-warm-100">
        <button
          class="text-xs text-warm-400 hover:text-berry transition-colors"
          onclick={handleDelete}
        >{t('book.delete')}</button>
      </div>
    {/if}
  </div>
{/if}
