<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import type { SessionWithBook } from '$lib/modules/lending/types';

  let { sessions, onaction }: {
    sessions: SessionWithBook[];
    onaction: (session: SessionWithBook) => void;
  } = $props();
</script>

<div class="bg-berry/10 border border-berry/30 rounded-xl p-3 space-y-2">
  <div class="flex items-center gap-2">
    <svg class="w-5 h-5 text-berry shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
    <span class="text-sm font-semibold text-berry">
      {t('lending.overdueCount', { count: sessions.length })}
    </span>
  </div>
  {#each sessions as session (session.id)}
    <button
      class="w-full text-left bg-surface rounded-lg p-2 flex items-center justify-between text-sm hover:bg-warm-50 transition-colors"
      onclick={() => onaction(session)}
    >
      <span class="truncate text-ink">{session.book_title ?? session.book_id}</span>
      <span class="text-berry text-xs shrink-0 ml-2">{t('lending.tapToReturn')}</span>
    </button>
  {/each}
</div>
