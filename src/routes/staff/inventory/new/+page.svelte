<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { searchBooks } from '$lib/services/books';
  import { getCurrentStaff } from '$lib/modules/auth/stores.svelte';
  import { addInventoryItem } from '$lib/modules/inventory/service';
  import { adjustStock } from '$lib/modules/inventory/service';
  import { showToast } from '$lib/stores/toast.svelte';
  import BarcodeScanner from '$lib/components/BarcodeScanner.svelte';
  import type { Book } from '$lib/db/types';
  import type { InventoryType, BookSource, BookCondition } from '$lib/modules/inventory/types';

  let staff = $derived(getCurrentStaff());

  // Book selection
  let searchQuery = $state('');
  let searchResults = $state<Book[]>([]);
  let selectedBook = $state<Book | null>(null);
  let showScanner = $state(false);

  // Form fields
  let price = $state<number | null>(null);
  let costPrice = $state<number | null>(null);
  let stock = $state(1);
  let type = $state<InventoryType>('for_sale');
  let source = $state<BookSource>('supplier');
  let condition = $state<BookCondition>('new');
  let isPreloved = $state(false);
  let location = $state('');

  let submitting = $state(false);

  function handleSearch() {
    if (searchQuery.trim().length < 2) {
      searchResults = [];
      return;
    }
    searchResults = searchBooks(searchQuery).slice(0, 10);
  }

  function selectBook(book: Book) {
    selectedBook = book;
    searchQuery = '';
    searchResults = [];
  }

  function handleBarcode(isbn: string) {
    showScanner = false;
    searchQuery = isbn;
    handleSearch();
    if (searchResults.length === 1) {
      selectBook(searchResults[0]);
    }
  }

  async function handleSubmit() {
    if (!selectedBook || !staff) return;
    submitting = true;

    try {
      const item = await addInventoryItem({
        book_id: selectedBook.id,
        outlet_id: staff.outlet_id,
        type,
        source,
        is_preloved: isPreloved,
        price,
        cost_price: costPrice,
        stock: 0, // Will be set by adjustStock
        condition,
        location: location.trim() || undefined,
      });

      if (stock > 0) {
        await adjustStock(item.id, stock, 'purchase_in', staff.id, 'Initial stock');
      }

      showToast(t('inventory.add') + ' — ' + selectedBook.title, 'success');
      goto(`${base}/staff/inventory`);
    } catch (err) {
      console.error('Failed to add inventory:', err);
      showToast(err instanceof Error ? err.message : 'Failed to add inventory', 'error');
    } finally {
      submitting = false;
    }
  }
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <h1 class="font-display text-xl font-bold text-ink">{t('inventory.add')}</h1>
    <a href="{base}/staff/inventory" class="text-sm text-ink-muted hover:text-accent transition-colors">
      &larr; Back
    </a>
  </div>

  {#if !selectedBook}
    <!-- Book Search -->
    <div class="bg-surface rounded-xl border border-warm-100 p-4 space-y-3">
      <label class="text-sm font-medium text-ink">Select a book from catalog</label>
      <div class="flex gap-2">
        <input
          type="text"
          placeholder={t('kiosk.searchPlaceholder')}
          bind:value={searchQuery}
          oninput={handleSearch}
          class="flex-1 px-3 py-2 rounded-lg border border-warm-200 bg-cream text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <button
          class="px-3 py-2 rounded-lg bg-accent/10 text-accent text-sm font-medium"
          onclick={() => showScanner = !showScanner}
        >
          Scan
        </button>
      </div>

      {#if showScanner}
        <div class="rounded-xl overflow-hidden">
          <BarcodeScanner onDetected={handleBarcode} />
        </div>
      {/if}

      {#if searchResults.length > 0}
        <div class="space-y-1 max-h-60 overflow-y-auto">
          {#each searchResults as book}
            <button
              class="w-full text-left px-3 py-2 rounded-lg hover:bg-warm-50 transition-colors"
              onclick={() => selectBook(book)}
            >
              <p class="text-sm font-medium text-ink truncate">{book.title}</p>
              <p class="text-xs text-ink-muted">{(book.authors ?? []).join(', ')}</p>
            </button>
          {/each}
        </div>
      {:else if searchQuery.trim().length >= 2}
        <div class="text-sm text-ink-muted py-2">
          No books found.
          <a href="{base}/add" class="text-accent hover:underline">Add to catalog first</a>
        </div>
      {/if}
    </div>
  {:else}
    <!-- Selected Book -->
    <div class="bg-surface rounded-xl border border-warm-100 p-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-ink">{selectedBook.title}</p>
          <p class="text-xs text-ink-muted">{(selectedBook.authors ?? []).join(', ')}</p>
        </div>
        <button
          class="text-xs text-ink-muted hover:text-berry transition-colors"
          onclick={() => selectedBook = null}
        >
          Change
        </button>
      </div>
    </div>

    <!-- Inventory Form -->
    <form
      class="bg-surface rounded-xl border border-warm-100 p-4 space-y-4"
      onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}
    >
      <!-- Price -->
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="text-xs font-medium text-ink-muted mb-1 block">{t('inventory.price')}</label>
          <input
            type="number"
            bind:value={price}
            min="0"
            step="1000"
            placeholder="Rp"
            class="w-full px-3 py-2 rounded-lg border border-warm-200 bg-cream text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        <div>
          <label class="text-xs font-medium text-ink-muted mb-1 block">{t('inventory.cost_price')}</label>
          <input
            type="number"
            bind:value={costPrice}
            min="0"
            step="1000"
            placeholder="Rp"
            class="w-full px-3 py-2 rounded-lg border border-warm-200 bg-cream text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      </div>

      <!-- Stock -->
      <div>
        <label class="text-xs font-medium text-ink-muted mb-1 block">{t('inventory.stock')}</label>
        <input
          type="number"
          bind:value={stock}
          min="0"
          class="w-full px-3 py-2 rounded-lg border border-warm-200 bg-cream text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      <!-- Type -->
      <div>
        <label class="text-xs font-medium text-ink-muted mb-1 block">{t('inventory.type')}</label>
        <select
          bind:value={type}
          class="w-full px-3 py-2 rounded-lg border border-warm-200 bg-cream text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="for_sale">{t('inventory.type_sale')}</option>
          <option value="read_in_store">{t('inventory.type_read')}</option>
          <option value="both">{t('inventory.type_both')}</option>
        </select>
      </div>

      <!-- Source -->
      <div>
        <label class="text-xs font-medium text-ink-muted mb-1 block">{t('inventory.source')}</label>
        <select
          bind:value={source}
          class="w-full px-3 py-2 rounded-lg border border-warm-200 bg-cream text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="supplier">{t('inventory.source_supplier')}</option>
          <option value="owner">{t('inventory.source_owner')}</option>
          <option value="consignment">{t('inventory.source_consignment')}</option>
          <option value="buyback">{t('inventory.source_buyback')}</option>
        </select>
      </div>

      <!-- Condition -->
      <div>
        <label class="text-xs font-medium text-ink-muted mb-1 block">{t('inventory.condition')}</label>
        <select
          bind:value={condition}
          class="w-full px-3 py-2 rounded-lg border border-warm-200 bg-cream text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="new">{t('inventory.condition_new')}</option>
          <option value="good">{t('inventory.condition_good')}</option>
          <option value="fair">{t('inventory.condition_fair')}</option>
        </select>
      </div>

      <!-- Preloved -->
      <label class="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          bind:checked={isPreloved}
          class="w-4 h-4 rounded border-warm-300 text-accent focus:ring-accent"
        />
        {t('inventory.preloved')}
      </label>

      <!-- Location -->
      <div>
        <label class="text-xs font-medium text-ink-muted mb-1 block">{t('inventory.location')}</label>
        <input
          type="text"
          bind:value={location}
          placeholder="e.g. Shelf A3"
          class="w-full px-3 py-2 rounded-lg border border-warm-200 bg-cream text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      <!-- Submit -->
      <button
        type="submit"
        disabled={submitting}
        class="w-full py-3 rounded-xl bg-accent text-cream font-medium text-sm disabled:opacity-50 transition-opacity"
      >
        {submitting ? t('common.loading') : t('inventory.add')}
      </button>
    </form>
  {/if}
</div>
