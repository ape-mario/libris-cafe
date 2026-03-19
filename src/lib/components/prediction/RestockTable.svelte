<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import type { RestockRecommendation } from '$lib/modules/prediction/types';

  let { recommendations }: { recommendations: RestockRecommendation[] } = $props();

  const urgencyColors: Record<string, string> = {
    critical: 'bg-error text-error-content',
    urgent: 'bg-warning text-warning-content',
    warning: 'bg-amber-200 text-amber-800',
    low: 'bg-info/20 text-info',
    ok: 'bg-success/20 text-success',
  };
</script>

<div class="space-y-2">
  <h2 class="font-semibold">{t('prediction.restockRecommendations')}</h2>
  <div class="overflow-x-auto rounded-xl border border-base-300">
    <table class="w-full text-sm">
      <thead class="bg-base-200">
        <tr>
          <th class="text-left p-2">{t('prediction.book')}</th>
          <th class="text-center p-2">{t('prediction.stock')}</th>
          <th class="text-center p-2">{t('prediction.daysLeft')}</th>
          <th class="text-center p-2">{t('prediction.suggestedQty')}</th>
          <th class="text-center p-2">{t('prediction.urgency')}</th>
        </tr>
      </thead>
      <tbody>
        {#each recommendations as rec (rec.inventory_id)}
          <tr class="border-t border-base-300">
            <td class="p-2 max-w-[160px] truncate">{rec.book_title ?? rec.book_id}</td>
            <td class="p-2 text-center font-mono">{rec.current_stock}</td>
            <td class="p-2 text-center font-mono">
              {rec.days_until_stockout !== null ? Math.round(rec.days_until_stockout) : '-'}
            </td>
            <td class="p-2 text-center font-mono font-medium">{rec.suggested_quantity}</td>
            <td class="p-2 text-center">
              <span class="inline-block px-2 py-0.5 rounded-full text-xs font-medium {urgencyColors[rec.urgency]}">
                {rec.urgency}
              </span>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
