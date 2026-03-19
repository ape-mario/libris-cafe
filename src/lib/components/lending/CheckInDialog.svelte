<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import { searchBooks } from '$lib/services/books';
  import { getInventoryByBookId } from '$lib/modules/inventory/service';
  import { getCurrentStaff } from '$lib/modules/auth/stores.svelte';
  import type { CheckInParams, LendingLevel } from '$lib/modules/lending/types';
  import type { Book } from '$lib/services/books';

  let {
    onsubmit,
    onclose,
  }: {
    onsubmit: (params: Omit<CheckInParams, 'outlet_id' | 'staff_id'>) => void;
    onclose: () => void;
  } = $props();

  const staff = getCurrentStaff();

  let level = $state<LendingLevel>('semi_formal');
  let bookSearch = $state('');
  let selectedBookId = $state('');
  let selectedInventoryId = $state('');
  let durationMinutes = $state(120);
  let customerName = $state('');
  let customerContact = $state('');
  let depositAmount = $state(0);
  let notes = $state('');
  let isSubmitting = $state(false);
  let bookResults = $state<Book[]>([]);
  let showResults = $state(false);

  function handleSearch() {
    if (bookSearch.length >= 2) {
      bookResults = searchBooks(bookSearch).slice(0, 10);
      showResults = true;
    } else {
      bookResults = [];
      showResults = false;
    }
  }

  async function selectBook(book: Book) {
    selectedBookId = book.id;
    bookSearch = book.title;
    showResults = false;
    // Look up inventory for this book at our outlet
    if (staff?.outlet_id) {
      const inv = await getInventoryByBookId(book.id, staff.outlet_id);
      if (inv) {
        selectedInventoryId = inv.id;
      }
    }
  }

  async function handleSubmit() {
    if (!selectedBookId || !selectedInventoryId) return;
    isSubmitting = true;
    try {
      onsubmit({
        inventory_id: selectedInventoryId,
        book_id: selectedBookId,
        level,
        duration_minutes: level === 'formal' ? durationMinutes : undefined,
        customer_name: level === 'formal' ? customerName : undefined,
        customer_contact: level === 'formal' ? customerContact : undefined,
        deposit_amount: level === 'formal' ? depositAmount : undefined,
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
    class="bg-cream rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto p-5 space-y-4"
    onclick={(e) => e.stopPropagation()}
  >
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-bold text-ink">{t('lending.newCheckIn')}</h2>
      <button class="w-8 h-8 rounded-full bg-warm-100 text-ink-muted hover:text-ink flex items-center justify-center" onclick={onclose}>
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>

    <!-- Book search -->
    <div>
      <label class="text-sm font-medium text-ink">{t('lending.selectBook')}</label>
      <input
        type="text"
        placeholder={t('lending.searchBook')}
        bind:value={bookSearch}
        oninput={handleSearch}
        class="w-full mt-1 px-3 py-2 rounded-xl border border-warm-200 bg-surface text-sm text-ink placeholder:text-ink-muted/50 focus:outline-none focus:border-accent"
      />
      {#if showResults && bookResults.length > 0}
        <div class="mt-1 bg-surface rounded-xl border border-warm-100 max-h-40 overflow-y-auto">
          {#each bookResults as book (book.id)}
            <button
              class="w-full px-3 py-2 text-left text-sm text-ink hover:bg-warm-50 transition-colors"
              onclick={() => selectBook(book)}
            >
              {book.title} — {book.authors?.join(', ') ?? ''}
            </button>
          {/each}
        </div>
      {/if}
      <p class="text-xs text-ink-muted mt-1">{t('lending.scanOrSearch')}</p>
    </div>

    <!-- Level selection -->
    <div>
      <label class="text-sm font-medium text-ink">{t('lending.level')}</label>
      <div class="flex gap-2 mt-1">
        <button
          class="flex-1 py-2 rounded-xl text-sm font-medium transition-colors
            {level === 'semi_formal' ? 'bg-accent text-cream' : 'bg-surface border border-warm-200 text-ink-muted'}"
          onclick={() => level = 'semi_formal'}
        >
          {t('lending.semiFormal')}
        </button>
        <button
          class="flex-1 py-2 rounded-xl text-sm font-medium transition-colors
            {level === 'formal' ? 'bg-accent text-cream' : 'bg-surface border border-warm-200 text-ink-muted'}"
          onclick={() => level = 'formal'}
        >
          {t('lending.formal')}
        </button>
      </div>
    </div>

    <!-- Formal-only fields -->
    {#if level === 'formal'}
      <div class="space-y-3 border-l-2 border-accent/30 pl-3">
        <div>
          <label class="text-sm font-medium text-ink">{t('lending.customerName')}</label>
          <input type="text" bind:value={customerName}
            class="w-full mt-1 px-3 py-2 rounded-xl border border-warm-200 bg-surface text-sm text-ink focus:outline-none focus:border-accent" />
        </div>
        <div>
          <label class="text-sm font-medium text-ink">{t('lending.customerContact')}</label>
          <input type="tel" bind:value={customerContact}
            class="w-full mt-1 px-3 py-2 rounded-xl border border-warm-200 bg-surface text-sm text-ink focus:outline-none focus:border-accent"
            placeholder="08xxxxxxxxxx" />
        </div>
        <div>
          <label class="text-sm font-medium text-ink">{t('lending.duration')}</label>
          <select bind:value={durationMinutes}
            class="w-full mt-1 px-3 py-2 rounded-xl border border-warm-200 bg-surface text-sm text-ink focus:outline-none focus:border-accent">
            <option value={30}>30 {t('common.minutes')}</option>
            <option value={60}>1 {t('common.hour')}</option>
            <option value={120}>2 {t('common.hours')}</option>
            <option value={180}>3 {t('common.hours')}</option>
            <option value={240}>4 {t('common.hours')}</option>
          </select>
        </div>
        <div>
          <label class="text-sm font-medium text-ink">{t('lending.depositAmount')}</label>
          <input type="number" bind:value={depositAmount}
            class="w-full mt-1 px-3 py-2 rounded-xl border border-warm-200 bg-surface text-sm text-ink focus:outline-none focus:border-accent"
            min="0" step="5000" placeholder="Rp" />
        </div>
      </div>
    {/if}

    <!-- Notes -->
    <div>
      <label class="text-sm font-medium text-ink">{t('common.notes')}</label>
      <textarea bind:value={notes}
        class="w-full mt-1 px-3 py-2 rounded-xl border border-warm-200 bg-surface text-sm text-ink focus:outline-none focus:border-accent resize-none"
        rows="2"></textarea>
    </div>

    <!-- Submit -->
    <button
      class="w-full py-3 rounded-xl bg-accent text-cream font-semibold disabled:opacity-50 transition-opacity"
      disabled={!selectedBookId || !selectedInventoryId || isSubmitting}
      onclick={handleSubmit}
    >
      {isSubmitting ? t('common.loading') : t('lending.checkIn')}
    </button>
  </div>
</div>
