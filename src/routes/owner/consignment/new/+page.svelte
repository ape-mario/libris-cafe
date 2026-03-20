<script lang="ts">
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import { createConsignor } from '$lib/modules/consignment/service';

  let name = $state('');
  let phone = $state('');
  let email = $state('');
  let bankAccount = $state('');
  let bankName = $state('');
  let commissionRate = $state(20);
  let notes = $state('');
  let saving = $state(false);

  async function handleSubmit() {
    if (!name.trim() || saving) return;
    saving = true;

    try {
      await createConsignor({
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        bank_account: bankAccount.trim() || undefined,
        bank_name: bankName.trim() || undefined,
        commission_rate: commissionRate,
        notes: notes.trim() || undefined,
      });

      showToast(t('consignment.consignor_added'), 'success');
      goto(`${base}/owner/consignment`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to add consignor', 'error');
    } finally {
      saving = false;
    }
  }
</script>

<div class="space-y-4">
  <button class="text-sm text-ink-muted hover:text-accent" onclick={() => goto(`${base}/owner/consignment`)}>
    &larr; {t('consignment.title')}
  </button>

  <h1 class="font-display text-xl font-bold text-ink">{t('consignment.add_consignor')}</h1>

  <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-4">
    <div>
      <label for="name" class="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
        {t('consignment.name')} *
      </label>
      <input id="name" type="text" bind:value={name} required
        class="w-full px-4 py-3 rounded-xl bg-surface border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
    </div>

    <div class="grid grid-cols-2 gap-3">
      <div>
        <label for="phone" class="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
          {t('consignment.phone')}
        </label>
        <input id="phone" type="tel" bind:value={phone}
          class="w-full px-4 py-3 rounded-xl bg-surface border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
      </div>
      <div>
        <label for="email" class="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
          {t('consignment.email')}
        </label>
        <input id="email" type="email" bind:value={email}
          class="w-full px-4 py-3 rounded-xl bg-surface border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
      </div>
    </div>

    <div class="grid grid-cols-2 gap-3">
      <div>
        <label for="bank_name" class="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
          {t('consignment.bank_name')}
        </label>
        <input id="bank_name" type="text" bind:value={bankName}
          class="w-full px-4 py-3 rounded-xl bg-surface border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
      </div>
      <div>
        <label for="bank_account" class="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
          {t('consignment.bank_account')}
        </label>
        <input id="bank_account" type="text" bind:value={bankAccount}
          class="w-full px-4 py-3 rounded-xl bg-surface border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
      </div>
    </div>

    <div>
      <label for="commission" class="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
        {t('consignment.commission_rate')}
      </label>
      <input id="commission" type="number" min="0" max="100" step="0.5" bind:value={commissionRate}
        class="w-full px-4 py-3 rounded-xl bg-surface border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
    </div>

    <div>
      <label for="notes" class="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
        {t('consignment.notes')}
      </label>
      <textarea id="notes" bind:value={notes} rows="2"
        class="w-full px-4 py-3 rounded-xl bg-surface border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"></textarea>
    </div>

    <button type="submit" disabled={saving}
      class="w-full py-3 rounded-xl bg-accent text-cream font-semibold text-sm hover:bg-accent/90 transition-colors disabled:opacity-50">
      {saving ? '...' : t('consignment.add_consignor')}
    </button>
  </form>
</div>
