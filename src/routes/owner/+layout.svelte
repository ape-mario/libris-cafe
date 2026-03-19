<script lang="ts">
  import { onMount } from 'svelte';
  import { requireRole } from '$lib/modules/auth/guard';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';

  let { children } = $props();
  let authorized = $state(false);

  onMount(() => {
    authorized = requireRole('owner');
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
{/if}
