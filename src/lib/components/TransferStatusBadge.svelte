<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import type { TransferStatus } from '$lib/modules/outlet/types';

  let { status }: { status: TransferStatus } = $props();

  const statusConfig: Record<TransferStatus, { bg: string; text: string }> = {
    requested: { bg: 'bg-gold/20', text: 'text-gold-700' },
    approved: { bg: 'bg-sky-100', text: 'text-sky-700' },
    shipped: { bg: 'bg-violet-100', text: 'text-violet-700' },
    received: { bg: 'bg-sage/20', text: 'text-sage-700' },
    cancelled: { bg: 'bg-warm-100', text: 'text-warm-500' },
  };

  let config = $derived(statusConfig[status]);
</script>

<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium {config.bg} {config.text}">
  {t(`transfer.status.${status}`)}
</span>
