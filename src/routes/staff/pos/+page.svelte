<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/index.svelte';
  import { searchBooks, getBookById } from '$lib/services/books';
  import BarcodeScanner from '$lib/components/BarcodeScanner.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import { showConfirm } from '$lib/stores/dialog.svelte';
  import { getCurrentStaff } from '$lib/modules/auth/stores.svelte';
  import { getInventoryByBookId } from '$lib/modules/inventory/service';
  import { addToCart, removeFromCart, updateQuantity, clearCart } from '$lib/modules/pos/cart';
  import { getCart, setCart, resetCart } from '$lib/modules/pos/stores.svelte';
  import { checkout } from '$lib/modules/pos/checkout';
  import type { Book } from '$lib/db';

  let searchQuery = $state('');
  let searchResults = $state<Book[]>([]);
  let showScanner = $state(false);
  let processing = $state(false);
  let cart = $derived(getCart());
  let staff = $derived(getCurrentStaff());

  let searchTimeout: ReturnType<typeof setTimeout>;

  function handleSearch() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchResults = searchQuery.length >= 2
        ? searchBooks(searchQuery).slice(0, 20)
        : [];
    }, 300);
  }

  async function handleBarcodeDetected(code: string) {
    showScanner = false;
    searchQuery = code;
    searchResults = searchBooks(code);

    if (searchResults.length === 1) {
      await addBookToCart(searchResults[0]);
    }
  }

  async function addBookToCart(book: Book) {
    if (!staff) return;

    const inventory = await getInventoryByBookId(book.id, staff.outlet_id);
    if (!inventory) {
      showToast('Book not in inventory', 'error');
      return;
    }
    if (inventory.type === 'read_in_store') {
      showToast('This book is for reading in store only', 'error');
      return;
    }
    if (inventory.stock <= 0) {
      showToast('Out of stock', 'error');
      return;
    }

    setCart(addToCart(cart, inventory, book));
    searchQuery = '';
    searchResults = [];
    showToast(`${book.title} added`, 'success');
  }

  function handleRemove(inventoryId: string) {
    setCart(removeFromCart(cart, inventoryId));
  }

  function handleQuantityChange(inventoryId: string, qty: number) {
    setCart(updateQuantity(cart, inventoryId, qty));
  }

  async function handleCheckout() {
    if (!staff || cart.items.length === 0 || processing) return;

    const confirmed = await showConfirm({
      title: `${t('pos.pay_cash')} — Rp ${cart.total.toLocaleString('id-ID')}`,
      message: `${cart.items.length} item(s)`,
    });

    if (!confirmed) return;

    processing = true;
    try {
      const result = await checkout({
        cart,
        paymentMethod: 'cash',
        staffId: staff.id,
        outletId: staff.outlet_id,
      });

      if (result.synced) {
        showToast(t('pos.checkout_success'), 'success');
      } else {
        showToast(t('pos.checkout_offline'), 'info');
      }

      resetCart();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Checkout failed', 'error');
    } finally {
      processing = false;
    }
  }

  function formatPrice(amount: number): string {
    return `Rp ${amount.toLocaleString('id-ID')}`;
  }
</script>

<div class="space-y-4">
  <!-- Search Bar -->
  <div class="flex gap-2">
    <div class="flex-1 relative">
      <input
        type="text"
        bind:value={searchQuery}
        oninput={handleSearch}
        placeholder={t('pos.search')}
        class="w-full pl-10 pr-4 py-3 rounded-xl bg-surface border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
      />
      <svg class="absolute left-3 top-3.5 text-ink-muted" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
    </div>
    <button
      class="px-4 py-3 rounded-xl bg-accent text-cream text-sm font-medium"
      onclick={() => showScanner = !showScanner}
    >
      {t('pos.scan')}
    </button>
  </div>

  <!-- Barcode Scanner -->
  {#if showScanner}
    <div class="rounded-xl overflow-hidden border border-warm-100">
      <BarcodeScanner onDetected={handleBarcodeDetected} />
    </div>
  {/if}

  <!-- Search Results -->
  {#if searchResults.length > 0}
    <div class="bg-surface rounded-xl border border-warm-100 divide-y divide-warm-50 max-h-60 overflow-y-auto">
      {#each searchResults as book}
        <button
          class="w-full px-4 py-3 text-left hover:bg-warm-50 transition-colors flex justify-between items-center"
          onclick={() => addBookToCart(book)}
        >
          <div>
            <p class="text-sm font-medium text-ink">{book.title}</p>
            <p class="text-xs text-ink-muted">{book.authors.join(', ')}</p>
          </div>
          <span class="text-accent text-lg">+</span>
        </button>
      {/each}
    </div>
  {/if}

  <!-- Cart -->
  <div class="bg-surface rounded-xl border border-warm-100">
    <div class="px-4 py-3 border-b border-warm-50">
      <h2 class="text-sm font-semibold text-ink uppercase tracking-wide">{t('pos.cart')}</h2>
    </div>

    {#if cart.items.length === 0}
      <div class="px-4 py-8 text-center text-sm text-ink-muted">
        {t('pos.cart_empty')}
      </div>
    {:else}
      <div class="divide-y divide-warm-50">
        {#each cart.items as item}
          <div class="px-4 py-3 flex items-center gap-3">
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-ink truncate">{item.book.title}</p>
              <p class="text-xs text-ink-muted">{formatPrice(item.unitPrice)}</p>
            </div>
            <div class="flex items-center gap-2">
              <button
                class="w-7 h-7 rounded-lg bg-warm-50 text-ink-muted hover:bg-warm-100 text-sm font-bold"
                onclick={() => handleQuantityChange(item.inventory.id, item.quantity - 1)}
              >-</button>
              <span class="text-sm font-semibold w-6 text-center">{item.quantity}</span>
              <button
                class="w-7 h-7 rounded-lg bg-warm-50 text-ink-muted hover:bg-warm-100 text-sm font-bold"
                onclick={() => handleQuantityChange(item.inventory.id, item.quantity + 1)}
              >+</button>
            </div>
            <p class="text-sm font-semibold text-ink w-24 text-right">{formatPrice(item.total)}</p>
            <button
              class="text-berry/60 hover:text-berry text-sm"
              onclick={() => handleRemove(item.inventory.id)}
            >&#215;</button>
          </div>
        {/each}
      </div>

      <!-- Totals -->
      <div class="px-4 py-3 border-t border-warm-100 space-y-1">
        <div class="flex justify-between text-sm text-ink-muted">
          <span>{t('pos.subtotal')}</span>
          <span>{formatPrice(cart.subtotal)}</span>
        </div>
        {#if cart.tax > 0}
          <div class="flex justify-between text-sm text-ink-muted">
            <span>{t('pos.tax', { rate: String(cart.taxRate) })}</span>
            <span>{formatPrice(cart.tax)}</span>
          </div>
        {/if}
        <div class="flex justify-between text-base font-bold text-ink pt-1">
          <span>{t('pos.total')}</span>
          <span>{formatPrice(cart.total)}</span>
        </div>
      </div>

      <!-- Checkout Button -->
      <div class="px-4 py-3 border-t border-warm-100">
        <button
          class="w-full py-3 rounded-xl bg-accent text-cream font-semibold text-sm hover:bg-accent/90 transition-colors disabled:opacity-50"
          onclick={handleCheckout}
          disabled={processing}
        >
          {processing ? '...' : `${t('pos.pay_cash')} — ${formatPrice(cart.total)}`}
        </button>
      </div>
    {/if}
  </div>
</div>
