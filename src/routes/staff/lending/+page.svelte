<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/index.svelte';
  import { getLendingStore } from '$lib/modules/lending/stores.svelte';
  import { checkIn, checkOut } from '$lib/modules/lending/service';
  import { getCurrentStaff } from '$lib/modules/auth/stores.svelte';
  import CheckInDialog from '$lib/components/lending/CheckInDialog.svelte';
  import CheckOutDialog from '$lib/components/lending/CheckOutDialog.svelte';
  import SessionCard from '$lib/components/lending/SessionCard.svelte';
  import OverdueAlert from '$lib/components/lending/OverdueAlert.svelte';
  import type { CheckInParams, CheckOutParams, SessionWithBook } from '$lib/modules/lending/types';

  const lending = getLendingStore();
  let showCheckIn = $state(false);
  let showCheckOut = $state(false);
  let selectedSession = $state<SessionWithBook | null>(null);

  const staff = $derived(getCurrentStaff());
  const outletId = $derived(staff?.outlet_id ?? '');
  const staffId = $derived(staff?.id ?? '');

  onMount(async () => {
    if (!outletId) return;
    await lending.refreshSessions(outletId);
    await lending.refreshStats(outletId);
    await lending.checkOverdue(outletId);
  });

  async function handleCheckIn(params: Omit<CheckInParams, 'outlet_id' | 'staff_id'>) {
    await checkIn({ ...params, outlet_id: outletId, staff_id: staffId });
    showCheckIn = false;
    await lending.refreshSessions(outletId);
    await lending.refreshStats(outletId);
  }

  async function handleCheckOut(params: Omit<CheckOutParams, 'staff_id'>) {
    await checkOut({ ...params, staff_id: staffId });
    showCheckOut = false;
    selectedSession = null;
    await lending.refreshSessions(outletId);
    await lending.refreshStats(outletId);
  }

  function openCheckOut(session: SessionWithBook) {
    selectedSession = session;
    showCheckOut = true;
  }
</script>

<div class="max-w-2xl mx-auto p-4 space-y-4">
  <!-- Header + New Check-in button -->
  <div class="flex items-center justify-between">
    <h1 class="font-display text-xl font-bold text-ink">{t('lending.title')}</h1>
    <button
      class="px-4 py-2 rounded-xl bg-accent text-cream text-sm font-medium"
      onclick={() => showCheckIn = true}
    >
      + {t('lending.checkIn')}
    </button>
  </div>

  <!-- Stats cards -->
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
    <div class="bg-surface rounded-xl border border-warm-100 p-3 text-center">
      <div class="text-2xl font-bold text-accent">{lending.stats.active_count}</div>
      <div class="text-xs text-ink-muted">{t('lending.active')}</div>
    </div>
    <div class="bg-surface rounded-xl border border-warm-100 p-3 text-center">
      <div class="text-2xl font-bold text-berry">{lending.stats.overdue_count}</div>
      <div class="text-xs text-ink-muted">{t('lending.overdue')}</div>
    </div>
    <div class="bg-surface rounded-xl border border-warm-100 p-3 text-center">
      <div class="text-2xl font-bold text-ink">{lending.stats.today_checkin}</div>
      <div class="text-xs text-ink-muted">{t('lending.todayIn')}</div>
    </div>
    <div class="bg-surface rounded-xl border border-warm-100 p-3 text-center">
      <div class="text-2xl font-bold text-ink">{lending.stats.today_checkout}</div>
      <div class="text-xs text-ink-muted">{t('lending.todayOut')}</div>
    </div>
  </div>

  <!-- Overdue alerts -->
  {#if lending.overdueSessions.length > 0}
    <OverdueAlert sessions={lending.overdueSessions} onaction={openCheckOut} />
  {/if}

  <!-- Active sessions list -->
  <div class="space-y-2">
    <h2 class="font-semibold text-ink/80">{t('lending.activeSessions')}</h2>
    {#if lending.isLoading}
      <div class="text-center py-8 text-sm text-ink-muted">{t('common.loading')}</div>
    {:else if lending.activeSessions.length === 0}
      <div class="text-center py-8 text-sm text-ink-muted">{t('lending.noSessions')}</div>
    {:else}
      {#each lending.activeSessions as session (session.id)}
        <SessionCard
          {session}
          oncheckout={() => openCheckOut(session)}
        />
      {/each}
    {/if}
  </div>
</div>

<!-- Dialogs -->
{#if showCheckIn}
  <CheckInDialog
    onsubmit={handleCheckIn}
    onclose={() => showCheckIn = false}
  />
{/if}

{#if showCheckOut && selectedSession}
  <CheckOutDialog
    session={selectedSession}
    onsubmit={handleCheckOut}
    onclose={() => { showCheckOut = false; selectedSession = null; }}
  />
{/if}
