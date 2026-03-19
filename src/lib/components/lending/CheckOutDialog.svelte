<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import type { SessionWithBook, CheckOutParams } from '$lib/modules/lending/types';

  let {
    session,
    onsubmit,
    onclose,
  }: {
    session: SessionWithBook;
    onsubmit: (params: Omit<CheckOutParams, 'staff_id'>) => void;
    onclose: () => void;
  } = $props();

  let refundDeposit = $state(true);
  let notes = $state('');
  let isSubmitting = $state(false);

  const duration = $derived.by(() => {
    const inTime = new Date(session.checked_in_at).getTime();
    const now = Date.now();
    const minutes = Math.round((now - inTime) / 60000);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  });

  const isOverdue = $derived(session.status === 'overdue');
  const hasFormalDeposit = $derived(session.level === 'formal' && session.deposit_amount > 0);

  async function handleSubmit() {
    isSubmitting = true;
    try {
      onsubmit({
        session_id: session.id,
        refund_deposit: hasFormalDeposit ? refundDeposit : false,
        notes: notes || undefined,
      });
    } finally {
      isSubmitting = false;
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onclick={onclose}>
  <div
    class="bg-cream rounded-t-2xl sm:rounded-2xl w-full max-w-md p-5 space-y-4"
    onclick={(e) => e.stopPropagation()}
  >
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-bold text-ink">{t('lending.checkOutTitle')}</h2>
      <button class="w-8 h-8 rounded-full bg-warm-100 text-ink-muted hover:text-ink flex items-center justify-center" onclick={onclose}>
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>

    <!-- Session info -->
    <div class="bg-surface rounded-xl border border-warm-100 p-3 space-y-1">
      <div class="text-sm text-ink"><span class="font-medium">{t('lending.book')}:</span> {session.book_title ?? session.book_id}</div>
      <div class="text-sm text-ink"><span class="font-medium">{t('lending.duration')}:</span> {duration}</div>
      <div class="text-sm text-ink"><span class="font-medium">{t('lending.level')}:</span> {session.level === 'formal' ? t('lending.formal') : t('lending.semiFormal')}</div>
      {#if session.customer_name}
        <div class="text-sm text-ink"><span class="font-medium">{t('lending.customer')}:</span> {session.customer_name}</div>
      {/if}
      {#if isOverdue}
        <div class="text-sm text-berry font-medium">{t('lending.overdueWarning')}</div>
      {/if}
    </div>

    <!-- Deposit handling -->
    {#if hasFormalDeposit}
      <div class="space-y-2">
        <label class="text-sm font-medium text-ink">{t('lending.deposit')}: Rp{session.deposit_amount.toLocaleString('id-ID')}</label>
        <div class="flex gap-2">
          <button
            class="flex-1 py-2 rounded-xl text-sm font-medium transition-colors
              {refundDeposit ? 'bg-sage text-cream' : 'bg-surface border border-warm-200 text-ink-muted'}"
            onclick={() => refundDeposit = true}
          >
            {t('lending.refundDeposit')}
          </button>
          <button
            class="flex-1 py-2 rounded-xl text-sm font-medium transition-colors
              {!refundDeposit ? 'bg-berry text-cream' : 'bg-surface border border-warm-200 text-ink-muted'}"
            onclick={() => refundDeposit = false}
          >
            {t('lending.forfeitDeposit')}
          </button>
        </div>
      </div>
    {/if}

    <!-- Notes -->
    <div>
      <label class="text-sm font-medium text-ink">{t('common.notes')}</label>
      <textarea bind:value={notes}
        class="w-full mt-1 px-3 py-2 rounded-xl border border-warm-200 bg-surface text-sm text-ink focus:outline-none focus:border-accent resize-none"
        rows="2"
        placeholder={isOverdue ? t('lending.overdueNotes') : ''}></textarea>
    </div>

    <!-- Submit -->
    <button
      class="w-full py-3 rounded-xl bg-accent text-cream font-semibold disabled:opacity-50 transition-opacity"
      disabled={isSubmitting}
      onclick={handleSubmit}
    >
      {isSubmitting ? t('common.loading') : t('lending.checkOut')}
    </button>
  </div>
</div>
