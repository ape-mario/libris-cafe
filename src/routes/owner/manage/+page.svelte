<script lang="ts">
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';

  const sections = [
    {
      title: 'Supply Chain',
      items: [
        { href: `${base}/owner/suppliers`, label: t('nav.suppliers'), desc: 'Manage book suppliers', icon: '🏢' },
        { href: `${base}/owner/purchase-orders`, label: t('nav.purchase_orders'), desc: 'Create and track orders', icon: '📋' },
        { href: `${base}/owner/consignment`, label: t('nav.consignment'), desc: 'Consignment agreements', icon: '🤝' },
        { href: `${base}/owner/restock`, label: t('nav.restock'), desc: 'Restock recommendations', icon: '📦' },
        { href: `${base}/owner/prediction`, label: 'Prediction', desc: 'Demand forecasting', icon: '📈' },
      ],
    },
    {
      title: 'Multi-Outlet',
      items: [
        { href: `${base}/owner/outlets`, label: t('nav.outlets'), desc: 'Manage outlets and staff', icon: '🏪' },
        { href: `${base}/owner/transfers`, label: t('nav.transfers'), desc: 'Inter-outlet transfers', icon: '🔄' },
        { href: `${base}/owner/reports/consolidated`, label: 'Consolidated Reports', desc: 'Cross-outlet analytics', icon: '📊' },
      ],
    },
    {
      title: 'Staff',
      items: [
        { href: `${base}/owner/staff`, label: t('staff.title'), desc: t('staff.manage_desc'), icon: '👥' },
      ],
    },
    {
      title: 'Operations',
      items: [
        { href: `${base}/staff/transactions`, label: 'Transactions', desc: 'Transaction history', icon: '💳' },
        { href: `${base}/staff/reports`, label: 'Staff Reports', desc: 'Daily staff reports', icon: '📝' },
        { href: `${base}/owner/backup`, label: 'Backup', desc: 'Data backup and restore', icon: '💾' },
        { href: `${base}/staff/notifications`, label: t('nav.notifications'), desc: 'Alerts and notifications', icon: '🔔' },
      ],
    },
  ];
</script>

<div class="space-y-6">
  <h1 class="font-display text-xl font-bold text-ink">Manage</h1>

  {#each sections as section}
    <div class="space-y-2">
      <h2 class="text-xs font-semibold text-ink-muted uppercase tracking-wider px-1">{section.title}</h2>
      <div class="grid grid-cols-2 gap-2">
        {#each section.items as item}
          <a
            href={item.href}
            class="bg-surface rounded-xl border border-warm-100 p-3 hover:border-accent/30 transition-colors block"
          >
            <span class="text-2xl mb-1.5 block">{item.icon}</span>
            <p class="text-sm font-medium text-ink">{item.label}</p>
            <p class="text-xs text-ink-muted mt-0.5">{item.desc}</p>
          </a>
        {/each}
      </div>
    </div>
  {/each}
</div>
