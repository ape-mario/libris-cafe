<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { getSuppliers } from '$lib/modules/supplier/service';
  import type { Supplier } from '$lib/modules/supplier/types';

  let suppliers = $state<Supplier[]>([]);
  let loading = $state(true);
  let showInactive = $state(false);

  onMount(async () => {
    try {
      suppliers = await getSuppliers(!showInactive);
    } finally {
      loading = false;
    }
  });

  async function reload() {
    loading = true;
    try {
      suppliers = await getSuppliers(!showInactive);
    } finally {
      loading = false;
    }
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h1 class="font-display text-xl font-bold text-ink">{t('supplier.title')}</h1>
    <a
      href="{base}/owner/suppliers/new"
      class="px-4 py-2 rounded-xl bg-accent text-cream text-sm font-medium"
    >
      + {t('supplier.add')}
    </a>
  </div>

  <label class="flex items-center gap-2 text-sm text-ink-muted">
    <input type="checkbox" bind:checked={showInactive} onchange={reload} class="rounded" />
    Show inactive
  </label>

  {#if loading}
    <div class="py-8 text-center text-sm text-ink-muted">Loading...</div>
  {:else if suppliers.length === 0}
    <div class="py-8 text-center text-sm text-ink-muted">{t('supplier.no_suppliers')}</div>
  {:else}
    <div class="space-y-2">
      {#each suppliers as supplier}
        <a
          href="{base}/owner/suppliers/{supplier.id}"
          class="block bg-surface rounded-xl border border-warm-100 px-4 py-3 hover:border-accent/30 transition-colors"
        >
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-ink">{supplier.name}</p>
              <p class="text-xs text-ink-muted">
                {supplier.contact_name ?? ''}
                {supplier.phone ? ` · ${supplier.phone}` : ''}
              </p>
            </div>
            <div class="text-right">
              <span class="text-[10px] px-1.5 py-0.5 rounded-full font-medium {supplier.is_active ? 'bg-sage/10 text-sage' : 'bg-warm-100 text-ink-muted'}">
                {supplier.is_active ? t('supplier.active') : t('supplier.inactive')}
              </span>
              <p class="text-xs text-ink-muted mt-1">{t('supplier.lead_time')}: {supplier.lead_time_days}d</p>
            </div>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
