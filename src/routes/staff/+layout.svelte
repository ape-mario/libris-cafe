<script lang="ts">
  import { onMount } from 'svelte';
  import { requireRole } from '$lib/modules/auth/guard';
  import { getAuthReady } from '$lib/modules/auth/stores.svelte';

  let { children } = $props();
  let authorized = $state(false);

  onMount(() => {
    // Wait for auth to be ready before checking role
    const check = () => {
      if (getAuthReady()) {
        authorized = requireRole('staff');
      } else {
        setTimeout(check, 50);
      }
    };
    check();
  });
</script>

{#if authorized}
  {@render children()}
{/if}
