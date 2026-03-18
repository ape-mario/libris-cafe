<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { base } from '$app/paths';
  import { getBooks } from '$lib/services/books';
  import { getAllSeries } from '$lib/services/series';
  import { getBooksBySeries } from '$lib/services/books';
  import { q } from '$lib/db';
  import type { Series } from '$lib/db';
  import { t } from '$lib/i18n/index.svelte';

  let categories = $state<{ name: string; count: number }[]>([]);
  let seriesList = $state<(Series & { count: number })[]>([]);
  let authors = $state<{ name: string; count: number }[]>([]);
  let tab = $state<'categories' | 'series' | 'authors'>('categories');

  let unsubBrowse: (() => void)[] = [];

  function loadBrowseData() {
    const books = getBooks();
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

    const allSeries = getAllSeries();
    seriesList = allSeries.map((s) => ({
      ...s,
      count: getBooksBySeries(s.id).length
    }));
  }

  onMount(() => {
    loadBrowseData();
    unsubBrowse = [q.observe('books', () => loadBrowseData()), q.observe('series', () => loadBrowseData())];
  });
  onDestroy(() => unsubBrowse.forEach(f => f()));
</script>

<div class="animate-fade-up">
  <h1 class="font-display text-2xl font-bold text-ink tracking-tight mb-6">{t('browse.title')}</h1>

  <div class="flex gap-2 mb-6 overflow-x-auto pb-1">
    {#each [
      { key: 'categories', label: t('browse.categories') },
      { key: 'series', label: t('browse.series') },
      { key: 'authors', label: t('browse.authors') }
    ] as tab_item}
      <button
        class="tab-pill {tab === tab_item.key ? 'tab-pill-active' : 'tab-pill-inactive'}"
        onclick={() => tab = tab_item.key as typeof tab}
      >{tab_item.label}</button>
    {/each}
  </div>

  <div class="flex flex-col gap-2">
    {#if tab === 'categories'}
      {#each categories as cat, i}
        <a href="{base}/browse/category/{encodeURIComponent(cat.name)}"
          class="card flex items-center justify-between p-4 hover:shadow-md transition-shadow animate-fade-up"
          style="animation-delay: {i * 40}ms">
          <span class="capitalize font-medium text-sm text-ink">{cat.name}</span>
          <span class="text-xs text-ink-muted bg-warm-100 px-2.5 py-0.5 rounded-full">{cat.count}</span>
        </a>
      {:else}
        <p class="text-ink-muted text-sm py-8 text-center">{t('browse.no_categories')}</p>
      {/each}
    {/if}

    {#if tab === 'series'}
      {#each seriesList as s, i}
        <a href="{base}/browse/series/{s.id}"
          class="card flex items-center justify-between p-4 hover:shadow-md transition-shadow animate-fade-up"
          style="animation-delay: {i * 40}ms">
          <span class="font-medium text-sm text-ink">{s.name}</span>
          <span class="text-xs text-ink-muted bg-warm-100 px-2.5 py-0.5 rounded-full">{s.count}</span>
        </a>
      {:else}
        <p class="text-ink-muted text-sm py-8 text-center">{t('browse.no_series')}</p>
      {/each}
    {/if}

    {#if tab === 'authors'}
      {#each authors as author, i}
        <a href="{base}/browse/author/{encodeURIComponent(author.name)}"
          class="card flex items-center justify-between p-4 hover:shadow-md transition-shadow animate-fade-up"
          style="animation-delay: {i * 40}ms">
          <span class="font-medium text-sm text-ink">{author.name}</span>
          <span class="text-xs text-ink-muted bg-warm-100 px-2.5 py-0.5 rounded-full">{author.count}</span>
        </a>
      {:else}
        <p class="text-ink-muted text-sm py-8 text-center">{t('browse.no_authors')}</p>
      {/each}
    {/if}
  </div>
</div>
