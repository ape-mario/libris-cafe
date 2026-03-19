<script lang="ts">
  let { unitsSold30d }: { unitsSold30d: number } = $props();

  const dailyRate = $derived(Math.round((unitsSold30d / 30) * 10) / 10);

  const level = $derived(() => {
    if (dailyRate >= 2) return 'high';
    if (dailyRate >= 0.5) return 'medium';
    return 'low';
  });

  const colors: Record<string, string> = {
    high: 'bg-success/20 text-success',
    medium: 'bg-info/20 text-info',
    low: 'bg-base-300 text-base-content/60',
  };
</script>

<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium {colors[level()]}">
  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
    <path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
  </svg>
  {dailyRate}/d
</span>
