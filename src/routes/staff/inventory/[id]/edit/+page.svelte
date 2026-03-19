<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import { updateInventoryItem } from '$lib/modules/inventory/service';
  import { getSupabase } from '$lib/supabase/client';
  import { getBookById } from '$lib/services/books';
  import type { Inventory, InventoryType, BookSource, BookCondition } from '$lib/modules/inventory/types';
  import type { Book } from '$lib/db';

  let item = $state<Inventory | null>(null);
  let book = $state<Book | null>(null);
  let loading = $state(true);
  let saving = $state(false);
  let error = $state('');

  // Form fields
  let price = $state<number | null>(null);
  let costPrice = $state<number | null>(null);
  let type = $state<InventoryType>('for_sale');
  let source = $state<BookSource>('supplier');
  let condition = $state<BookCondition>('new');
  let isPreloved = $state(false);
  let location = $state('');
  let minStock = $state(0);

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

        // Populate form
        price = item.price;
        costPrice = item.cost_price;
        type = item.type;
        source = item.source;
        condition = item.condition;
        isPreloved = item.is_preloved;
        location = item.location ?? '';
        minStock = item.min_stock;
      }
    } finally {
      loading = false;
    }
  });

  async function handleSave() {
    if (!item || saving) return;

    saving = true;
    try {
      await updateInventoryItem(item.id, {
        price,
        cost_price: costPrice,
        type,
        source,
        condition,
        is_preloved: isPreloved,
        location: location || null,
        min_stock: minStock,
      });

      showToast(t('inventory.saved'), 'success');
      goto(`${base}/staff/inventory/${item.id}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed', 'error');
    } finally {
      saving = false;
    }
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
    <button class="text-sm text-ink-muted hover:text-accent" onclick={() => goto(`${base}/staff/inventory/${item.id}`)}>
      &larr; Back
    </button>

    <!-- Book Info -->
    <div class="bg-surface rounded-xl border border-warm-100 p-4">
      <h1 class="font-display text-lg font-bold text-ink">{book?.title ?? 'Unknown Book'}</h1>
      <p class="text-sm text-ink-muted">{book?.authors?.join(', ') ?? ''}</p>
    </div>

    <!-- Edit Form -->
    <div class="bg-surface rounded-xl border border-warm-100 p-4 space-y-4">
      <h2 class="text-sm font-semibold text-ink uppercase tracking-wide">{t('inventory.edit')}</h2>

      <div class="grid grid-cols-2 gap-3">
        <!-- Price -->
        <div>
          <label class="block text-xs text-ink-muted mb-1">{t('inventory.price')}</label>
          <input type="number" bind:value={price} min="0"
            class="w-full px-3 py-2 rounded-lg bg-cream border border-warm-100 text-sm" />
        </div>

        <!-- Cost Price -->
        <div>
          <label class="block text-xs text-ink-muted mb-1">{t('inventory.cost_price')}</label>
          <input type="number" bind:value={costPrice} min="0"
            class="w-full px-3 py-2 rounded-lg bg-cream border border-warm-100 text-sm" />
        </div>

        <!-- Type -->
        <div>
          <label class="block text-xs text-ink-muted mb-1">{t('inventory.type')}</label>
          <select bind:value={type}
            class="w-full px-3 py-2 rounded-lg bg-cream border border-warm-100 text-sm">
            <option value="for_sale">{t('inventory.type_sale')}</option>
            <option value="read_in_store">{t('inventory.type_read')}</option>
            <option value="both">{t('inventory.type_both')}</option>
          </select>
        </div>

        <!-- Source -->
        <div>
          <label class="block text-xs text-ink-muted mb-1">{t('inventory.source')}</label>
          <select bind:value={source}
            class="w-full px-3 py-2 rounded-lg bg-cream border border-warm-100 text-sm">
            <option value="supplier">{t('inventory.source_supplier')}</option>
            <option value="owner">{t('inventory.source_owner')}</option>
            <option value="consignment">{t('inventory.source_consignment')}</option>
            <option value="buyback">{t('inventory.source_buyback')}</option>
          </select>
        </div>

        <!-- Condition -->
        <div>
          <label class="block text-xs text-ink-muted mb-1">{t('inventory.condition')}</label>
          <select bind:value={condition}
            class="w-full px-3 py-2 rounded-lg bg-cream border border-warm-100 text-sm">
            <option value="new">{t('inventory.condition_new')}</option>
            <option value="good">{t('inventory.condition_good')}</option>
            <option value="fair">{t('inventory.condition_fair')}</option>
          </select>
        </div>

        <!-- Min Stock -->
        <div>
          <label class="block text-xs text-ink-muted mb-1">{t('inventory.min_stock')}</label>
          <input type="number" bind:value={minStock} min="0"
            class="w-full px-3 py-2 rounded-lg bg-cream border border-warm-100 text-sm" />
        </div>
      </div>

      <!-- Location (full width) -->
      <div>
        <label class="block text-xs text-ink-muted mb-1">{t('inventory.location')}</label>
        <input type="text" bind:value={location} placeholder="e.g. Shelf A3"
          class="w-full px-3 py-2 rounded-lg bg-cream border border-warm-100 text-sm" />
      </div>

      <!-- Preloved toggle -->
      <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" bind:checked={isPreloved}
          class="w-4 h-4 rounded border-warm-100 text-accent focus:ring-accent/30" />
        <span class="text-ink">{t('inventory.preloved')}</span>
      </label>

      <!-- Save Button -->
      <button
        class="w-full py-3 rounded-xl bg-accent text-cream font-semibold text-sm hover:bg-accent/90 transition-colors disabled:opacity-50"
        onclick={handleSave}
        disabled={saving}
      >
        {saving ? '...' : t('inventory.save')}
      </button>
    </div>
  </div>
{/if}
