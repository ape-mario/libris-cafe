<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { t } from '$lib/i18n/index.svelte';
  import { getLendingStore } from '$lib/modules/lending/stores.svelte';
  import { checkIn, checkOut } from '$lib/modules/lending/service';
  import { getCurrentStaff } from '$lib/modules/auth/stores.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import CheckInDialog from '$lib/components/lending/CheckInDialog.svelte';
  import CheckOutDialog from '$lib/components/lending/CheckOutDialog.svelte';
  import SessionCard from '$lib/components/lending/SessionCard.svelte';
  import OverdueAlert from '$lib/components/lending/OverdueAlert.svelte';
  import type { CheckInParams, CheckOutParams, CheckOutResult, SessionWithBook } from '$lib/modules/lending/types';

  const lending = getLendingStore();
  let showCheckIn = $state(false);
  let showCheckOut = $state(false);
  let selectedSession = $state<SessionWithBook | null>(null);

  // Reading fee state (Task 8)
  let showFeeDialog = $state(false);
  let lastCheckOutResult = $state<CheckOutResult | null>(null);

  /** Default fee per hour — could be loaded from outlet settings */
  const FEE_PER_HOUR = 7500;

  const staff = $derived(getCurrentStaff());
  const outletId = $derived(staff?.outlet_id ?? '');
  const staffId = $derived(staff?.id ?? '');

  onMount(async () => {
    if (!outletId) return;
    await lending.refreshSessions(outletId);
    await lending.refreshStats(outletId);
    await lending.checkOverdue(outletId);
  });

  function formatPrice(amount: number): string {
    return `Rp ${amount.toLocaleString('id-ID')}`;
  }

  async function handleCheckIn(params: Omit<CheckInParams, 'outlet_id' | 'staff_id'>) {
    try {
      await checkIn({ ...params, outlet_id: outletId, staff_id: staffId });
      showCheckIn = false;
      await lending.refreshSessions(outletId);
      await lending.refreshStats(outletId);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Check-in failed', 'error');
    }
  }

  async function handleCheckOut(params: Omit<CheckOutParams, 'staff_id'>) {
    try {
      const result = await checkOut({ ...params, staff_id: staffId }, FEE_PER_HOUR);
      showCheckOut = false;
      selectedSession = null;

      // If a reading fee was calculated, show the fee dialog
      if (result.fee_amount > 0) {
        lastCheckOutResult = result;
        showFeeDialog = true;
      }

      await lending.refreshSessions(outletId);
      await lending.refreshStats(outletId);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Check-out failed', 'error');
    }
  }

  function chargeFeeToPos() {
    if (!lastCheckOutResult) return;
    showFeeDialog = false;
    // Navigate to POS with reading_fee item pre-filled via URL params
    const params = new URLSearchParams({
      reading_fee: String(lastCheckOutResult.fee_amount),
      session_id: lastCheckOutResult.session.id,
    });
    lastCheckOutResult = null;
    goto(`${base}/staff/pos?${params.toString()}`);
  }

  function waiveFee() {
    showFeeDialog = false;
    lastCheckOutResult = null;
    showToast(t('lending.fee_waived'), 'info');
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

<!-- Reading Fee Dialog (Task 8) -->
{#if showFeeDialog && lastCheckOutResult}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onclick={waiveFee}>
    <div
      class="bg-cream rounded-t-2xl sm:rounded-2xl w-full max-w-md p-5 space-y-4"
      onclick={(e) => e.stopPropagation()}
    >
      <h2 class="text-lg font-bold text-ink">{t('lending.fee')}</h2>

      <div class="bg-surface rounded-xl border border-warm-100 p-4 text-center space-y-1">
        <p class="text-sm text-ink-muted">
          {t('lending.fee_calculated', {
            amount: formatPrice(lastCheckOutResult.fee_amount),
            hours: String(lastCheckOutResult.fee_hours),
            rate: formatPrice(lastCheckOutResult.fee_rate),
          })}
        </p>
        <p class="text-2xl font-bold text-accent">{formatPrice(lastCheckOutResult.fee_amount)}</p>
      </div>

      <div class="flex gap-3">
        <button
          class="flex-1 py-3 rounded-xl bg-accent text-cream font-semibold text-sm"
          onclick={chargeFeeToPos}
        >
          {t('lending.charge_fee')}
        </button>
        <button
          class="flex-1 py-3 rounded-xl bg-warm-100 text-ink-muted font-semibold text-sm"
          onclick={waiveFee}
        >
          {t('lending.fee_waived')}
        </button>
      </div>
    </div>
  </div>
{/if}
