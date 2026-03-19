<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { getCurrentStaff } from '$lib/modules/auth/stores.svelte';
  import { getSupabase } from '$lib/supabase/client';

  interface TransactionItem {
    id: string;
    title: string;
    quantity: number;
    unit_price: number;
    total: number;
  }

  interface Transaction {
    id: string;
    created_at: string;
    total: number;
    subtotal: number;
    discount: number;
    tax: number;
    payment_method: string;
    payment_status: string;
    staff_id: string;
    staff_name?: string;
    customer_name: string | null;
    notes: string | null;
    transaction_item: TransactionItem[];
  }

  let transactions = $state<Transaction[]>([]);
  let loading = $state(true);
  let filterDate = $state(new Date().toISOString().slice(0, 10));
  let expandedId = $state<string | null>(null);
  let staff = $derived(getCurrentStaff());

  onMount(() => {
    loadTransactions();
  });

  async function loadTransactions() {
    if (!staff) return;
    loading = true;
    try {
      const supabase = getSupabase();
      const startOfDay = `${filterDate}T00:00:00`;
      const endOfDay = `${filterDate}T23:59:59`;

      const { data, error } = await supabase
        .from('transaction')
        .select('*, transaction_item(*)')
        .eq('outlet_id', staff.outlet_id)
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      transactions = (data ?? []) as Transaction[];
    } catch (err) {
      console.error('Failed to load transactions:', err);
    } finally {
      loading = false;
    }
  }

  function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  }

  function formatPrice(amount: number): string {
    return `Rp ${amount.toLocaleString('id-ID')}`;
  }

  function totalItems(tx: Transaction): number {
    return tx.transaction_item?.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
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

  function toggleExpand(id: string) {
    expandedId = expandedId === id ? null : id;
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h1 class="font-display text-xl font-bold text-ink">Transactions</h1>
    <a href="{base}/staff/dashboard" class="text-sm text-ink-muted hover:text-accent transition-colors">
      {t('nav.dashboard')}
    </a>
  </div>

  <!-- Date Filter -->
  <div class="flex items-center gap-3">
    <input
      type="date"
      bind:value={filterDate}
      onchange={loadTransactions}
      class="px-3 py-2 rounded-lg border border-warm-200 bg-cream text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
    />
    <span class="text-xs text-ink-muted">
      {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
    </span>
  </div>

  {#if loading}
    <div class="py-8 text-center text-sm text-ink-muted">{t('common.loading')}</div>
  {:else if transactions.length === 0}
    <div class="py-8 text-center text-sm text-ink-muted">No transactions for this date</div>
  {:else}
    <div class="space-y-2">
      {#each transactions as tx (tx.id)}
        <button
          class="w-full text-left bg-surface rounded-xl border border-warm-100 px-4 py-3 hover:border-accent/30 transition-colors"
          onclick={() => toggleExpand(tx.id)}
        >
          <div class="flex items-center gap-3">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-ink">{formatTime(tx.created_at)}</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded-full font-medium {tx.payment_status === 'paid' ? 'bg-sage/10 text-sage' : 'bg-gold/10 text-gold'}">
                  {tx.payment_status}
                </span>
              </div>
              <p class="text-xs text-ink-muted">
                {totalItems(tx)} item{totalItems(tx) !== 1 ? 's' : ''} · {paymentLabel(tx.payment_method)}
                {#if tx.customer_name} · {tx.customer_name}{/if}
              </p>
            </div>
            <div class="text-right">
              <p class="text-sm font-semibold text-ink">{formatPrice(tx.total)}</p>
            </div>
          </div>

          {#if expandedId === tx.id && tx.transaction_item?.length > 0}
            <div class="mt-3 pt-3 border-t border-warm-100 space-y-1.5">
              {#each tx.transaction_item as item}
                <div class="flex justify-between text-xs">
                  <span class="text-ink-muted truncate flex-1 mr-2">{item.title} x{item.quantity}</span>
                  <span class="text-ink font-medium">{formatPrice(item.total)}</span>
                </div>
              {/each}
              {#if tx.discount > 0}
                <div class="flex justify-between text-xs">
                  <span class="text-ink-muted">Discount</span>
                  <span class="text-berry">-{formatPrice(tx.discount)}</span>
                </div>
              {/if}
              {#if tx.tax > 0}
                <div class="flex justify-between text-xs">
                  <span class="text-ink-muted">Tax</span>
                  <span class="text-ink">{formatPrice(tx.tax)}</span>
                </div>
              {/if}
              {#if tx.notes}
                <p class="text-xs text-ink-muted italic mt-1">{tx.notes}</p>
              {/if}
            </div>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>
