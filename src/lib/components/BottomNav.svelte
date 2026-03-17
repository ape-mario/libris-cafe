<script lang="ts">
  import { page } from '$app/state';
  import { t } from '$lib/i18n/index.svelte';

  let tabs = $derived([
    { href: '/', label: t('nav.library'), icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>` },
    { href: '/browse', label: t('nav.browse'), icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>` },
    { href: '/mine', label: t('nav.mine'), icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>` }
  ]);

  function isActive(href: string) {
    if (href === '/') return page.url.pathname === '/';
    return page.url.pathname.startsWith(href);
  }
</script>

<nav class="fixed bottom-0 left-0 right-0 z-50 backdrop-blur-lg bg-cream/80 border-t border-warm-100">
  <div class="max-w-2xl mx-auto flex justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
    {#each tabs as tab}
      <a
        href={tab.href}
        class="flex flex-col items-center gap-1 px-6 py-1.5 rounded-xl transition-all {isActive(tab.href) ? 'text-accent' : 'text-ink-muted hover:text-ink-light'}"
      >
        <span class="transition-transform {isActive(tab.href) ? 'scale-110' : ''}">{@html tab.icon}</span>
        <span class="text-[10px] font-semibold tracking-wide uppercase">{tab.label}</span>
      </a>
    {/each}
  </div>
</nav>
