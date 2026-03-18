<script lang="ts">
  import { onMount } from 'svelte';
  import type { Book } from '$lib/db';

  let { book, onclick }: { book: Book; onclick?: () => void } = $props();

  let coverSrc = $state<string | null>(null);

  onMount(() => {
    if (book.coverBlob) {
      coverSrc = URL.createObjectURL(book.coverBlob);
      return () => { if (coverSrc) URL.revokeObjectURL(coverSrc); };
    } else if (book.coverUrl) {
      coverSrc = book.coverUrl;
    }
  });
</script>

<button
  class="group flex flex-col gap-2.5 w-[7.5rem] text-left"
  {onclick}
>
  <div class="relative w-[7.5rem] h-[10.5rem] rounded-lg overflow-hidden book-cover-shadow transition-all duration-300 flex-shrink-0 bg-warm-100">
    {#if coverSrc}
      <img src={coverSrc} alt={book.title} class="w-full h-full object-cover" />
    {:else}
      <div class="w-full h-full flex flex-col items-center justify-center px-3 text-center bg-gradient-to-br from-warm-100 to-warm-200">
        <span class="font-display text-xs font-semibold text-ink-light leading-snug">{book.title}</span>
        <span class="text-[9px] text-ink-muted mt-1">{book.authors.join(', ')}</span>
      </div>
    {/if}
    <!-- Spine effect -->
    <div class="absolute left-0 top-0 bottom-0 w-[3px] bg-black/[0.06] dark:bg-white/[0.08]"></div>
  </div>
  <div class="w-full px-0.5">
    <h3 class="font-display text-[11px] font-semibold text-ink leading-tight truncate">{book.title}</h3>
    <p class="text-[10px] text-ink-muted truncate mt-0.5">{book.authors.join(', ')}</p>
  </div>
</button>
