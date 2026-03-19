<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { t } from '$lib/i18n/index.svelte';
  import { getKioskStore } from '$lib/modules/kiosk/stores.svelte';
  import QrBookCard from '$lib/components/kiosk/QrBookCard.svelte';
  import { getBooks, searchBooks } from '$lib/services/books';
  import { fetchAvailability, getBookAvailability } from '$lib/modules/inventory/public-availability';
  import { q } from '$lib/db';
  import type { Book } from '$lib/db/types';

  const kiosk = getKioskStore();
  let searchQuery = $state('');
  let books = $state<Book[]>([]);
  let loading = $state(true);
  let unsubBooks: (() => void) | null = null;

  onMount(async () => {
    books = getBooks();
    loading = false;

    // Load availability data from Supabase
    await fetchAvailability();

    // Observe changes to catalog
    unsubBooks = q.observe('books', () => {
      books = getBooks();
    });
  });

  onDestroy(() => {
    unsubBooks?.();
  });

  const filteredBooks = $derived(
    searchQuery.trim()
      ? searchBooks(searchQuery)
      : books
  );

  function availabilityBadge(book: Book): { label: string; class: string } | null {
    const avail = getBookAvailability(book.id);
    if (!avail) return null;
    if (!avail.in_stock) return { label: t('inventory.out_of_stock'), class: 'bg-berry/10 text-berry' };
    if (avail.type === 'for_sale') return { label: t('inventory.type_sale'), class: 'bg-sage/10 text-sage' };
    if (avail.type === 'read_in_store') return { label: t('inventory.type_read'), class: 'bg-gold/10 text-gold' };
    return { label: t('inventory.type_both'), class: 'bg-accent/10 text-accent' };
  }
</script>

<div class="space-y-4">
  <!-- Search bar -->
  <div class="sticky top-0 z-10 bg-cream pb-2">
    <input
      type="search"
      placeholder={t('kiosk.searchPlaceholder')}
      bind:value={searchQuery}
      class="w-full px-4 py-3 rounded-xl border border-warm-200 bg-surface text-lg text-ink focus:outline-none focus:ring-2 focus:ring-accent"
    />
  </div>

  {#if loading}
    <div class="text-center py-12 text-ink-muted">
      <p class="text-xl">{t('common.loading')}</p>
    </div>
  {:else}
    <!-- Book grid -->
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {#each filteredBooks as book (book.id)}
        <div class="relative">
          <QrBookCard
            {book}
            showQr={kiosk.config.show_qr_codes}
          />
          {#if availabilityBadge(book)}
            {@const badge = availabilityBadge(book)!}
            <span class="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded-full font-medium {badge.class}">
              {badge.label}
            </span>
          {/if}
        </div>
      {/each}
    </div>

    {#if filteredBooks.length === 0}
      <div class="text-center py-12 text-ink-muted">
        <p class="text-xl">{t('kiosk.noResults')}</p>
      </div>
    {/if}
  {/if}
</div>
