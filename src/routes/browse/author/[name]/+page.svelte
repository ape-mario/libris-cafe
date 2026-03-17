<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { getBooks } from '$lib/services/books';
  import type { Book } from '$lib/db';
  import BookCard from '$lib/components/BookCard.svelte';

  let books = $state<Book[]>([]);
  let name = $derived(decodeURIComponent(page.params.name!));

  onMount(async () => {
    const allBooks = await getBooks();
    books = allBooks.filter((b) => b.authors.some((a) => a === name));
  });
</script>

<h1 class="text-xl font-bold mb-4">{name}</h1>

<div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
  {#each books as book}
    <BookCard {book} onclick={() => goto(`/book/${book.id}`)} />
  {/each}
</div>
