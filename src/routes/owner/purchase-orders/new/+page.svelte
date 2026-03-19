<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { page } from '$app/state';
  import { t } from '$lib/i18n/index.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import { getCurrentStaff } from '$lib/modules/auth/stores.svelte';
  import { getSuppliers, createPurchaseOrder } from '$lib/modules/supplier/service';
  import type { Supplier, NewPurchaseOrderItem } from '$lib/modules/supplier/types';

  let suppliers = $state<Supplier[]>([]);
  let selectedSupplierId = $state(page.url.searchParams.get('supplier') ?? '');
  let notes = $state('');
  let saving = $state(false);

  let items = $state<Array<NewPurchaseOrderItem & { _key: string }>>([
    { _key: crypto.randomUUID(), title: '', quantity: 1, unit_price: 0, isbn: '' },
  ]);

  let staff = $derived(getCurrentStaff());

  onMount(async () => {
    suppliers = await getSuppliers();
  });

  function addItem() {
    items = [...items, { _key: crypto.randomUUID(), title: '', quantity: 1, unit_price: 0, isbn: '' }];
  }

  function removeItem(key: string) {
    items = items.filter(i => i._key !== key);
  }

  let poTotal = $derived(
    items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0)
  );

  async function handleSubmit() {
    if (!staff || !selectedSupplierId || saving) return;
    if (items.length === 0 || items.some(i => !i.title.trim())) {
      showToast(t('po.fill_titles'), 'error');
      return;
    }

    saving = true;
    try {
      const po = await createPurchaseOrder({
        supplier_id: selectedSupplierId,
        outlet_id: staff.outlet_id,
        created_by: staff.id,
        notes: notes.trim() || undefined,
        items: items.map(({ _key, ...item }) => ({
          ...item,
          title: item.title.trim(),
          isbn: item.isbn?.trim() || undefined,
        })),
      });

      showToast(t('po.created'), 'success');
      goto(`${base}/owner/purchase-orders/${po.id}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('po.create_failed'), 'error');
    } finally {
      saving = false;
    }
  }

  function formatPrice(amount: number): string {
    return `Rp ${amount.toLocaleString('id-ID')}`;
  }
</script>

<div class="space-y-4">
  <button class="text-sm text-ink-muted hover:text-accent" onclick={() => goto(`${base}/owner/purchase-orders`)}>
    &larr; {t('po.title')}
  </button>

  <h1 class="font-display text-xl font-bold text-ink">{t('po.create')}</h1>

  <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-4">
    <!-- Supplier select -->
    <div>
      <label for="supplier" class="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
        {t('po.supplier')} *
      </label>
      <select id="supplier" bind:value={selectedSupplierId} required
        class="w-full px-4 py-3 rounded-xl bg-surface border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30">
        <option value="">{t('po.select_supplier')}</option>
        {#each suppliers as s}
          <option value={s.id}>{s.name}</option>
        {/each}
      </select>
    </div>

    <!-- Items -->
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold text-ink uppercase tracking-wide">{t('po.items')}</h2>
        <button type="button" onclick={addItem}
          class="text-xs text-accent font-medium hover:text-accent/80">
          + {t('po.add_item')}
        </button>
      </div>

      {#each items as item, i (item._key)}
        <div class="bg-surface rounded-xl border border-warm-100 p-3 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-ink-muted">Item {i + 1}</span>
            {#if items.length > 1}
              <button type="button" onclick={() => removeItem(item._key)}
                class="text-xs text-berry hover:text-berry/80">{t('po.remove_item')}</button>
            {/if}
          </div>
          <input type="text" bind:value={item.title} placeholder={t('po.book_title')} required
            class="w-full px-3 py-2 rounded-lg bg-cream border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
          <div class="grid grid-cols-3 gap-2">
            <input type="text" bind:value={item.isbn} placeholder={t('po.isbn')}
              class="px-3 py-2 rounded-lg bg-cream border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
            <input type="number" min="1" bind:value={item.quantity} placeholder={t('po.quantity')}
              class="px-3 py-2 rounded-lg bg-cream border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
            <input type="number" min="0" bind:value={item.unit_price} placeholder={t('po.unit_price')}
              class="px-3 py-2 rounded-lg bg-cream border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
          </div>
        </div>
      {/each}
    </div>

    <!-- Notes -->
    <div>
      <label for="notes" class="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
        {t('po.notes')}
      </label>
      <textarea id="notes" bind:value={notes} rows="2"
        class="w-full px-4 py-3 rounded-xl bg-surface border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"></textarea>
    </div>

    <!-- Total -->
    <div class="bg-surface rounded-xl border border-warm-100 px-4 py-3 flex justify-between items-center">
      <span class="text-sm font-semibold text-ink">{t('po.total')}</span>
      <span class="text-lg font-bold text-ink">{formatPrice(poTotal)}</span>
    </div>

    <button type="submit" disabled={saving}
      class="w-full py-3 rounded-xl bg-accent text-cream font-semibold text-sm hover:bg-accent/90 transition-colors disabled:opacity-50">
      {saving ? '...' : t('po.create')}
    </button>
  </form>
</div>
