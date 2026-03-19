<script lang="ts">
  import { onMount } from 'svelte';
  import { requireRole } from '$lib/modules/auth/guard';

  let { children } = $props();
  let authorized = $state(false);

  onMount(() => {
    authorized = requireRole('staff');
  });
</script>

{#if authorized}
  {@render children()}
{/if}
