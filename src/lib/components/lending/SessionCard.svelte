<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import type { SessionWithBook } from '$lib/modules/lending/types';

  let { session, oncheckout }: { session: SessionWithBook; oncheckout: () => void } = $props();

  const elapsedMinutes = $derived(
    Math.round((Date.now() - new Date(session.checked_in_at).getTime()) / 60000)
  );

  const formatElapsed = $derived.by(() => {
    const m = elapsedMinutes;
    const h = Math.floor(m / 60);
    const mins = m % 60;
    return h > 0 ? `${h}h ${mins}m` : `${mins}m`;
  });

  const isOverdue = $derived(session.status === 'overdue');
  const isFormal = $derived(session.level === 'formal');
</script>

<div
  class="bg-surface rounded-xl border px-4 py-3 flex items-center gap-3 transition-colors
    {isOverdue ? 'border-berry/50 bg-berry/5' : 'border-warm-100'}"
>
  <!-- Status indicator -->
  <div class="w-2 h-12 rounded-full {isOverdue ? 'bg-berry' : 'bg-sage'} shrink-0"></div>

  <!-- Info -->
  <div class="flex-1 min-w-0">
    <div class="font-medium text-sm text-ink truncate">
      {session.book_title ?? session.book_id}
    </div>
    <div class="text-xs text-ink-muted flex items-center gap-2 mt-0.5">
      <span>{formatElapsed}</span>
      <span class="inline-block w-1 h-1 rounded-full bg-ink-muted/40"></span>
      <span>{isFormal ? t('lending.formal') : t('lending.semiFormal')}</span>
      {#if session.customer_name}
        <span class="inline-block w-1 h-1 rounded-full bg-ink-muted/40"></span>
        <span class="truncate">{session.customer_name}</span>
      {/if}
    </div>
    {#if isFormal && session.expected_return_at}
      <div class="text-xs mt-0.5 {isOverdue ? 'text-berry font-medium' : 'text-ink-muted'}">
        {t('lending.returnBy')}: {new Date(session.expected_return_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
      </div>
    {/if}
  </div>

  <!-- Check-out button -->
  <button
    class="shrink-0 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors
      {isOverdue
        ? 'bg-berry text-cream'
        : 'border border-warm-200 text-ink-muted hover:border-accent hover:text-accent'}"
    onclick={oncheckout}
  >
    {t('lending.return')}
  </button>
</div>
