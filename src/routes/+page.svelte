<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getBooks, searchBooks } from '$lib/services/books';
  import type { Book } from '$lib/db';
  import BookCard from '$lib/components/BookCard.svelte';

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

<div>
  <div class="mb-4">
    <input
      type="search"
      bind:value={query}
      oninput={handleSearch}
      placeholder="Search books..."
      class="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white"
    />
  </div>

  {#if loading}
    <p class="text-slate-400">Loading...</p>
  {:else if books.length === 0}
    <div class="text-center py-12">
      <p class="text-slate-400 mb-4">No books yet.</p>
      <a href="/add" class="px-4 py-2 bg-blue-600 rounded-lg text-white">Add your first book</a>
    </div>
  {:else}
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {#each books as book}
        <BookCard {book} onclick={() => goto(`/book/${book.id}`)} />
      {/each}
    </div>
  {/if}
</div>
