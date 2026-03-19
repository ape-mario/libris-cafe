<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import { showPrompt, showConfirm } from '$lib/stores/dialog.svelte';
  import { getCurrentStaff } from '$lib/modules/auth/stores.svelte';
  import { updateInventoryItem, adjustStock, getStockMovements } from '$lib/modules/inventory/service';
  import { getBookById } from '$lib/services/books';
  import { getSupabase } from '$lib/supabase/client';
  import type { Inventory } from '$lib/modules/inventory/types';
  import type { Book } from '$lib/db';

  let item = $state<Inventory | null>(null);
  let book = $state<Book | null>(null);
  let movements = $state<any[]>([]);
  let loading = $state(true);
  let error = $state('');
  let staff = $derived(getCurrentStaff());

  const inventoryId = page.params.id;

  onMount(async () => {
    try {
      const supabase = getSupabase();
      const { data, error: queryError } = await supabase
        .from('inventory')
        .select()
        .eq('id', inventoryId)
        .single();

      if (queryError) {
        error = queryError.message;
      } else if (data) {
        item = data as Inventory;
        book = getBookById(item.book_id) ?? null;
        movements = await getStockMovements(inventoryId);
      }
    } finally {
      loading = false;
    }
  });

  async function handleAdjustStock() {
    if (!item || !staff) return;

    const input = await showPrompt({
      title: t('inventory.adjust_stock'),
      message: t('inventory.adjust_prompt'),
      placeholder: t('inventory.adjust_placeholder'),
    });

    if (!input) return;

    const qty = parseInt(input, 10);
    if (isNaN(qty) || qty === 0) {
      showToast(t('inventory.invalid_qty'), 'error');
      return;
    }

    try {
      await adjustStock(
        item.id,
        qty,
        'adjustment',
        staff.id,
        `Manual adjustment: ${qty > 0 ? '+' : ''}${qty}`
      );

      // Refresh
      item = { ...item, stock: item.stock + qty };
      movements = await getStockMovements(inventoryId);
      showToast(t('inventory.adjusted'), 'success');
    } catch (err) {
      showToast(t('inventory.adjust_failed'), 'error');
    }
  }

  function formatPrice(amount: number | null): string {
    if (amount === null) return '-';
    return `Rp ${amount.toLocaleString('id-ID')}`;
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }
</script>

{#if loading}
  <div class="py-8 text-center text-sm text-ink-muted">{t('common.loading')}</div>
{:else if error}
  <div class="py-8 text-center text-sm text-berry">{error}</div>
{:else if !item}
  <div class="py-8 text-center text-sm text-ink-muted">Item not found</div>
{:else}
  <div class="space-y-4">
    <button class="text-sm text-ink-muted hover:text-accent" onclick={() => goto(`${base}/staff/inventory`)}>
      &larr; Back
    </button>

    <!-- Book Info -->
    <div class="bg-surface rounded-xl border border-warm-100 p-4">
      <h1 class="font-display text-lg font-bold text-ink">{book?.title ?? 'Unknown Book'}</h1>
      <p class="text-sm text-ink-muted">{book?.authors?.join(', ') ?? ''}</p>
      {#if book?.isbn}
        <p class="text-xs text-ink-muted mt-1">ISBN: {book.isbn}</p>
      {/if}
    </div>

    <!-- Inventory Details -->
    <div class="bg-surface rounded-xl border border-warm-100 p-4 space-y-3">
      <div class="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span class="text-xs text-ink-muted uppercase">{t('inventory.price')}</span>
          <p class="font-semibold text-ink">{formatPrice(item.price)}</p>
        </div>
        <div>
          <span class="text-xs text-ink-muted uppercase">{t('inventory.cost_price')}</span>
          <p class="font-semibold text-ink">{formatPrice(item.cost_price)}</p>
        </div>
        <div>
          <span class="text-xs text-ink-muted uppercase">{t('inventory.stock')}</span>
          <p class="font-semibold text-ink">{item.stock}</p>
        </div>
        <div>
          <span class="text-xs text-ink-muted uppercase">{t('inventory.location')}</span>
          <p class="font-semibold text-ink">{item.location ?? '-'}</p>
        </div>
        <div>
          <span class="text-xs text-ink-muted uppercase">{t('inventory.type')}</span>
          <p class="font-semibold text-ink">
            {item.type === 'for_sale' ? t('inventory.type_sale')
              : item.type === 'read_in_store' ? t('inventory.type_read')
              : t('inventory.type_both')}
          </p>
        </div>
        <div>
          <span class="text-xs text-ink-muted uppercase">{t('inventory.condition')}</span>
          <p class="font-semibold text-ink">
            {item.condition === 'new' ? t('inventory.condition_new')
              : item.condition === 'good' ? t('inventory.condition_good')
              : t('inventory.condition_fair')}
            {item.is_preloved ? ` · ${t('inventory.preloved')}` : ''}
          </p>
        </div>
      </div>

      <button
        class="w-full py-2.5 rounded-xl bg-accent/10 text-accent font-medium text-sm hover:bg-accent/20 transition-colors"
        onclick={handleAdjustStock}
      >
        {t('inventory.adjust_stock')}
      </button>
    </div>

    <!-- Stock Movement History -->
    <div class="bg-surface rounded-xl border border-warm-100">
      <div class="px-4 py-3 border-b border-warm-50">
        <h2 class="text-sm font-semibold text-ink uppercase tracking-wide">{t('inventory.movement_history')}</h2>
      </div>
      {#if movements.length === 0}
        <div class="px-4 py-6 text-center text-sm text-ink-muted">{t('inventory.no_movements')}</div>
      {:else}
        <div class="divide-y divide-warm-50 max-h-80 overflow-y-auto">
          {#each movements as m}
            <div class="px-4 py-2.5 flex items-center justify-between">
              <div>
                <p class="text-xs font-medium text-ink">{m.type.replace(/_/g, ' ')}</p>
                {#if m.reason}
                  <p class="text-[11px] text-ink-muted">{m.reason}</p>
                {/if}
              </div>
              <div class="text-right">
                <p class="text-sm font-semibold {m.quantity > 0 ? 'text-sage' : 'text-berry'}">
                  {m.quantity > 0 ? '+' : ''}{m.quantity}
                </p>
                <p class="text-[10px] text-ink-muted">{formatDate(m.created_at)}</p>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}
