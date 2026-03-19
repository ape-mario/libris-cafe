<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/state';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { getBooks } from '$lib/services/books';
  import { q } from '$lib/db';
  import { isStaff, isOwner } from '$lib/modules/auth/stores.svelte';

  let bookCount = $state(0);
  let unsubBooks: (() => void) | null = null;

  onMount(() => {
    bookCount = getBooks().length;
    unsubBooks = q.observe('books', () => {
      bookCount = getBooks().length;
    });
  });

  onDestroy(() => {
    unsubBooks?.();
  });

  const icons = {
    book: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>`,
    heart: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
    grid: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>`,
    list: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 6H3"/><path d="M21 12H8"/><path d="M21 18H8"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>`,
    chart: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>`,
    pos: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01"/><path d="M10 8h.01"/><path d="M14 8h.01"/><path d="M18 8h.01"/><path d="M6 12h.01"/><path d="M10 12h.01"/><path d="M14 12h.01"/><path d="M18 12h.01"/><path d="M6 16h12"/></svg>`,
    inventory: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`,
  };

  let guestTabs = $derived([
    { href: `${base}/`, label: t('nav.library'), icon: icons.book },
    { href: `${base}/mine`, label: t('nav.mine'), icon: icons.heart },
    { href: `${base}/browse`, label: t('nav.browse'), icon: icons.grid },
    { href: `${base}/shelves`, label: t('nav.shelves'), icon: icons.list },
    { href: `${base}/stats`, label: t('nav.stats'), icon: icons.chart },
  ]);

  // Staff tabs (includes lending)
  let staffTabs = $derived([
    { href: `${base}/staff/pos`, label: t('nav.pos'), icon: icons.pos },
    { href: `${base}/staff/inventory`, label: t('nav.inventory'), icon: icons.inventory },
    { href: `${base}/staff/lending`, label: t('lending.title'), icon: icons.book },
    { href: `${base}/browse`, label: t('nav.browse'), icon: icons.grid },
    { href: `${base}/staff/dashboard`, label: t('nav.dashboard'), icon: icons.chart },
  ]);

  // Owner tabs (full dashboard + manage hub)
  let ownerTabs = $derived([
    { href: `${base}/staff/pos`, label: t('nav.pos'), icon: icons.pos },
    { href: `${base}/owner/dashboard`, label: t('nav.dashboard'), icon: icons.chart },
    { href: `${base}/staff/inventory`, label: t('nav.inventory'), icon: icons.inventory },
    { href: `${base}/staff/lending`, label: t('lending.title'), icon: icons.book },
    { href: `${base}/owner/manage`, label: 'Manage', icon: icons.list },
  ]);

  let tabs = $derived(isOwner() ? ownerTabs : isStaff() ? staffTabs : guestTabs);

  function isActive(href: string) {
    const path = href.replace(base, '') || '/';
    if (path === '/') return page.url.pathname === `${base}/`;
    return page.url.pathname.startsWith(href);
  }
</script>

<nav class="fixed bottom-0 left-0 right-0 z-50 backdrop-blur-lg bg-cream/80 border-t border-warm-100">
  <div class="max-w-2xl mx-auto flex justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
    {#each tabs as tab}
      <a
        href={tab.href}
        class="nav-item flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-all {isActive(tab.href) ? 'text-accent nav-active' : 'text-ink-muted hover:text-ink-light'}"
      >
        <span class="relative transition-transform {isActive(tab.href) ? 'scale-110' : ''}">
          {@html tab.icon}
          {#if tab.href === `${base}/` && bookCount > 0}
            <span class="book-count-badge">{bookCount}</span>
          {/if}
        </span>
        <span class="text-[9px] font-semibold tracking-wide uppercase">{tab.label}</span>
      </a>
    {/each}
  </div>
</nav>

<style>
  .book-count-badge {
    position: absolute;
    top: -6px;
    right: -10px;
    min-width: 16px;
    height: 14px;
    padding: 0 3px;
    border-radius: 7px;
    background: var(--color-accent);
    color: var(--color-cream);
    font-size: 8px;
    font-weight: 700;
    line-height: 14px;
    text-align: center;
    pointer-events: none;
  }
  .nav-item {
    position: relative;
  }
  .nav-active::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--color-accent);
    animation: dotIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  @keyframes dotIn {
    from { transform: translateX(-50%) scale(0); }
    to { transform: translateX(-50%) scale(1); }
  }
</style>
