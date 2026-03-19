<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import { loadSnapJs, openSnapPayment, isSnapReady } from '$lib/modules/payment/snap';
  import { createSnapPayment, generateOrderId } from '$lib/modules/payment/service';
  import { setActivePayment, clearActivePayment } from '$lib/modules/payment/stores.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import type { Cart } from '$lib/modules/pos/types';

  interface Props {
    transactionId: string;
    cart: Cart;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    onSuccess: (result: Record<string, string>) => void;
    onPending: () => void;
    onClose: () => void;
  }

  let { transactionId, cart, customerName, customerEmail, customerPhone, onSuccess, onPending, onClose }: Props = $props();

  let status = $state<'loading' | 'ready' | 'paying' | 'error'>('loading');
  let errorMsg = $state('');

  async function initPayment() {
    status = 'loading';
    try {
      // Load Snap.js
      await loadSnapJs();

      // Create payment token via Edge Function
      const orderId = generateOrderId();
      const items = cart.items.map(item => ({
        id: item.inventory.id,
        name: item.book.title,
        price: item.unitPrice,
        quantity: item.quantity,
      }));

      const response = await createSnapPayment({
        transactionId,
        orderId,
        grossAmount: cart.total,
        customerName,
        customerEmail,
        customerPhone,
        items,
      });

      setActivePayment({
        orderId: response.orderId,
        transactionId,
        status: 'pending',
        snapToken: response.snapToken,
      });

      // Open Snap popup
      status = 'paying';
      const result = await openSnapPayment(response.snapToken);

      if (result.success) {
        clearActivePayment();
        onSuccess(result.result!);
      } else if (result.pending) {
        onPending();
      } else {
        clearActivePayment();
        if (result.error === 'Payment popup closed') {
          onClose();
        } else {
          errorMsg = result.error ?? 'Payment failed';
          status = 'error';
        }
      }
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Payment initialization failed';
      status = 'error';
      clearActivePayment();
    }
  }

  // Auto-start on mount
  $effect(() => {
    initPayment();
  });
</script>

<div class="fixed inset-0 bg-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
  <div class="bg-surface rounded-2xl w-full max-w-sm p-6 shadow-xl">
    {#if status === 'loading'}
      <div class="text-center space-y-4">
        <div class="w-12 h-12 mx-auto rounded-full bg-accent/10 flex items-center justify-center">
          <svg class="w-6 h-6 text-accent animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
        </div>
        <p class="text-sm text-ink-muted">{t('payment.processing')}</p>
      </div>
    {:else if status === 'paying'}
      <div class="text-center space-y-4">
        <div class="w-12 h-12 mx-auto rounded-full bg-gold/10 flex items-center justify-center">
          <svg class="w-6 h-6 text-gold" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
        </div>
        <p class="text-sm text-ink-muted">{t('payment.waiting')}</p>
        <p class="text-xs text-ink-muted">
          Rp {cart.total.toLocaleString('id-ID')}
        </p>
      </div>
    {:else if status === 'error'}
      <div class="text-center space-y-4">
        <div class="w-12 h-12 mx-auto rounded-full bg-berry/10 flex items-center justify-center">
          <svg class="w-6 h-6 text-berry" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        </div>
        <p class="text-sm font-medium text-berry">{t('payment.failed')}</p>
        <p class="text-xs text-ink-muted">{errorMsg}</p>
        <div class="flex gap-2">
          <button
            class="flex-1 py-2.5 rounded-xl bg-accent text-cream text-sm font-medium"
            onclick={initPayment}
          >
            {t('payment.retry')}
          </button>
          <button
            class="flex-1 py-2.5 rounded-xl bg-warm-100 text-ink-muted text-sm font-medium"
            onclick={onClose}
          >
            {t('receipt.skip')}
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>
