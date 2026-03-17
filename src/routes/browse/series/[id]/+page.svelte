<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { getBooksBySeries } from '$lib/services/books';
  import { db } from '$lib/db';
  import type { Book, Series } from '$lib/db';
  import BookCard from '$lib/components/BookCard.svelte';
  import { t, bookCount } from '$lib/i18n/index.svelte';

  let books = $state<Book[]>([]);
  let series = $state<Series | null>(null);

  onMount(async () => {
    series = (await db.series.get(page.params.id!)) || null;
    books = await getBooksBySeries(page.params.id!);
  });
</script>

<div class="animate-fade-up">
  <button onclick={() => history.back()} class="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink mb-4 transition-colors">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
    {t('common.back')}
  </button>

  <h1 class="font-display text-2xl font-bold text-ink tracking-tight mb-1">{series?.name || t('browse.series')}</h1>
  <p class="text-sm text-ink-muted mb-6">{bookCount(books.length)}</p>

  <div class="flex flex-wrap gap-x-4 gap-y-6">
    {#each books as book, i}
      <div style="animation-delay: {i * 40}ms" class="animate-fade-up">
        <BookCard {book} onclick={() => goto(`/book/${book.id}`)} />
      </div>
    {/each}
  </div>
</div>
