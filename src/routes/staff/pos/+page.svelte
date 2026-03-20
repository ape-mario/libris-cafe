<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/index.svelte';
  import { searchBooks, getBookById } from '$lib/services/books';
  import BarcodeScanner from '$lib/components/BarcodeScanner.svelte';
  import PaymentModal from '$lib/components/PaymentModal.svelte';
  import ReceiptSender from '$lib/components/ReceiptSender.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import { showConfirm } from '$lib/stores/dialog.svelte';
  import { getCurrentStaff } from '$lib/modules/auth/stores.svelte';
  import { getInventoryByBookId } from '$lib/modules/inventory/service';
  import { addToCart, removeFromCart, updateQuantity, setCartDiscount } from '$lib/modules/pos/cart';
  import { getCart, setCart, resetCart, cartStore } from '$lib/modules/pos/stores.svelte';
  import { checkout } from '$lib/modules/pos/checkout';
  import { getIsOnline } from '$lib/modules/sync/manager';
  import PrintButton from '$lib/components/printer/PrintButton.svelte';
  import { buildReceiptFromTransaction, tryPrintReceipt } from '$lib/modules/pos/checkout';
  import type { ReceiptData as PrinterReceiptData } from '$lib/modules/printer/types';
  import type { Book } from '$lib/db';
  import type { PaymentMethod } from '$lib/modules/payment/types';
  import type { ReceiptData } from '$lib/modules/receipt/types';
  import { openSnapPayment } from '$lib/modules/payment/snap';
  import { getActivePayment, clearActivePayment } from '$lib/modules/payment/stores.svelte';

  let outletInfo = $state({ name: 'Libris Cafe', address: '', phone: '' });

  let searchQuery = $state('');
  let searchResults = $state<Book[]>([]);
  let showScanner = $state(false);
  let processing = $state(false);
  let cart = $derived(cartStore.current);
  let staff = $derived(getCurrentStaff());
  let online = $derived(getIsOnline());

  // Payment method selection
  let selectedPayment = $state<PaymentMethod>('cash');
  let showPaymentModal = $state(false);
  let pendingTransactionId = $state<string | null>(null);

  // Cash change calculator
  let cashTendered = $state(0);
  let showChangeModal = $state(false);
  let changeTotal = $state(0);

  // Discount state
  let showDiscountInput = $state(false);
  let discountMode = $state<'fixed' | 'percent'>('fixed');
  let discountValue = $state(0);

  // Receipt state
  let showReceipt = $state(false);
  let receiptData = $state<ReceiptData | null>(null);

  // Printer receipt state
  let printerReceiptData = $state<PrinterReceiptData | null>(null);

  // Pending payment recovery (Task 7)
  let pendingPayment = $state<{ orderId: string; snapToken: string; transactionId: string; total: number } | null>(null);

  let searchTimeout: ReturnType<typeof setTimeout>;

  onMount(async () => {
    const currentStaff = getCurrentStaff();
    if (currentStaff) {
      try {
        const { getSupabase } = await import('$lib/supabase/client');
        const supabase = getSupabase();
        const { data } = await supabase.from('outlet').select('name, address, phone, tax_rate').eq('id', currentStaff.outlet_id).single();
        if (data) {
          outletInfo = data;
          resetCart(data.tax_rate ?? 11);
        }
      } catch {}
    }
  });

  const paymentMethods: { value: PaymentMethod; label: string; icon: string; digitalOnly: boolean }[] = [
    { value: 'cash', label: 'payment.cash', icon: '\u{1F4B5}', digitalOnly: false },
    { value: 'qris', label: 'payment.qris', icon: '\u{1F4F1}', digitalOnly: true },
    { value: 'ewallet', label: 'payment.ewallet', icon: '\u{1F4F2}', digitalOnly: true },
    { value: 'bank_transfer', label: 'payment.bank_transfer', icon: '\u{1F3E6}', digitalOnly: true },
    { value: 'card', label: 'payment.card', icon: '\u{1F4B3}', digitalOnly: true },
  ];

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
      showToast(t('pos.not_in_inventory'), 'error');
      return;
    }
    if (inventory.type === 'read_in_store') {
      showToast(t('pos.read_only'), 'error');
      return;
    }
    if (inventory.stock <= 0) {
      showToast(t('inventory.out_of_stock'), 'error');
      return;
    }

    // Check if adding would exceed stock (considering existing cart quantity)
    const existingInCart = cart.items.find(i => i.inventory.id === inventory.id);
    const currentQty = existingInCart?.quantity ?? 0;
    if (currentQty + 1 > inventory.stock) {
      showToast(t('pos.max_stock', { count: String(inventory.stock) }), 'error');
      return;
    }

    setCart(addToCart(cart, inventory, book));
    searchQuery = '';
    searchResults = [];
    showToast(t('pos.item_added', { title: book.title }), 'success');
  }

  function handleRemove(inventoryId: string) {
    setCart(removeFromCart(cart, inventoryId));
  }

  function handleQuantityChange(inventoryId: string, qty: number) {
    // Validate against available stock
    const item = cart.items.find(i => i.inventory.id === inventoryId);
    if (item && qty > item.inventory.stock) {
      showToast(t('pos.max_stock', { count: String(item.inventory.stock) }), 'error');
      return;
    }
    setCart(updateQuantity(cart, inventoryId, qty));
  }

  function applyDiscount() {
    if (discountMode === 'percent') {
      const amount = Math.round(cart.subtotal * discountValue / 100);
      setCart(setCartDiscount(cart, amount));
    } else {
      setCart(setCartDiscount(cart, discountValue));
    }
  }

  function removeDiscount() {
    discountValue = 0;
    showDiscountInput = false;
    setCart(setCartDiscount(cart, 0));
  }

  async function handleCheckout() {
    if (!staff || cart.items.length === 0 || processing) return;

    // Check if digital payment is available
    if (selectedPayment !== 'cash' && !online) {
      showToast(t('payment.digital_disabled_offline'), 'error');
      return;
    }

    const confirmed = await showConfirm({
      title: `${t(`payment.${selectedPayment}`)} — Rp ${cart.total.toLocaleString('id-ID')}`,
      message: `${cart.items.length} item(s)`,
    });

    if (!confirmed) return;

    processing = true;
    try {
      const result = await checkout({
        cart,
        paymentMethod: selectedPayment,
        staffId: staff.id,
        outletId: staff.outlet_id,
      });

      // Refresh public availability after successful checkout
      try {
        const { refreshAvailability } = await import('$lib/modules/inventory/public-availability');
        refreshAvailability();
      } catch {}

      if (result.requiresPayment && result.transactionId) {
        // Digital payment — show Snap modal
        pendingTransactionId = result.transactionId;
        showPaymentModal = true;
      } else if (result.synced) {
        // Cash payment — show change calculator
        if (selectedPayment === 'cash') {
          changeTotal = cart.total;
          cashTendered = 0;
          pendingTransactionId = result.transactionId;
          showChangeModal = true;
        } else {
          showToast(t('pos.checkout_success'), 'success');
          prepareReceipt(result.transactionId, result.offlineId);
        }
      } else {
        // Offline queued
        showToast(t('pos.checkout_offline'), 'info');
        resetCart();
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Checkout failed', 'error');
    } finally {
      processing = false;
    }
  }

  function handlePaymentSuccess(result: Record<string, string>) {
    showPaymentModal = false;
    showToast(t('payment.success'), 'success');
    prepareReceipt(pendingTransactionId, null);
  }

  function handlePaymentPending() {
    showPaymentModal = false;
    showToast(t('payment.pending'), 'info');
    prepareReceipt(pendingTransactionId, null);
  }

  function handlePaymentClose() {
    showPaymentModal = false;

    // Save pending payment info for recovery
    const activePayment = getActivePayment();
    if (activePayment && activePayment.snapToken && pendingTransactionId) {
      pendingPayment = {
        orderId: activePayment.orderId,
        snapToken: activePayment.snapToken,
        transactionId: pendingTransactionId,
        total: cart.total,
      };
      clearActivePayment();
    }

    pendingTransactionId = null;
    showToast(t('payment.cancelled'), 'info');
  }

  async function retryPayment() {
    if (!pendingPayment) return;

    const token = pendingPayment.snapToken;
    const txId = pendingPayment.transactionId;

    const result = await openSnapPayment(token);
    if (result.success) {
      pendingPayment = null;
      showToast(t('payment.success'), 'success');
      prepareReceipt(txId, null);
    } else if (result.pending) {
      pendingPayment = null;
      showToast(t('payment.pending'), 'info');
      prepareReceipt(txId, null);
    } else {
      // Still closed/failed — keep the banner
      showToast(t('payment.cancelled'), 'info');
    }
  }

  async function cancelPendingPayment() {
    if (!pendingPayment) return;

    // Void the pending transaction
    try {
      const { getSupabase } = await import('$lib/supabase/client');
      const supabase = getSupabase();
      await supabase
        .from('transaction')
        .update({ payment_status: 'failed', type: 'void' })
        .eq('id', pendingPayment.transactionId);
    } catch {
      // Best effort — transaction will expire naturally
    }

    pendingPayment = null;
    pendingTransactionId = null;
    showToast(t('payment.cancelled'), 'info');
  }

  function prepareReceipt(transactionId: string | null, offlineId: string | null) {
    if (!staff || !transactionId) {
      showToast(t('pos.receipt_after_sync'), 'info');
      resetCart();
      return;
    }

    const now = new Date();
    receiptData = {
      transactionId,
      orderId: offlineId ?? transactionId.slice(0, 8),
      date: now.toLocaleDateString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }),
      items: cart.items.map(item => ({
        title: item.book.title,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.total,
      })),
      subtotal: cart.subtotal,
      tax: cart.tax,
      discount: cart.discount,
      total: cart.total,
      paymentMethod: selectedPayment,
      paymentReference: null,
      cafeName: outletInfo.name,
      cafeAddress: outletInfo.address,
      staffName: staff.name,
    };

    // Build printer receipt and attempt auto-print
    printerReceiptData = buildReceiptFromTransaction(
      transactionId,
      cart,
      { name: outletInfo.name, address: outletInfo.address, phone: outletInfo.phone },
      staff.name,
      selectedPayment
    );
    tryPrintReceipt(printerReceiptData);

    showReceipt = true;
  }

  function handleChangeDone() {
    showChangeModal = false;
    showToast(t('pos.checkout_success'), 'success');
    prepareReceipt(pendingTransactionId, null);
  }

  function setCashTendered(amount: number) {
    cashTendered = amount;
  }

  function handleReceiptDone() {
    showReceipt = false;
    receiptData = null;
    printerReceiptData = null;
    pendingTransactionId = null;
    resetCart();
  }

  function formatPrice(amount: number): string {
    return `Rp ${amount.toLocaleString('id-ID')}`;
  }
</script>

<div class="space-y-4">
  <!-- Pending Payment Recovery Banner -->
  {#if pendingPayment}
    <div class="bg-gold/10 border border-gold/30 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
      <div>
        <p class="text-sm font-medium text-ink">{t('payment.pending_banner')}</p>
        <p class="text-xs text-ink-muted">Order #{pendingPayment.orderId} — {formatPrice(pendingPayment.total)}</p>
      </div>
      <div class="flex gap-2">
        <button class="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-cream" onclick={retryPayment}>
          {t('payment.retry')}
        </button>
        <button class="px-3 py-1.5 rounded-lg text-xs font-medium text-berry" onclick={cancelPendingPayment}>
          {t('payment.cancel_pending')}
        </button>
      </div>
    </div>
  {/if}

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

      <!-- Discount -->
      <div class="px-4 py-3 border-t border-warm-100">
        {#if !showDiscountInput && cart.discount === 0}
          <button
            class="text-sm text-accent font-medium"
            onclick={() => showDiscountInput = true}
          >{t('pos.add_discount')}</button>
        {:else if showDiscountInput}
          <div class="space-y-2">
            <div class="flex gap-2">
              <button
                class="px-3 py-1.5 rounded-lg text-xs font-medium {discountMode === 'fixed' ? 'bg-accent text-cream' : 'bg-warm-50 text-ink-muted'}"
                onclick={() => discountMode = 'fixed'}
              >Rp</button>
              <button
                class="px-3 py-1.5 rounded-lg text-xs font-medium {discountMode === 'percent' ? 'bg-accent text-cream' : 'bg-warm-50 text-ink-muted'}"
                onclick={() => discountMode = 'percent'}
              >%</button>
            </div>
            <div class="flex gap-2 items-center">
              <input
                type="number"
                min="0"
                bind:value={discountValue}
                placeholder={discountMode === 'percent' ? t('pos.discount_percent') : t('pos.discount_amount')}
                class="flex-1 px-3 py-2 rounded-lg bg-warm-50 border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                oninput={applyDiscount}
              />
              <button
                class="text-xs text-berry/60 hover:text-berry"
                onclick={removeDiscount}
              >{t('pos.remove_discount')}</button>
            </div>
          </div>
        {:else}
          <div class="flex justify-between items-center text-sm">
            <span class="text-ink-muted">{t('pos.discount')}</span>
            <div class="flex items-center gap-2">
              <span class="text-berry font-medium">-{formatPrice(cart.discount)}</span>
              <button
                class="text-xs text-berry/60 hover:text-berry"
                onclick={removeDiscount}
              >{t('pos.remove_discount')}</button>
            </div>
          </div>
        {/if}
      </div>

      <!-- Totals -->
      <div class="px-4 py-3 border-t border-warm-100 space-y-1">
        <div class="flex justify-between text-sm text-ink-muted">
          <span>{t('pos.subtotal')}</span>
          <span>{formatPrice(cart.subtotal)}</span>
        </div>
        {#if cart.discount > 0}
          <div class="flex justify-between text-sm text-berry">
            <span>{t('pos.discount')}</span>
            <span>-{formatPrice(cart.discount)}</span>
          </div>
        {/if}
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

      <!-- Payment Method Selection -->
      <div class="px-4 py-3 border-t border-warm-100">
        <p class="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">{t('payment.select_method')}</p>
        <div class="grid grid-cols-3 gap-2">
          {#each paymentMethods as method}
            <button
              class="py-2 px-2 rounded-xl text-xs font-medium transition-all {selectedPayment === method.value ? 'bg-accent text-cream shadow-sm' : 'bg-warm-50 text-ink-muted'} {method.digitalOnly && !online ? 'opacity-40 cursor-not-allowed' : ''}"
              onclick={() => { if (!method.digitalOnly || online) selectedPayment = method.value; }}
              disabled={method.digitalOnly && !online}
            >
              <span class="block text-base mb-0.5">{method.icon}</span>
              {t(method.label)}
            </button>
          {/each}
        </div>
        {#if !online}
          <p class="text-[11px] text-gold mt-1.5">{t('payment.digital_disabled_offline')}</p>
        {/if}
      </div>

      <!-- Checkout Button -->
      <div class="px-4 py-3 border-t border-warm-100">
        <button
          class="w-full py-3 rounded-xl bg-accent text-cream font-semibold text-sm hover:bg-accent/90 transition-colors disabled:opacity-50"
          onclick={handleCheckout}
          disabled={processing}
        >
          {processing ? '...' : `${t(`payment.${selectedPayment}`)} — ${formatPrice(cart.total)}`}
        </button>
      </div>
    {/if}
  </div>

  <!-- Receipt Sender (after checkout) -->
  {#if showReceipt && receiptData}
    <ReceiptSender
      {receiptData}
      onDone={handleReceiptDone}
    />

    <!-- Print Receipt button (appears after checkout if printer is connected) -->
    {#if printerReceiptData}
      <PrintButton receiptData={printerReceiptData} />
    {/if}
  {/if}
</div>

<!-- Cash Change Calculator Modal -->
{#if showChangeModal}
  <div class="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center p-4">
    <div class="bg-surface rounded-2xl border border-warm-100 w-full max-w-sm p-5 space-y-4">
      <h2 class="font-display text-lg font-bold text-ink text-center">{t('pos.cash_tendered')}</h2>

      <!-- Total -->
      <div class="text-center">
        <p class="text-xs text-ink-muted uppercase">{t('pos.total')}</p>
        <p class="text-xl font-bold text-ink">{formatPrice(changeTotal)}</p>
      </div>

      <!-- Cash tendered input -->
      <div>
        <input
          type="number"
          bind:value={cashTendered}
          placeholder="0"
          class="w-full px-4 py-3 rounded-xl bg-cream border border-warm-100 text-center text-2xl font-bold text-ink focus:outline-none focus:ring-2 focus:ring-accent/30"
          autofocus
          min="0"
        />
      </div>

      <!-- Quick amount buttons -->
      <div class="grid grid-cols-4 gap-2">
        {#each [50000, 100000, 200000, 500000] as amount}
          <button
            class="py-2 rounded-lg bg-warm-50 text-ink text-xs font-medium hover:bg-warm-100 transition-colors"
            onclick={() => setCashTendered(amount)}
          >
            {amount >= 1000 ? `${(amount / 1000)}k` : amount}
          </button>
        {/each}
      </div>

      <!-- Calculated change -->
      {#if cashTendered >= changeTotal}
        <div class="text-center py-3 rounded-xl bg-sage/10">
          <p class="text-xs text-ink-muted uppercase">{t('pos.change')}</p>
          <p class="text-3xl font-bold text-sage">{formatPrice(cashTendered - changeTotal)}</p>
        </div>
      {:else if cashTendered > 0}
        <div class="text-center py-3 rounded-xl bg-berry/10">
          <p class="text-xs text-ink-muted uppercase">{t('pos.change')}</p>
          <p class="text-xl font-bold text-berry">-{formatPrice(changeTotal - cashTendered)}</p>
        </div>
      {/if}

      <!-- Done button -->
      <button
        class="w-full py-3 rounded-xl bg-accent text-cream font-semibold text-sm hover:bg-accent/90 transition-colors"
        onclick={handleChangeDone}
      >
        {t('pos.done')}
      </button>
    </div>
  </div>
{/if}

<!-- Payment Modal (digital payments) -->
{#if showPaymentModal && pendingTransactionId}
  <PaymentModal
    transactionId={pendingTransactionId}
    {cart}
    onSuccess={handlePaymentSuccess}
    onPending={handlePaymentPending}
    onClose={handlePaymentClose}
  />
{/if}
