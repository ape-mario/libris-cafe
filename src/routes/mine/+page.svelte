<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getCurrentUser } from '$lib/stores/user.svelte';
  import { getUserBooks, getLentBooks } from '$lib/services/userbooks';
  import { getBookById } from '$lib/services/books';
  import type { Book, UserBookData } from '$lib/db';
  import BookCard from '$lib/components/BookCard.svelte';
  import { t } from '$lib/i18n/index.svelte';

  let user = $derived(getCurrentUser());
  let tab = $state<'reading' | 'wishlist' | 'lent' | 'read' | 'dnf'>('reading');

  let books = $state<(UserBookData & { book: Book })[]>([]);
  let loading = $state(true);

  onMount(() => loadTab());

  async function loadTab() {
    if (!user) return;
    loading = true;
    let data: UserBookData[];

    if (tab === 'reading') {
      data = await getUserBooks(user.id, { status: 'reading' });
    } else if (tab === 'wishlist') {
      data = await getUserBooks(user.id, { isWishlist: true });
    } else if (tab === 'lent') {
      data = await getLentBooks(user.id);
    } else if (tab === 'dnf') {
      data = await getUserBooks(user.id, { status: 'dnf' });
    } else {
      data = await getUserBooks(user.id, { status: 'read' });
    }

    const enriched = await Promise.all(
      data.map(async (d) => {
        const book = await getBookById(d.bookId);
        return book ? { ...d, book } : null;
      })
    );
    books = enriched.filter(Boolean) as (UserBookData & { book: Book })[];
    loading = false;
  }
</script>

<div class="animate-fade-up">
  <div class="mb-6">
    <h1 class="font-display text-2xl font-bold text-ink tracking-tight">{t('mine.title')}</h1>
  </div>

  <div class="flex gap-2 mb-6 overflow-x-auto pb-1">
    {#each [
      { key: 'reading', label: t('mine.reading') },
      { key: 'read', label: t('mine.finished') },
      { key: 'dnf', label: t('mine.dnf') },
      { key: 'wishlist', label: t('mine.wishlist') },
      { key: 'lent', label: t('mine.lent') }
    ] as tab_item}
      <button
        class="tab-pill {tab === tab_item.key ? 'tab-pill-active' : 'tab-pill-inactive'}"
        onclick={() => { tab = tab_item.key as typeof tab; loadTab(); }}
      >{tab_item.label}</button>
    {/each}
  </div>

  {#if loading}
    <div class="flex justify-center py-16">
      <div class="w-8 h-0.5 bg-warm-300 rounded-full animate-pulse"></div>
    </div>
  {:else if books.length === 0}
    <div class="text-center py-16">
      <div class="w-16 h-16 rounded-2xl bg-warm-100 mx-auto mb-4 flex items-center justify-center">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-warm-400"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
      </div>
      <p class="text-sm text-ink-muted">{t('mine.empty')}</p>
    </div>
  {:else}
    {#if tab === 'lent'}
      <div class="flex flex-col gap-2">
        {#each books as item, i}
          <button
            class="card flex items-center gap-4 p-4 text-left hover:shadow-md transition-shadow w-full animate-fade-up"
            style="animation-delay: {i * 40}ms"
            onclick={() => goto(`/book/${item.bookId}`)}
          >
            <div class="w-10 h-14 rounded overflow-hidden book-shadow bg-warm-100 flex-shrink-0">
              {#if item.book.coverBlob || item.book.coverUrl}
                <img src={item.book.coverBlob ? URL.createObjectURL(item.book.coverBlob) : item.book.coverUrl} alt={item.book.title} class="w-full h-full object-cover" />
              {/if}
            </div>
            <div class="min-w-0">
              <div class="font-display text-sm font-semibold text-ink truncate">{item.book.title}</div>
              <div class="text-xs text-ink-muted">{t('mine.lent_to')} <span class="font-medium text-accent">{item.lentTo}</span></div>
            </div>
          </button>
        {/each}
      </div>
    {:else}
      <div class="flex flex-wrap gap-x-4 gap-y-6">
        {#each books as item, i}
          <div style="animation-delay: {i * 40}ms" class="animate-fade-up">
            <BookCard book={item.book} onclick={() => goto(`/book/${item.bookId}`)} />
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>
