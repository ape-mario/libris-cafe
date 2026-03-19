<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import { fetchOutlet, updateOutlet } from '$lib/modules/outlet/service';
  import type { Outlet } from '$lib/modules/outlet/types';

  let outlet = $state<Outlet | null>(null);
  let loading = $state(true);
  let saving = $state(false);
  let name = $state('');
  let address = $state('');
  let phone = $state('');
  let taxRate = $state(11);

  const outletId = $derived(page.params.id);

  onMount(async () => {
    try {
      outlet = await fetchOutlet(outletId);
      if (outlet) {
        name = outlet.name;
        address = outlet.address ?? '';
        phone = outlet.phone ?? '';
        taxRate = outlet.tax_rate;
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      loading = false;
    }
  });

  async function handleSave() {
    if (!name.trim()) return;
    saving = true;
    try {
      await updateOutlet(outletId, {
        name: name.trim(),
        address: address.trim() || null,
        phone: phone.trim() || null,
        tax_rate: taxRate,
      });
      showToast(t('outlet.updated'), 'success');
      goto(`${base}/owner/outlets`);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      saving = false;
    }
  }
</script>

<div class="p-4 max-w-2xl mx-auto">
  <a href="{base}/owner/outlets" class="text-sm text-warm-400 hover:text-warm-600 mb-4 inline-block">
    &larr; {t('outlet.title')}
  </a>

  {#if loading}
    <div class="text-center py-12 text-warm-400">{t('app.loading')}</div>
  {:else if !outlet}
    <div class="text-center py-12 text-warm-400">Outlet not found</div>
  {:else}
    <h1 class="text-2xl font-bold text-warm-800 mb-6">{t('outlet.edit')}</h1>

    <form
      class="bg-white rounded-xl border border-warm-200 p-6 space-y-4"
      onsubmit={(e) => { e.preventDefault(); handleSave(); }}
    >
      <div>
        <label class="block text-sm font-medium text-warm-600 mb-1">{t('outlet.name')}</label>
        <input
          type="text" bind:value={name} required
          class="w-full px-3 py-2 rounded-lg border border-warm-200
                 focus:border-sage focus:ring-1 focus:ring-sage outline-none"
        />
      </div>
      <div>
        <label class="block text-sm font-medium text-warm-600 mb-1">{t('outlet.address')}</label>
        <input
          type="text" bind:value={address}
          class="w-full px-3 py-2 rounded-lg border border-warm-200
                 focus:border-sage focus:ring-1 focus:ring-sage outline-none"
        />
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-warm-600 mb-1">{t('outlet.phone')}</label>
          <input
            type="tel" bind:value={phone}
            class="w-full px-3 py-2 rounded-lg border border-warm-200
                   focus:border-sage focus:ring-1 focus:ring-sage outline-none"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-warm-600 mb-1">{t('outlet.tax_rate')}</label>
          <input
            type="number" bind:value={taxRate} min="0" max="100" step="0.01"
            class="w-full px-3 py-2 rounded-lg border border-warm-200
                   focus:border-sage focus:ring-1 focus:ring-sage outline-none"
          />
        </div>
      </div>
      <div class="flex gap-2 pt-4">
        <button
          type="submit"
          disabled={saving}
          class="px-6 py-2 bg-sage text-white rounded-lg font-medium
                 hover:bg-sage-600 transition-colors disabled:opacity-50"
        >
          {saving ? t('app.loading') : t('outlet.updated')}
        </button>
        <a
          href="{base}/owner/outlets"
          class="px-6 py-2 bg-warm-100 text-warm-600 rounded-lg font-medium
                 hover:bg-warm-200 transition-colors"
        >
          Cancel
        </a>
      </div>
    </form>
  {/if}
</div>
