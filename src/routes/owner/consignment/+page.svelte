<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { getConsignors, getUnsettledTotal } from '$lib/modules/consignment/service';
  import type { Consignor } from '$lib/modules/consignment/types';

  let consignors = $state<Consignor[]>([]);
  let unsettledTotal = $state(0);
  let loading = $state(true);

  onMount(async () => {
    try {
      [consignors, unsettledTotal] = await Promise.all([
        getConsignors(),
        getUnsettledTotal(),
      ]);
    } finally {
      loading = false;
    }
  });

  function formatPrice(amount: number): string {
    return `Rp ${amount.toLocaleString('id-ID')}`;
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h1 class="font-display text-xl font-bold text-ink">{t('consignment.title')}</h1>
    <a href="{base}/owner/consignment/new"
      class="px-4 py-2 rounded-xl bg-accent text-cream text-sm font-medium">
      + {t('consignment.add_consignor')}
    </a>
  </div>

  <!-- Unsettled summary -->
  {#if unsettledTotal > 0}
    <div class="bg-gold/10 border border-gold/20 rounded-xl px-4 py-3">
      <p class="text-xs font-semibold text-gold uppercase tracking-wide">{t('consignment.unsettled')}</p>
      <p class="text-lg font-bold text-ink mt-1">{formatPrice(unsettledTotal)}</p>
    </div>
  {/if}

  {#if loading}
    <div class="py-8 text-center text-sm text-ink-muted">{t('common.loading')}</div>
  {:else if consignors.length === 0}
    <div class="py-8 text-center text-sm text-ink-muted">{t('consignment.no_consignors')}</div>
  {:else}
    <div class="space-y-2">
      {#each consignors as consignor}
        <a href="{base}/owner/consignment/{consignor.id}"
          class="block bg-surface rounded-xl border border-warm-100 px-4 py-3 hover:border-accent/30 transition-colors">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-ink">{consignor.name}</p>
              <p class="text-xs text-ink-muted">
                {consignor.phone ?? ''}
                {consignor.bank_name ? ` · ${consignor.bank_name}` : ''}
              </p>
            </div>
            <div class="text-right">
              <p class="text-xs text-ink-muted">{t('consignment.commission_rate')}</p>
              <p class="text-sm font-semibold text-ink">{consignor.commission_rate}%</p>
            </div>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
