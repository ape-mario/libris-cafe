<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { getCurrentUser } from '$lib/stores/user.svelte';
  import { getUserShelves, createShelf, deleteShelf } from '$lib/services/shelves';
  import { q } from '$lib/db';
  import { getBookById } from '$lib/services/books';
  import type { Shelf, Book } from '$lib/db';
  import { showConfirm } from '$lib/stores/dialog.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import { t } from '$lib/i18n/index.svelte';
  import BookCard from '$lib/components/BookCard.svelte';

  let user = $derived(getCurrentUser());
  let shelves = $state<(Shelf & { books: Book[] })[]>([]);
  let loading = $state(true);
  let newShelfName = $state('');
  let showCreate = $state(false);

  let unsub: (() => void)[] = [];
  onMount(() => {
    loadShelves();
    unsub = [q.observe('shelves', () => loadShelves()), q.observe('books', () => loadShelves())];
  });
  onDestroy(() => unsub.forEach(f => f()));

  function loadShelves() {
    if (!user) return;
    loading = true;
    const raw = getUserShelves(user.id);
    shelves = raw.map((shelf) => {
      const books = shelf.bookIds
        .map((id) => getBookById(id))
        .filter(Boolean) as Book[];
      return { ...shelf, books };
    });
    loading = false;
  }

  function handleCreate() {
    if (!newShelfName.trim() || !user) return;
    createShelf(user.id, newShelfName.trim());
    showToast(t('toast.shelf_created'), 'success');
    newShelfName = '';
    showCreate = false;
    loadShelves();
  }

  async function handleDelete(shelf: Shelf) {
    const confirmed = await showConfirm({
      title: t('shelves.delete_confirm', { name: shelf.name }),
      danger: true,
      confirmLabel: t('dialog.delete_confirm')
    });
    if (!confirmed) return;
    deleteShelf(shelf.id);
    showToast(t('toast.shelf_deleted'), 'info');
    loadShelves();
  }
</script>

<div class="max-w-lg mx-auto animate-fade-up">
  <div class="flex items-end justify-between mb-6">
    <h1 class="font-display text-2xl font-bold text-ink tracking-tight">{t('shelves.title')}</h1>
    <button
      class="text-xs font-medium text-accent hover:text-accent-dark transition-colors"
      onclick={() => showCreate = !showCreate}
    >+ {t('shelves.create')}</button>
  </div>

  {#if showCreate}
    <form class="flex gap-2 mb-6 animate-fade-up" onsubmit={(e) => { e.preventDefault(); handleCreate(); }}>
      <input
        type="text"
        bind:value={newShelfName}
        placeholder={t('shelves.create_placeholder')}
        class="input-field flex-1"
        autofocus
      />
      <button type="submit" class="btn-primary">{t('shelves.create')}</button>
    </form>
  {/if}

  {#if loading}
    <div class="flex justify-center py-16">
      <div class="w-8 h-0.5 bg-warm-300 rounded-full animate-pulse"></div>
    </div>
  {:else if shelves.length === 0}
    <div class="text-center py-16">
      <div class="w-16 h-16 rounded-2xl bg-warm-100 mx-auto mb-4 flex items-center justify-center">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-warm-400"><path d="M16 6H3"/><path d="M21 12H8"/><path d="M21 18H8"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>
      </div>
      <p class="text-sm text-ink-muted">{t('shelves.empty')}</p>
    </div>
  {:else}
    <div class="flex flex-col gap-6">
      {#each shelves as shelf, i}
        <div class="animate-fade-up" style="animation-delay: {i * 40}ms">
          <div class="flex items-center justify-between mb-3">
            <h2 class="font-display text-base font-semibold text-ink">{shelf.name}</h2>
            <div class="flex items-center gap-3">
              <span class="text-xs text-ink-muted">{shelf.books.length}</span>
              <button
                class="text-xs text-warm-400 hover:text-berry transition-colors"
                aria-label={t('shelves.delete')}
                onclick={() => handleDelete(shelf)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              </button>
            </div>
          </div>

          {#if shelf.books.length > 0}
            <div class="flex gap-3 overflow-x-auto pb-2">
              {#each shelf.books as book}
                <div class="flex-shrink-0">
                  <BookCard {book} onclick={() => goto(`${base}/book/${book.id}`)} />
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-sm text-ink-muted py-4 text-center bg-warm-50 rounded-xl">{t('shelves.shelf_empty')}</p>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
