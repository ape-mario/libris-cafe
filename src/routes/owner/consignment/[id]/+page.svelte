<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import { showConfirm } from '$lib/stores/dialog.svelte';
  import { getCurrentStaff } from '$lib/modules/auth/stores.svelte';
  import {
    getConsignorById, getSettlements, createSettlement,
    confirmSettlement, markSettlementPaid,
  } from '$lib/modules/consignment/service';
  import { getConsignmentSales, calculateSettlementTotals } from '$lib/modules/consignment/ledger';
  import { getSupabase } from '$lib/supabase/client';
  import { getBookById } from '$lib/services/books';
  import type { Consignor, ConsignmentSettlement, ConsignmentSaleRecord } from '$lib/modules/consignment/types';
  import type { Inventory } from '$lib/modules/inventory/types';
  import type { Book } from '$lib/db';

  let consignor = $state<Consignor | null>(null);
  let settlements = $state<ConsignmentSettlement[]>([]);
  let consignorInventory = $state<(Inventory & { book?: Book | null })[]>([]);
  let loading = $state(true);
  let creating = $state(false);

  // Settlement creation form
  let showCreateForm = $state(false);
  let periodStart = $state('');
  let periodEnd = $state('');
  let salesPreview = $state<ConsignmentSaleRecord[]>([]);
  let loadingSales = $state(false);

  const consignorId = page.params.id;
  let staff = $derived(getCurrentStaff());

  onMount(async () => {
    try {
      consignor = await getConsignorById(consignorId);
      settlements = await getSettlements(consignorId);

      // Fetch inventory items for this consignor
      const supabase = getSupabase();
      const { data: invData } = await supabase
        .from('inventory')
        .select()
        .eq('consignor_id', consignorId)
        .order('created_at', { ascending: false });

      if (invData) {
        consignorInventory = (invData as Inventory[]).map(inv => ({
          ...inv,
          book: getBookById(inv.book_id) ?? null,
        }));
      }
    } finally {
      loading = false;
    }
  });

  async function previewSales() {
    if (!periodStart || !periodEnd) return;
    loadingSales = true;
    try {
      salesPreview = await getConsignmentSales(consignorId, periodStart, periodEnd);
    } catch (err) {
      showToast(t('consignment.sales_load_failed'), 'error');
    } finally {
      loadingSales = false;
    }
  }

  async function handleCreateSettlement() {
    if (!consignor || !staff || creating) return;
    if (salesPreview.length === 0) {
      showToast(t('consignment.no_sales_period'), 'error');
      return;
    }

    creating = true;
    try {
      const totals = calculateSettlementTotals(salesPreview);
      await createSettlement({
        consignorId: consignor.id,
        periodStart,
        periodEnd,
        totalSales: totals.totalSales,
        commission: totals.totalCommission,
        payout: totals.totalPayout,
        staffId: staff.id,
      });

      showToast(t('consignment.settlement_created'), 'success');
      settlements = await getSettlements(consignorId);
      showCreateForm = false;
      salesPreview = [];
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('consignment.create_failed'), 'error');
    } finally {
      creating = false;
    }
  }

  async function handleConfirm(settlementId: string) {
    const confirmed = await showConfirm({
      title: t('consignment.confirm'),
      message: t('consignment.confirm_message'),
    });
    if (!confirmed) return;

    try {
      await confirmSettlement(settlementId);
      settlements = settlements.map(s => s.id === settlementId ? { ...s, status: 'confirmed' as const } : s);
      showToast(t('consignment.settlement_confirmed'), 'success');
    } catch (err) {
      showToast(t('consignment.confirm_failed'), 'error');
    }
  }

  async function handleMarkPaid(settlementId: string) {
    const confirmed = await showConfirm({
      title: t('consignment.mark_paid'),
      message: t('consignment.mark_paid_confirm'),
    });
    if (!confirmed) return;

    try {
      await markSettlementPaid(settlementId);
      settlements = settlements.map(s =>
        s.id === settlementId ? { ...s, status: 'paid' as const, paid_at: new Date().toISOString() } : s
      );
      showToast(t('consignment.settlement_paid'), 'success');
    } catch (err) {
      showToast(t('consignment.pay_failed'), 'error');
    }
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatPrice(amount: number): string {
    return `Rp ${amount.toLocaleString('id-ID')}`;
  }

  function statusClass(status: string): string {
    switch (status) {
      case 'draft': return 'bg-warm-100 text-ink-muted';
      case 'confirmed': return 'bg-accent/10 text-accent';
      case 'paid': return 'bg-sage/10 text-sage';
      default: return 'bg-warm-100 text-ink-muted';
    }
  }
</script>

{#if loading}
  <div class="py-8 text-center text-sm text-ink-muted">{t('common.loading')}</div>
{:else if !consignor}
  <div class="py-8 text-center text-sm text-ink-muted">{t('consignment.not_found')}</div>
{:else}
  <div class="space-y-4">
    <button class="text-sm text-ink-muted hover:text-accent" onclick={() => goto(`${base}/owner/consignment`)}>
      &larr; {t('consignment.title')}
    </button>

    <!-- Consignor Info -->
    <div class="bg-surface rounded-xl border border-warm-100 p-4">
      <h1 class="font-display text-lg font-bold text-ink">{consignor.name}</h1>
      <div class="grid grid-cols-2 gap-3 mt-3 text-sm">
        <div>
          <span class="text-xs text-ink-muted uppercase">{t('consignment.phone')}</span>
          <p class="font-medium text-ink">{consignor.phone ?? '-'}</p>
        </div>
        <div>
          <span class="text-xs text-ink-muted uppercase">{t('consignment.commission_rate')}</span>
          <p class="font-medium text-ink">{consignor.commission_rate}%</p>
        </div>
        <div>
          <span class="text-xs text-ink-muted uppercase">{t('consignment.bank_name')}</span>
          <p class="font-medium text-ink">{consignor.bank_name ?? '-'}</p>
        </div>
        <div>
          <span class="text-xs text-ink-muted uppercase">{t('consignment.bank_account')}</span>
          <p class="font-medium text-ink">{consignor.bank_account ?? '-'}</p>
        </div>
      </div>
    </div>

    <!-- Create Settlement -->
    <button
      class="w-full py-2.5 rounded-xl bg-accent/10 text-accent font-medium text-sm hover:bg-accent/20 transition-colors"
      onclick={() => showCreateForm = !showCreateForm}
    >
      {t('consignment.create_settlement')}
    </button>

    {#if showCreateForm}
      <div class="bg-surface rounded-xl border border-warm-100 p-4 space-y-3">
        <h3 class="text-sm font-semibold text-ink">{t('consignment.create_settlement')}</h3>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-ink-muted mb-1">{t('consignment.start_date')}</label>
            <input type="date" bind:value={periodStart}
              class="w-full px-3 py-2 rounded-lg bg-cream border border-warm-100 text-sm" />
          </div>
          <div>
            <label class="block text-xs text-ink-muted mb-1">{t('consignment.end_date')}</label>
            <input type="date" bind:value={periodEnd}
              class="w-full px-3 py-2 rounded-lg bg-cream border border-warm-100 text-sm" />
          </div>
        </div>

        <button onclick={previewSales} disabled={loadingSales || !periodStart || !periodEnd}
          class="w-full py-2 rounded-lg bg-warm-100 text-ink text-sm font-medium disabled:opacity-50">
          {loadingSales ? t('common.loading') : t('consignment.preview_sales')}
        </button>

        {#if salesPreview.length > 0}
          <div class="divide-y divide-warm-50 text-sm">
            {#each salesPreview as sale}
              <div class="py-2 flex justify-between">
                <span class="text-ink">{sale.book_title} x{sale.quantity}</span>
                <span class="font-medium">{formatPrice(sale.total)}</span>
              </div>
            {/each}
          </div>

          {@const totals = calculateSettlementTotals(salesPreview)}
          <div class="border-t border-warm-100 pt-2 space-y-1 text-sm">
            <div class="flex justify-between"><span>{t('consignment.total_sales')}</span><span class="font-semibold">{formatPrice(totals.totalSales)}</span></div>
            <div class="flex justify-between"><span>{t('consignment.commission')}</span><span>{formatPrice(totals.totalCommission)}</span></div>
            <div class="flex justify-between font-bold"><span>{t('consignment.payout')}</span><span>{formatPrice(totals.totalPayout)}</span></div>
          </div>

          <button onclick={handleCreateSettlement} disabled={creating}
            class="w-full py-2.5 rounded-xl bg-accent text-cream font-semibold text-sm disabled:opacity-50">
            {creating ? '...' : t('consignment.create_settlement')}
          </button>
        {:else if !loadingSales && periodStart && periodEnd}
          <p class="text-xs text-ink-muted text-center">{t('consignment.no_sales_period')}</p>
        {/if}
      </div>
    {/if}

    <!-- Settlement History -->
    <div class="bg-surface rounded-xl border border-warm-100">
      <div class="px-4 py-3 border-b border-warm-50">
        <h2 class="text-sm font-semibold text-ink uppercase tracking-wide">{t('consignment.settlements')}</h2>
      </div>

      {#if settlements.length === 0}
        <div class="px-4 py-6 text-center text-sm text-ink-muted">{t('consignment.no_settlements')}</div>
      {:else}
        <div class="divide-y divide-warm-50">
          {#each settlements as s}
            <div class="px-4 py-3">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-medium text-ink">{formatDate(s.period_start)} - {formatDate(s.period_end)}</p>
                  <span class="text-[10px] px-1.5 py-0.5 rounded-full font-medium {statusClass(s.status)}">
                    {t(`consignment.status_${s.status}`)}
                  </span>
                </div>
                <div class="text-right">
                  <p class="text-sm font-semibold text-ink">{formatPrice(s.payout)}</p>
                  <p class="text-xs text-ink-muted">{t('consignment.commission')}: {formatPrice(s.commission)}</p>
                </div>
              </div>

              {#if s.status === 'draft'}
                <button onclick={() => handleConfirm(s.id)}
                  class="mt-2 w-full py-2 rounded-lg bg-accent/10 text-accent text-xs font-medium">
                  {t('consignment.confirm')}
                </button>
              {:else if s.status === 'confirmed'}
                <button onclick={() => handleMarkPaid(s.id)}
                  class="mt-2 w-full py-2 rounded-lg bg-sage/10 text-sage text-xs font-medium">
                  {t('consignment.mark_paid')}
                </button>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Consignor Inventory -->
    <div class="bg-surface rounded-xl border border-warm-100">
      <div class="px-4 py-3 border-b border-warm-50">
        <h2 class="text-sm font-semibold text-ink uppercase tracking-wide">{t('inventory.title')}</h2>
      </div>

      {#if consignorInventory.length === 0}
        <div class="px-4 py-6 text-center text-sm text-ink-muted">{t('inventory.empty')}</div>
      {:else}
        <div class="divide-y divide-warm-50">
          {#each consignorInventory as inv}
            <div class="px-4 py-3 flex items-center justify-between">
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-ink truncate">{inv.book?.title ?? 'Unknown'}</p>
                <p class="text-xs text-ink-muted">
                  {inv.condition === 'new' ? t('inventory.condition_new')
                    : inv.condition === 'good' ? t('inventory.condition_good')
                    : t('inventory.condition_fair')}
                </p>
              </div>
              <div class="text-right">
                <p class="text-sm font-semibold text-ink">{formatPrice(inv.price ?? 0)}</p>
                <p class="text-xs text-ink-muted">{t('inventory.stock')}: {inv.stock}</p>
              </div>
            </div>
          {/each}
        </div>

        <!-- Totals -->
        <div class="px-4 py-3 border-t border-warm-100 flex justify-between text-sm">
          <span class="text-ink-muted">{consignorInventory.length} {t('common.books')}</span>
          <span class="font-semibold text-ink">{formatPrice(consignorInventory.reduce((sum, inv) => sum + (inv.price ?? 0) * inv.stock, 0))}</span>
        </div>
      {/if}
    </div>
  </div>
{/if}
