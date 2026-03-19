<script lang="ts">
  let { cafeName, logoUrl }: { cafeName: string; logoUrl?: string } = $props();
</script>

<header class="flex items-center justify-center gap-3 py-3 px-4 bg-primary text-primary-content shadow-md">
  {#if logoUrl}
    <img src={logoUrl} alt={cafeName} class="h-8 w-8 rounded-full object-cover" />
  {/if}
  <h1 class="text-xl font-bold tracking-tight">{cafeName}</h1>
</header>
