<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import {
    getOutlets,
    getActiveOutletId,
    getActiveOutlet,
    setActiveOutletId,
    outletStore,
  } from '$lib/modules/outlet/stores.svelte';

  let open = $state(false);
  let outlets = $derived(outletStore.outlets);
  let activeOutlet = $derived(outletStore.activeOutlet);
  let activeOutletId = $derived(outletStore.activeOutletId);

  function selectOutlet(outletId: string) {
    setActiveOutletId(outletId);
    open = false;
    // Dispatch event so other components can react
    window.dispatchEvent(new CustomEvent('outlet-changed', { detail: { outletId } }));
  }

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.outlet-picker')) {
      open = false;
    }
  }
</script>

<svelte:window onclick={handleClickOutside} />

{#if outlets.length > 1}
  <div class="outlet-picker relative">
    <button
      class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg
             bg-warm-100 hover:bg-warm-200 transition-colors
             text-sm font-medium text-warm-700"
      onclick={() => { open = !open; }}
      aria-expanded={open}
      aria-haspopup="listbox"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2" stroke-linecap="round"
           stroke-linejoin="round" class="text-warm-500">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
      <span class="max-w-[120px] truncate">{activeOutlet?.name ?? t('outlet.switch')}</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2" class="text-warm-400"
           class:rotate-180={open}>
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </button>

    {#if open}
      <div
        class="absolute top-full left-0 mt-1 w-56 bg-surface rounded-xl
               shadow-lg border border-warm-200 py-1 z-50"
        role="listbox"
        aria-label={t('outlet.switch')}
      >
        <div class="px-3 py-1.5 text-xs font-medium text-warm-400 uppercase tracking-wider">
          {t('outlet.switch')}
        </div>
        {#each outlets as outlet (outlet.id)}
          <button
            class="w-full flex items-center gap-2 px-3 py-2 text-sm text-left
                   hover:bg-warm-50 transition-colors
                   {outlet.id === activeOutletId ? 'text-sage-700 font-medium bg-sage-50' : 'text-warm-600'}"
            role="option"
            aria-selected={outlet.id === activeOutletId}
            onclick={() => selectOutlet(outlet.id)}
          >
            {#if outlet.id === activeOutletId}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2.5" class="text-sage">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            {:else}
              <div class="w-3.5"></div>
            {/if}
            <div>
              <div class="leading-tight">{outlet.name}</div>
              {#if outlet.address}
                <div class="text-xs text-warm-400 truncate max-w-[180px]">{outlet.address}</div>
              {/if}
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </div>
{:else if outlets.length === 1}
  <div class="text-sm font-medium text-warm-500 px-2">
    {outlets[0].name}
  </div>
{/if}
