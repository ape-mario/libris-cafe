<script lang="ts">
  interface Props {
    label: string;
    value: string;
    subtitle?: string;
    color?: 'accent' | 'sage' | 'berry' | 'gold';
  }

  let { label, value, subtitle, color = 'accent' }: Props = $props();

  const colorMap = {
    accent: 'bg-accent/10 text-accent',
    sage: 'bg-sage/10 text-sage',
    berry: 'bg-berry/10 text-berry',
    gold: 'bg-gold/10 text-gold',
  };
</script>

<div class="bg-surface rounded-xl border border-warm-100 p-4">
  <p class="text-xs font-semibold text-ink-muted uppercase tracking-wide">{label}</p>
  <p class="text-2xl font-bold text-ink mt-1 font-display">{value}</p>
  {#if subtitle}
    <span class="inline-block mt-1.5 text-[11px] px-2 py-0.5 rounded-full font-medium {colorMap[color]}">
      {subtitle}
    </span>
  {/if}
</div>
