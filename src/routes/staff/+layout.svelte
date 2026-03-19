<script lang="ts">
  import { requireRole } from '$lib/modules/auth/guard';
  import { getAuthReady } from '$lib/modules/auth/stores.svelte';
  import { t } from '$lib/i18n/index.svelte';

  let { children } = $props();
  let authReady = $derived(getAuthReady());
  let authorized = $state(false);

  $effect(() => {
    if (authReady) {
      authorized = requireRole('staff');
    }
  });
</script>

{#if authorized}
  {@render children()}
{:else if authReady}
  <!-- auth ready but not authorized — guard already redirected -->
{:else}
  <div class="min-h-screen bg-cream flex items-center justify-center">
    <div class="animate-pulse text-ink-muted text-sm">{t('common.loading')}</div>
  </div>
{/if}
