<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '$lib/db';
  import type { Category, Series } from '$lib/db';

  let categories = $state<{ name: string; count: number }[]>([]);
  let seriesList = $state<(Series & { count: number })[]>([]);
  let authors = $state<{ name: string; count: number }[]>([]);
  let tab = $state<'categories' | 'series' | 'authors'>('categories');

  onMount(async () => {
    const books = await db.books.toArray();
    const catMap = new Map<string, number>();
    const authorMap = new Map<string, number>();

    for (const book of books) {
      for (const cat of book.categories) {
        catMap.set(cat, (catMap.get(cat) || 0) + 1);
      }
      for (const author of book.authors) {
        authorMap.set(author, (authorMap.get(author) || 0) + 1);
      }
    }

    categories = [...catMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    authors = [...authorMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const allSeries = await db.series.toArray();
    seriesList = await Promise.all(
      allSeries.map(async (s) => ({
        ...s,
        count: await db.books.where('seriesId').equals(s.id).count()
      }))
    );
  });
</script>

<h1 class="text-xl font-bold mb-4">Browse</h1>

<div class="flex gap-2 mb-6">
  {#each ['categories', 'series', 'authors'] as t}
    <button
      class="px-4 py-2 rounded-lg text-sm capitalize {tab === t ? 'bg-blue-600' : 'bg-slate-800'}"
      onclick={() => tab = t as typeof tab}
    >{t}</button>
  {/each}
</div>

{#if tab === 'categories'}
  {#each categories as cat}
    <a href="/browse/category/{encodeURIComponent(cat.name)}"
      class="flex items-center justify-between p-3 mb-2 bg-slate-800 rounded-lg hover:bg-slate-700">
      <span class="capitalize">{cat.name}</span>
      <span class="text-sm text-slate-400">{cat.count} books</span>
    </a>
  {:else}
    <p class="text-slate-400">No categories yet. Add categories when adding books.</p>
  {/each}
{/if}

{#if tab === 'series'}
  {#each seriesList as s}
    <a href="/browse/series/{s.id}"
      class="flex items-center justify-between p-3 mb-2 bg-slate-800 rounded-lg hover:bg-slate-700">
      <span>{s.name}</span>
      <span class="text-sm text-slate-400">{s.count} books</span>
    </a>
  {:else}
    <p class="text-slate-400">No series yet.</p>
  {/each}
{/if}

{#if tab === 'authors'}
  {#each authors as author}
    <a href="/browse/author/{encodeURIComponent(author.name)}"
      class="flex items-center justify-between p-3 mb-2 bg-slate-800 rounded-lg hover:bg-slate-700">
      <span>{author.name}</span>
      <span class="text-sm text-slate-400">{author.count} books</span>
    </a>
  {:else}
    <p class="text-slate-400">No authors yet.</p>
  {/each}
{/if}
