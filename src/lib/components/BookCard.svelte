<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Book } from '$lib/db';
  import { getCoverBase64 } from '$lib/services/coverCache';
  import { getCurrentUser } from '$lib/stores/user.svelte';
  import { getUserBookData, setUserBookData } from '$lib/services/userbooks';

  let { book, onclick }: { book: Book; onclick?: () => void } = $props();

  let coverSrc = $state<string | null>(book.coverUrl || null);
  let coverLoading = $state(!!book.coverUrl);
  let showQuickMenu = $state(false);
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let menuJustOpened = false;

  onMount(async () => {
    const base64 = await getCoverBase64(book.id);
    if (base64) {
      coverSrc = base64;
    }
    coverLoading = false;
    document.addEventListener('click', closeMenu);
  });

  onDestroy(() => {
    document.removeEventListener('click', closeMenu);
  });

  function closeMenu() {
    // Skip close if menu was just opened (iOS Safari fires click after long-press)
    if (menuJustOpened) {
      menuJustOpened = false;
      return;
    }
    showQuickMenu = false;
  }

  function startLongPress() {
    longPressTimer = setTimeout(() => {
      showQuickMenu = true;
      menuJustOpened = true;
      setTimeout(() => { menuJustOpened = false; }, 100);
    }, 500);
  }

  function cancelLongPress() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function quickSetStatus(status: 'read' | 'reading' | 'unread' | 'dnf') {
    const user = getCurrentUser();
    if (!user) return;
    setUserBookData(user.id, book.id, { status });
    showQuickMenu = false;
  }

  let currentStatus = $derived.by(() => {
    const user = getCurrentUser();
    return user ? getUserBookData(user.id, book.id)?.status : undefined;
  });

  const statusDot: Record<string, string> = {
    read: 'bg-sage',
    reading: 'bg-accent',
    dnf: 'bg-berry',
    unread: 'bg-warm-300'
  };
</script>

<button
  class="book-card group flex flex-col gap-2.5 w-[7.5rem] text-left relative"
  {onclick}
  onpointerdown={startLongPress}
  onpointerup={cancelLongPress}
  onpointerleave={cancelLongPress}
>
  <div class="relative w-[7.5rem] h-[10.5rem] rounded-lg overflow-hidden book-cover-shadow transition-all duration-300 flex-shrink-0 bg-warm-100">
    {#if coverSrc}
      <img src={coverSrc} alt={book.title} class="w-full h-full object-cover" />
    {:else if coverLoading}
      <div class="w-full h-full flex items-center justify-center bg-warm-100">
        <div class="w-6 h-0.5 bg-warm-200 rounded-full animate-pulse"></div>
      </div>
    {:else}
      <div class="w-full h-full flex flex-col items-center justify-center px-3 text-center bg-gradient-to-br from-warm-100 to-warm-200">
        <span class="font-display text-xs font-semibold text-ink-light leading-snug">{book.title}</span>
        <span class="text-[9px] text-ink-muted mt-1">{(book.authors || []).join(', ')}</span>
      </div>
    {/if}
    <div class="absolute left-0 top-0 bottom-0 w-[3px] bg-black/[0.06] dark:bg-white/[0.08]"></div>
    {#if currentStatus}
      <div class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full {statusDot[currentStatus] || 'bg-warm-300'} ring-1 ring-surface"></div>
    {/if}
  </div>
  <div class="w-full px-0.5">
    <h3 class="font-display text-[11px] font-semibold text-ink leading-tight truncate">{book.title}</h3>
    <p class="text-[10px] text-ink-muted truncate mt-0.5">{(book.authors || []).join(', ')}</p>
  </div>

  {#if showQuickMenu}
    <div class="quick-menu absolute top-0 left-0 right-0 z-20 card p-1.5 shadow-lg animate-scale-in" onclick={(e: MouseEvent) => e.stopPropagation()}>
      {#each [
        { status: 'read' as const, label: '✓ Read', dot: 'bg-sage' },
        { status: 'reading' as const, label: '◉ Reading', dot: 'bg-accent' },
        { status: 'unread' as const, label: '○ Unread', dot: 'bg-warm-300' },
        { status: 'dnf' as const, label: '✕ DNF', dot: 'bg-berry' }
      ] as opt}
        <button
          class="w-full text-left text-[10px] font-medium px-2 py-1.5 rounded-md transition-colors {currentStatus === opt.status ? 'bg-warm-100 text-ink' : 'text-ink-light hover:bg-warm-100'}"
          onclick={(e: MouseEvent) => { e.stopPropagation(); quickSetStatus(opt.status); }}
        >
          <span class="inline-block w-1.5 h-1.5 rounded-full {opt.dot} mr-1.5 align-middle"></span>
          {opt.label}
        </button>
      {/each}
    </div>
  {/if}
</button>

<style>
  .book-card {
    content-visibility: auto;
    contain-intrinsic-size: 7.5rem 13rem;
  }
</style>
