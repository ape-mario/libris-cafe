<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getBooks, searchBooks } from '$lib/services/books';
  import type { Book } from '$lib/db';
  import BookCard from '$lib/components/BookCard.svelte';
  import { t, bookCount } from '$lib/i18n/index.svelte';

  let books = $state<Book[]>([]);
  let query = $state('');
  let loading = $state(true);

  onMount(async () => {
    books = await getBooks();
    loading = false;
  });

  async function handleSearch() {
    if (query.trim()) {
      books = await searchBooks(query);
    } else {
      books = await getBooks();
    }
  }
</script>

<div class="animate-fade-up">
  <div class="flex items-end justify-between mb-6">
    <div>
      <h1 class="font-display text-2xl font-bold text-ink tracking-tight">{t('library.title')}</h1>
      {#if books.length > 0}
        <p class="text-sm text-ink-muted mt-0.5">{bookCount(books.length)}</p>
      {/if}
    </div>
  </div>

  <div class="mb-6">
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

  {#if loading}
    <div class="flex justify-center py-16">
      <div class="w-8 h-0.5 bg-warm-300 rounded-full animate-pulse"></div>
    </div>
  {:else if books.length === 0 && !query}
    <div class="text-center py-16 animate-fade-in">
      <div class="w-16 h-16 rounded-2xl bg-warm-100 mx-auto mb-4 flex items-center justify-center">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-warm-400"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
      </div>
      <p class="font-display text-lg text-ink-light mb-1">{t('library.empty.title')}</p>
      <p class="text-sm text-ink-muted mb-6">{t('library.empty.subtitle')}</p>
      <a href="/add" class="btn-primary inline-block">{t('library.empty.cta')}</a>
    </div>
  {:else if books.length === 0 && query}
    <p class="text-center text-ink-muted py-12">{t('library.no_results')} "{query}"</p>
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
