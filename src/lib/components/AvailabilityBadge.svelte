<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import { getBookAvailability, isAvailabilityLoaded } from '$lib/modules/inventory/public-availability';

  interface Props {
    bookId: string;
    compact?: boolean;
  }

  let { bookId, compact = false }: Props = $props();

  let availability = $derived(getBookAvailability(bookId));

  function formatPrice(amount: number): string {
    return `Rp ${amount.toLocaleString('id-ID')}`;
  }
</script>

{#if availability}
  <div class="flex flex-wrap items-center gap-1.5">
    <!-- Price / Type Badge -->
    {#if availability.type === 'read_in_store'}
      <span class="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full font-medium bg-sage/10 text-sage">
        {t('browse.read_in_store')}
      </span>
    {:else if availability.in_stock && availability.price}
      <span class="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full font-semibold bg-accent/10 text-accent">
        {formatPrice(availability.price)}
      </span>
    {:else if !availability.in_stock}
      <span class="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full font-medium bg-berry/10 text-berry">
        {t('browse.out_of_stock_badge')}
      </span>
    {/if}

    <!-- Additional badges -->
    {#if !compact}
      {#if availability.type === 'both' && availability.in_stock}
        <span class="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full bg-sage/10 text-sage">
          {t('browse.also_read')}
        </span>
      {/if}

      {#if availability.is_preloved}
        <span class="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full bg-gold/10 text-gold">
          {t('browse.preloved')}
        </span>
      {/if}

      {#if availability.location && (availability.type === 'read_in_store' || availability.type === 'both')}
        <span class="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full bg-warm-100 text-ink-muted">
          {availability.location}
        </span>
      {/if}
    {/if}

    <!-- Stock indicator (green dot if available) -->
    {#if availability.in_stock && availability.type !== 'read_in_store'}
      <span class="w-1.5 h-1.5 rounded-full bg-sage" title={t('browse.available')}></span>
    {/if}
  </div>
{:else if isAvailabilityLoaded()}
  <!-- Book not in inventory — show nothing -->
{/if}
