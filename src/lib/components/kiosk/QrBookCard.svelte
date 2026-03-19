<script lang="ts">
  import type { Book } from '$lib/db/types';

  let { book, showQr = false }: { book: Book; showQr?: boolean } = $props();

  // Simple QR URL — could link to book detail page or external catalog
  const qrUrl = $derived(
    showQr ? `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(`/book/${book.id}`)}` : null
  );
</script>

<div class="bg-base-200 rounded-xl overflow-hidden shadow-sm active:scale-[0.98] transition-transform">
  <!-- Cover image -->
  <div class="aspect-[2/3] bg-base-300 relative">
    {#if book.coverUrl}
      <img
        src={book.coverUrl}
        alt={book.title}
        class="w-full h-full object-cover"
        loading="lazy"
      />
    {:else}
      <div class="w-full h-full flex items-center justify-center text-base-content/30">
        <svg class="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>
      </div>
    {/if}

    {#if qrUrl}
      <img
        src={qrUrl}
        alt="QR"
        class="absolute bottom-1 right-1 w-12 h-12 bg-white rounded p-0.5"
      />
    {/if}
  </div>

  <!-- Info -->
  <div class="p-2">
    <h3 class="font-medium text-sm line-clamp-2 leading-tight">{book.title}</h3>
    {#if book.authors?.length}
      <p class="text-xs text-base-content/60 mt-0.5 truncate">{book.authors.join(', ')}</p>
    {/if}
  </div>
</div>
