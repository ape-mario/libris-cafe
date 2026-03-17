<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { getBooksBySeries } from '$lib/services/books';
  import { db } from '$lib/db';
  import type { Book, Series } from '$lib/db';
  import BookCard from '$lib/components/BookCard.svelte';

  let books = $state<Book[]>([]);
  let series = $state<Series | null>(null);

  onMount(async () => {
    series = (await db.series.get(page.params.id!)) || null;
    books = await getBooksBySeries(page.params.id!);
  });
</script>

<h1 class="text-xl font-bold mb-4">{series?.name || 'Series'}</h1>

<div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
  {#each books as book}
    <BookCard {book} onclick={() => goto(`/book/${book.id}`)} />
  {/each}
</div>
