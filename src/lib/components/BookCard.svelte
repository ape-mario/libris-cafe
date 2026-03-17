<script lang="ts">
  import type { Book } from '$lib/db';

  let { book, onclick }: { book: Book; onclick?: () => void } = $props();

  function getCoverSrc(book: Book): string | null {
    if (book.coverBlob) return URL.createObjectURL(book.coverBlob);
    if (book.coverUrl) return book.coverUrl;
    return null;
  }
</script>

<button
  class="flex flex-col rounded-xl bg-slate-800 overflow-hidden hover:ring-2 hover:ring-blue-500 transition w-full text-left"
  {onclick}
>
  {#if getCoverSrc(book)}
    <img src={getCoverSrc(book)} alt={book.title} class="w-full h-48 object-cover" />
  {:else}
    <div class="w-full h-48 bg-slate-700 flex items-center justify-center text-slate-500 text-sm px-2 text-center">
      {book.title}
    </div>
  {/if}
  <div class="p-3">
    <h3 class="font-medium text-sm truncate">{book.title}</h3>
    <p class="text-xs text-slate-400 truncate">{book.authors.join(', ')}</p>
    {#if book.categories.length}
      <div class="flex gap-1 mt-2 flex-wrap">
        {#each book.categories.slice(0, 3) as cat}
          <span class="text-xs px-2 py-0.5 bg-slate-700 rounded-full">{cat}</span>
        {/each}
      </div>
    {/if}
  </div>
</button>
