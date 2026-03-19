<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/index.svelte';
  import { base } from '$app/paths';
  import { showToast } from '$lib/stores/toast.svelte';
  import { showConfirm } from '$lib/stores/dialog.svelte';
  import { fetchOutlets, createOutlet, deleteOutlet } from '$lib/modules/outlet/service';
  import { setOutlets } from '$lib/modules/outlet/stores.svelte';
  import type { Outlet } from '$lib/modules/outlet/types';

  let outlets = $state<Outlet[]>([]);
  let loading = $state(true);
  let showForm = $state(false);
  let newName = $state('');
  let newAddress = $state('');
  let newPhone = $state('');
  let newTaxRate = $state(11);
  let creating = $state(false);

  onMount(async () => {
    await loadOutlets();
  });

  async function loadOutlets() {
    loading = true;
    try {
      outlets = await fetchOutlets();
      setOutlets(outlets);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      loading = false;
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    creating = true;
    try {
      await createOutlet({
        name: newName.trim(),
        address: newAddress.trim() || undefined,
        phone: newPhone.trim() || undefined,
        tax_rate: newTaxRate,
      });
      showToast(t('outlet.created'), 'success');
      showForm = false;
      newName = '';
      newAddress = '';
      newPhone = '';
      newTaxRate = 11;
      await loadOutlets();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      creating = false;
    }
  }

  async function handleDelete(outlet: Outlet) {
    const confirmed = await showConfirm(t('outlet.delete_confirm'));
    if (!confirmed) return;
    try {
      await deleteOutlet(outlet.id);
      showToast(t('outlet.deleted'), 'success');
      await loadOutlets();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  }
</script>

<div class="p-4 max-w-2xl mx-auto">
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold text-warm-800">{t('outlet.title')}</h1>
    <button
      class="px-4 py-2 bg-sage text-white rounded-lg font-medium
             hover:bg-sage-600 transition-colors"
      onclick={() => { showForm = !showForm; }}
    >
      {t('outlet.add')}
    </button>
  </div>

  {#if showForm}
    <form
      class="bg-white rounded-xl border border-warm-200 p-4 mb-6 space-y-3"
      onsubmit={(e) => { e.preventDefault(); handleCreate(); }}
    >
      <div>
        <label class="block text-sm font-medium text-warm-600 mb-1">{t('outlet.name')}</label>
        <input
          type="text"
          bind:value={newName}
          required
          class="w-full px-3 py-2 rounded-lg border border-warm-200 focus:border-sage
                 focus:ring-1 focus:ring-sage outline-none"
          placeholder="Libris Cafe Kemang"
        />
      </div>
      <div>
        <label class="block text-sm font-medium text-warm-600 mb-1">{t('outlet.address')}</label>
        <input
          type="text"
          bind:value={newAddress}
          class="w-full px-3 py-2 rounded-lg border border-warm-200 focus:border-sage
                 focus:ring-1 focus:ring-sage outline-none"
          placeholder="Jl. Kemang Raya No. 10"
        />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-sm font-medium text-warm-600 mb-1">{t('outlet.phone')}</label>
          <input
            type="tel"
            bind:value={newPhone}
            class="w-full px-3 py-2 rounded-lg border border-warm-200 focus:border-sage
                   focus:ring-1 focus:ring-sage outline-none"
            placeholder="021-7654321"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-warm-600 mb-1">{t('outlet.tax_rate')}</label>
          <input
            type="number"
            bind:value={newTaxRate}
            min="0" max="100" step="0.01"
            class="w-full px-3 py-2 rounded-lg border border-warm-200 focus:border-sage
                   focus:ring-1 focus:ring-sage outline-none"
          />
        </div>
      </div>
      <div class="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={creating}
          class="px-4 py-2 bg-sage text-white rounded-lg font-medium
                 hover:bg-sage-600 transition-colors disabled:opacity-50"
        >
          {creating ? t('app.loading') : t('outlet.add')}
        </button>
        <button
          type="button"
          onclick={() => { showForm = false; }}
          class="px-4 py-2 bg-warm-100 text-warm-600 rounded-lg font-medium
                 hover:bg-warm-200 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  {/if}

  {#if loading}
    <div class="text-center py-12 text-warm-400">{t('app.loading')}</div>
  {:else if outlets.length === 0}
    <div class="text-center py-12 text-warm-400">{t('outlet.no_outlets')}</div>
  {:else}
    <div class="space-y-3">
      {#each outlets as outlet (outlet.id)}
        <div class="bg-white rounded-xl border border-warm-200 p-4
                    hover:border-warm-300 transition-colors">
          <div class="flex items-start justify-between">
            <a href="{base}/owner/outlets/{outlet.id}" class="flex-1 min-w-0">
              <h3 class="font-semibold text-warm-800 text-lg">{outlet.name}</h3>
              {#if outlet.address}
                <p class="text-sm text-warm-500 mt-0.5">{outlet.address}</p>
              {/if}
              <div class="flex items-center gap-3 mt-2 text-xs text-warm-400">
                {#if outlet.phone}
                  <span>{outlet.phone}</span>
                {/if}
                <span>PPN {outlet.tax_rate}%</span>
              </div>
            </a>
            <div class="flex gap-1">
              <a
                href="{base}/owner/outlets/{outlet.id}/staff"
                class="p-2 rounded-lg hover:bg-warm-100 text-warm-400
                       hover:text-warm-600 transition-colors"
                title={t('outlet.staff')}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </a>
              <button
                class="p-2 rounded-lg hover:bg-red-50 text-warm-400
                       hover:text-red-500 transition-colors"
                title={t('outlet.delete')}
                onclick={() => handleDelete(outlet)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2">
                  <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
