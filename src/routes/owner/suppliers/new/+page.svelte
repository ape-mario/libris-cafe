<script lang="ts">
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import { createSupplier } from '$lib/modules/supplier/service';

  let name = $state('');
  let contactName = $state('');
  let phone = $state('');
  let email = $state('');
  let address = $state('');
  let leadTimeDays = $state(7);
  let notes = $state('');
  let saving = $state(false);

  async function handleSubmit() {
    if (!name.trim() || saving) return;
    saving = true;

    try {
      await createSupplier({
        name: name.trim(),
        contact_name: contactName.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        lead_time_days: leadTimeDays,
        notes: notes.trim() || undefined,
      });

      showToast(t('supplier.added'), 'success');
      goto(`${base}/owner/suppliers`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to add supplier', 'error');
    } finally {
      saving = false;
    }
  }
</script>

<div class="space-y-4">
  <button class="text-sm text-ink-muted hover:text-accent" onclick={() => goto(`${base}/owner/suppliers`)}>
    &larr; {t('supplier.title')}
  </button>

  <h1 class="font-display text-xl font-bold text-ink">{t('supplier.add')}</h1>

  <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-4">
    <div>
      <label for="name" class="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
        {t('supplier.name')} *
      </label>
      <input id="name" type="text" bind:value={name} required
        class="w-full px-4 py-3 rounded-xl bg-surface border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
    </div>

    <div class="grid grid-cols-2 gap-3">
      <div>
        <label for="contact" class="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
          {t('supplier.contact')}
        </label>
        <input id="contact" type="text" bind:value={contactName}
          class="w-full px-4 py-3 rounded-xl bg-surface border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
      </div>
      <div>
        <label for="phone" class="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
          {t('supplier.phone')}
        </label>
        <input id="phone" type="tel" bind:value={phone}
          class="w-full px-4 py-3 rounded-xl bg-surface border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
      </div>
    </div>

    <div>
      <label for="email" class="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
        {t('supplier.email')}
      </label>
      <input id="email" type="email" bind:value={email}
        class="w-full px-4 py-3 rounded-xl bg-surface border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
    </div>

    <div>
      <label for="address" class="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
        {t('supplier.address')}
      </label>
      <textarea id="address" bind:value={address} rows="2"
        class="w-full px-4 py-3 rounded-xl bg-surface border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"></textarea>
    </div>

    <div>
      <label for="lead_time" class="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
        {t('supplier.lead_time')}
      </label>
      <input id="lead_time" type="number" min="1" max="90" bind:value={leadTimeDays}
        class="w-full px-4 py-3 rounded-xl bg-surface border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
    </div>

    <div>
      <label for="notes" class="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
        {t('supplier.notes')}
      </label>
      <textarea id="notes" bind:value={notes} rows="2"
        class="w-full px-4 py-3 rounded-xl bg-surface border border-warm-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"></textarea>
    </div>

    <button type="submit" disabled={saving}
      class="w-full py-3 rounded-xl bg-accent text-cream font-semibold text-sm hover:bg-accent/90 transition-colors disabled:opacity-50">
      {saving ? '...' : t('supplier.add')}
    </button>
  </form>
</div>
