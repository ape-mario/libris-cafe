<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import { getKioskStore } from '$lib/modules/kiosk/stores.svelte';
  import QrBookCard from '$lib/components/kiosk/QrBookCard.svelte';
  import type { Book } from '$lib/db/types';

  const kiosk = getKioskStore();
  let searchQuery = $state('');

  // Placeholder: in production, books would come from a shared store or page load
  const books: Book[] = [];

  const filteredBooks = $derived(
    searchQuery.trim()
      ? books.filter(b =>
          b.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (b.authors ?? []).some(a => a.toLowerCase().includes(searchQuery.toLowerCase()))
        )
      : books
  );
</script>

<div class="space-y-4">
  <!-- Search bar -->
  <div class="sticky top-0 z-10 bg-base-100 pb-2">
    <input
      type="search"
      placeholder={t('kiosk.searchPlaceholder')}
      bind:value={searchQuery}
      class="w-full px-4 py-3 rounded-xl border border-base-300 bg-base-200 text-lg focus:outline-none focus:ring-2 focus:ring-primary"
    />
  </div>

  <!-- Book grid -->
  <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
    {#each filteredBooks as book (book.id)}
      <QrBookCard
        {book}
        showQr={kiosk.config.show_qr_codes}
      />
    {/each}
  </div>

  {#if filteredBooks.length === 0}
    <div class="text-center py-12 text-base-content/60">
      <p class="text-xl">{t('kiosk.noResults')}</p>
    </div>
  {/if}
</div>
