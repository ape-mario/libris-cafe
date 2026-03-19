<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
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
    type: string;
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
  let error = $state('');
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
      error = err instanceof Error ? err.message : 'Failed to load transactions';
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

  function navigateToDetail(id: string) {
    goto(`${base}/staff/transactions/${id}`);
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
  {:else if error}
    <div class="py-8 text-center text-sm text-berry">{error}</div>
  {:else if transactions.length === 0}
    <div class="py-8 text-center text-sm text-ink-muted">No transactions for this date</div>
  {:else}
    <div class="space-y-2">
      {#each transactions as tx (tx.id)}
        <button
          class="w-full text-left bg-surface rounded-xl border border-warm-100 px-4 py-3 hover:border-accent/30 transition-colors"
          onclick={() => navigateToDetail(tx.id)}
        >
          <div class="flex items-center gap-3">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-ink">{formatTime(tx.created_at)}</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded-full font-medium {tx.payment_status === 'paid' ? 'bg-sage/10 text-sage' : tx.payment_status === 'refunded' ? 'bg-berry/10 text-berry' : 'bg-gold/10 text-gold'}">
                  {tx.payment_status}
                </span>
                {#if tx.type === 'void'}
                  <span class="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-berry/10 text-berry uppercase">
                    {t('pos.voided')}
                  </span>
                {/if}
              </div>
              <p class="text-xs text-ink-muted">
                {totalItems(tx)} item{totalItems(tx) !== 1 ? 's' : ''} · {paymentLabel(tx.payment_method)}
                {#if tx.customer_name} · {tx.customer_name}{/if}
              </p>
            </div>
            <div class="text-right flex items-center gap-2">
              <p class="text-sm font-semibold {tx.type === 'void' ? 'text-ink-muted line-through' : 'text-ink'}">{formatPrice(tx.total)}</p>
              <span class="text-ink-muted text-xs">&#8250;</span>
            </div>
          </div>

        </button>
      {/each}
    </div>
  {/if}
</div>
