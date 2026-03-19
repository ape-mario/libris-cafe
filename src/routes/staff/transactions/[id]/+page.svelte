<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { t } from '$lib/i18n/index.svelte';
  import { getCurrentStaff, isOwner } from '$lib/modules/auth/stores.svelte';
  import { getSupabase } from '$lib/supabase/client';
  import { voidTransaction } from '$lib/modules/pos/void';
  import { showToast } from '$lib/stores/toast.svelte';

  interface TransactionItem {
    id: string;
    title: string;
    quantity: number;
    unit_price: number;
    discount: number;
    total: number;
    inventory_id: string;
  }

  interface Transaction {
    id: string;
    created_at: string;
    type: string;
    total: number;
    subtotal: number;
    discount: number;
    tax: number;
    payment_method: string;
    payment_status: string;
    staff_id: string;
    customer_name: string | null;
    customer_contact: string | null;
    notes: string | null;
    transaction_item: TransactionItem[];
  }

  let transaction = $state<Transaction | null>(null);
  let loading = $state(true);
  let showVoidDialog = $state(false);
  let voidReason = $state('');
  let voiding = $state(false);
  let staff = $derived(getCurrentStaff());
  let ownerRole = $derived(isOwner());

  const txId = $derived($page.params.id);

  onMount(() => {
    loadTransaction();
  });

  async function loadTransaction() {
    loading = true;
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('transaction')
        .select('*, transaction_item(*)')
        .eq('id', txId)
        .single();

      if (error) throw error;
      transaction = data as Transaction;
    } catch (err) {
      console.error('Failed to load transaction:', err);
    } finally {
      loading = false;
    }
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatPrice(amount: number): string {
    return `Rp ${amount.toLocaleString('id-ID')}`;
  }

  function paymentLabel(method: string): string {
    const labels: Record<string, string> = {
      cash: 'Cash',
      qris: 'QRIS',
      transfer: 'Transfer',
      card: 'Card',
    };
    return labels[method] ?? method;
  }

  function statusColor(status: string): string {
    switch (status) {
      case 'paid': return 'bg-sage/10 text-sage';
      case 'refunded': return 'bg-berry/10 text-berry';
      case 'pending': return 'bg-gold/10 text-gold';
      default: return 'bg-warm-100 text-ink-muted';
    }
  }

  async function handleVoid() {
    if (!staff || !transaction || !voidReason.trim()) return;
    voiding = true;
    try {
      await voidTransaction(transaction.id, staff.id, voidReason.trim());
      showToast(t('pos.void_success'), 'success');
      goto(`${base}/staff/transactions`);
    } catch (err) {
      console.error('Void failed:', err);
      showToast(err instanceof Error ? err.message : 'Void failed', 'error');
    } finally {
      voiding = false;
    }
  }

  const isVoided = $derived(transaction?.type === 'void' || transaction?.payment_status === 'refunded');
</script>

<div class="space-y-4">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <a
        href="{base}/staff/transactions"
        class="text-sm text-ink-muted hover:text-accent transition-colors"
      >
        {t('common.back')}
      </a>
      <h1 class="font-display text-xl font-bold text-ink">{t('dashboard.transactions')}</h1>
    </div>
  </div>

  {#if loading}
    <div class="py-8 text-center text-sm text-ink-muted">{t('common.loading')}</div>
  {:else if !transaction}
    <div class="py-8 text-center text-sm text-ink-muted">Transaction not found</div>
  {:else}
    <!-- Voided badge -->
    {#if isVoided}
      <div class="bg-berry/10 border border-berry/20 rounded-xl px-4 py-3">
        <div class="flex items-center gap-2">
          <span class="text-sm font-bold text-berry uppercase">{t('pos.voided')}</span>
        </div>
        {#if transaction.notes}
          <p class="text-xs text-berry/80 mt-1">{transaction.notes}</p>
        {/if}
      </div>
    {/if}

    <!-- Transaction details -->
    <div class="bg-surface rounded-xl border border-warm-100 px-4 py-4 space-y-3">
      <div class="flex items-center justify-between">
        <span class="text-xs text-ink-muted">ID</span>
        <span class="text-xs font-mono text-ink">{transaction.id.slice(0, 8)}...</span>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-xs text-ink-muted">Date</span>
        <span class="text-xs text-ink">{formatDate(transaction.created_at)}</span>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-xs text-ink-muted">Payment</span>
        <span class="text-xs text-ink">{paymentLabel(transaction.payment_method)}</span>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-xs text-ink-muted">Status</span>
        <span class="text-[10px] px-1.5 py-0.5 rounded-full font-medium {statusColor(transaction.payment_status)}">
          {transaction.payment_status}
        </span>
      </div>
      {#if transaction.customer_name}
        <div class="flex items-center justify-between">
          <span class="text-xs text-ink-muted">Customer</span>
          <span class="text-xs text-ink">{transaction.customer_name}</span>
        </div>
      {/if}
    </div>

    <!-- Items -->
    <div class="bg-surface rounded-xl border border-warm-100 px-4 py-4">
      <h3 class="text-sm font-semibold text-ink mb-3">Items</h3>
      <div class="space-y-2">
        {#each transaction.transaction_item as item}
          <div class="flex justify-between text-xs">
            <span class="text-ink-muted truncate flex-1 mr-2">{item.title} x{item.quantity}</span>
            <span class="text-ink font-medium">{formatPrice(item.total)}</span>
          </div>
        {/each}
      </div>

      <!-- Totals -->
      <div class="mt-3 pt-3 border-t border-warm-100 space-y-1.5">
        <div class="flex justify-between text-xs">
          <span class="text-ink-muted">{t('pos.subtotal')}</span>
          <span class="text-ink">{formatPrice(transaction.subtotal)}</span>
        </div>
        {#if transaction.discount > 0}
          <div class="flex justify-between text-xs">
            <span class="text-ink-muted">{t('pos.discount')}</span>
            <span class="text-berry">-{formatPrice(transaction.discount)}</span>
          </div>
        {/if}
        {#if transaction.tax > 0}
          <div class="flex justify-between text-xs">
            <span class="text-ink-muted">Tax</span>
            <span class="text-ink">{formatPrice(transaction.tax)}</span>
          </div>
        {/if}
        <div class="flex justify-between text-sm font-semibold">
          <span class="text-ink">{t('pos.total')}</span>
          <span class="text-ink">{formatPrice(transaction.total)}</span>
        </div>
      </div>
    </div>

    {#if transaction.notes && !isVoided}
      <div class="bg-surface rounded-xl border border-warm-100 px-4 py-3">
        <span class="text-xs text-ink-muted">{t('common.notes')}</span>
        <p class="text-sm text-ink mt-1">{transaction.notes}</p>
      </div>
    {/if}

    <!-- Void button (owner only, not already voided) -->
    {#if ownerRole && !isVoided}
      <button
        class="w-full py-3 rounded-xl bg-berry/10 text-berry font-semibold text-sm hover:bg-berry/20 transition-colors"
        onclick={() => (showVoidDialog = true)}
      >
        {t('pos.void')}
      </button>
    {/if}
  {/if}
</div>

<!-- Void confirmation dialog -->
{#if showVoidDialog}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <div class="bg-surface rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
      <h2 class="font-display text-lg font-bold text-ink">{t('pos.void_confirm')}</h2>
      <div>
        <label for="void-reason" class="block text-xs text-ink-muted mb-1">{t('pos.void_reason')}</label>
        <textarea
          id="void-reason"
          bind:value={voidReason}
          rows="3"
          placeholder={t('pos.void_reason_placeholder')}
          class="w-full px-3 py-2 rounded-lg border border-warm-200 bg-cream text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent resize-none"
        ></textarea>
      </div>
      <div class="flex gap-3">
        <button
          class="flex-1 py-2.5 rounded-xl border border-warm-200 text-sm text-ink-muted hover:bg-warm-50 transition-colors"
          onclick={() => { showVoidDialog = false; voidReason = ''; }}
        >
          {t('dialog.cancel')}
        </button>
        <button
          class="flex-1 py-2.5 rounded-xl bg-berry text-white text-sm font-semibold disabled:opacity-50 hover:bg-berry/90 transition-colors"
          disabled={!voidReason.trim() || voiding}
          onclick={handleVoid}
        >
          {#if voiding}
            {t('common.loading')}
          {:else}
            {t('pos.void')}
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}
