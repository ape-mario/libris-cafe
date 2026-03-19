<script lang="ts">
  import { requireRole } from '$lib/modules/auth/guard';
  import { getAuthReady } from '$lib/modules/auth/stores.svelte';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';

  let { children } = $props();
  let authReady = $derived(getAuthReady());
  let authorized = $state(false);

  $effect(() => {
    if (authReady) {
      authorized = requireRole('owner');
    }
  });

  const ownerTabs = [
    { href: `${base}/owner/outlets`, label: 'nav.outlets' },
    { href: `${base}/owner/transfers`, label: 'nav.transfers' },
    { href: `${base}/owner/reports/consolidated`, label: 'consolidated.title' },
  ];
</script>

{#if authorized}
  <nav class="flex gap-1 px-4 py-2 border-b border-warm-200 bg-warm-50 overflow-x-auto">
    {#each ownerTabs as tab (tab.href)}
      <a
        href={tab.href}
        class="px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap
               hover:bg-warm-200 transition-colors text-warm-600"
      >
        {t(tab.label)}
      </a>
    {/each}
  </nav>
  {@render children()}
{:else if authReady}
  <!-- auth ready but not authorized — guard already redirected -->
{:else}
  <div class="min-h-screen bg-cream flex items-center justify-center">
    <div class="animate-pulse text-ink-muted text-sm">{t('common.loading')}</div>
  </div>
{/if}
