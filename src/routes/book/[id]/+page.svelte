<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { getBookById, updateBook, deleteBook } from '$lib/services/books';
  import { getUserBookData, setUserBookData } from '$lib/services/userbooks';
  import { resizeImage } from '$lib/services/covers';
  import { getCurrentUser } from '$lib/stores/user.svelte';
  import type { Book, UserBookData } from '$lib/db';

  let book = $state<Book | null>(null);
  let userData = $state<UserBookData | null>(null);
  let user = $derived(getCurrentUser());

  onMount(async () => {
    book = (await getBookById(page.params.id)) || null;
    if (book && user) {
      userData = await getUserBookData(user.id, book.id);
    }
  });

  function getCoverSrc(): string | null {
    if (!book) return null;
    if (book.coverBlob) return URL.createObjectURL(book.coverBlob);
    if (book.coverUrl) return book.coverUrl;
    return null;
  }

  async function updateStatus(status: 'unread' | 'reading' | 'read') {
    if (!user || !book) return;
    userData = await setUserBookData(user.id, book.id, { status });
  }

  async function updateRating(rating: number) {
    if (!user || !book) return;
    userData = await setUserBookData(user.id, book.id, { rating });
  }

  async function updateNotes(e: Event) {
    const textarea = e.target as HTMLTextAreaElement;
    if (!user || !book) return;
    userData = await setUserBookData(user.id, book.id, { notes: textarea.value });
  }

  async function toggleWishlist() {
    if (!user || !book) return;
    userData = await setUserBookData(user.id, book.id, { isWishlist: !userData?.isWishlist });
  }

  async function handleLend() {
    const name = prompt('Lent to:');
    if (!name || !user || !book) return;
    userData = await setUserBookData(user.id, book.id, { lentTo: name, lentDate: new Date() });
  }

  async function handleReturn() {
    if (!user || !book) return;
    userData = await setUserBookData(user.id, book.id, { lentTo: undefined, lentDate: undefined });
  }

  async function handleCoverUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !book) return;
    const blob = await resizeImage(file);
    await updateBook(book.id, { coverBlob: blob });
    book = await getBookById(book.id) || null;
  }

  async function handleDelete() {
    if (!book || !confirm(`Delete "${book.title}"?`)) return;
    await deleteBook(book.id);
    goto('/');
  }
</script>

{#if !book}
  <p class="text-slate-400">Book not found.</p>
{:else}
  <div class="max-w-lg mx-auto">
    <!-- Cover -->
    <div class="flex flex-col items-center mb-6">
      {#if getCoverSrc()}
        <img src={getCoverSrc()} alt={book.title} class="w-40 h-56 object-cover rounded-lg shadow-lg" />
      {:else}
        <div class="w-40 h-56 bg-slate-800 rounded-lg flex items-center justify-center text-slate-500">No cover</div>
      {/if}
      <label class="mt-2 text-xs text-blue-400 cursor-pointer">
        Change cover
        <input type="file" accept="image/*" class="hidden" onchange={handleCoverUpload} />
      </label>
    </div>

    <!-- Metadata -->
    <h1 class="text-2xl font-bold">{book.title}</h1>
    <p class="text-slate-400">{book.authors.join(', ')}</p>
    {#if book.isbn}<p class="text-xs text-slate-500 mt-1">ISBN: {book.isbn}</p>{/if}

    {#if book.categories.length}
      <div class="flex gap-2 mt-3 flex-wrap">
        {#each book.categories as cat}
          <span class="text-xs px-3 py-1 bg-slate-800 rounded-full">{cat}</span>
        {/each}
      </div>
    {/if}

    <!-- Reading Status -->
    <div class="mt-6">
      <h2 class="text-sm font-medium text-slate-400 mb-2">Reading Status</h2>
      <div class="flex gap-2">
        {#each ['unread', 'reading', 'read'] as status}
          <button
            class="px-4 py-2 rounded-lg text-sm capitalize {userData?.status === status ? 'bg-blue-600' : 'bg-slate-800'}"
            onclick={() => updateStatus(status as 'unread' | 'reading' | 'read')}
          >{status}</button>
        {/each}
      </div>
    </div>

    <!-- Rating -->
    <div class="mt-6">
      <h2 class="text-sm font-medium text-slate-400 mb-2">Rating</h2>
      <div class="flex gap-1">
        {#each [1, 2, 3, 4, 5] as star}
          <button
            class="text-2xl {(userData?.rating || 0) >= star ? 'text-yellow-400' : 'text-slate-600'}"
            onclick={() => updateRating(star)}
          >★</button>
        {/each}
      </div>
    </div>

    <!-- Notes -->
    <div class="mt-6">
      <h2 class="text-sm font-medium text-slate-400 mb-2">Notes</h2>
      <textarea
        class="w-full h-24 px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm resize-none"
        placeholder="Your thoughts..."
        value={userData?.notes || ''}
        onblur={updateNotes}
      ></textarea>
    </div>

    <!-- Lending -->
    <div class="mt-6">
      <h2 class="text-sm font-medium text-slate-400 mb-2">Lending</h2>
      {#if userData?.lentTo}
        <div class="flex items-center justify-between bg-slate-800 p-3 rounded-lg">
          <span>Lent to <strong>{userData.lentTo}</strong></span>
          <button class="text-sm text-blue-400" onclick={handleReturn}>Mark returned</button>
        </div>
      {:else}
        <button class="px-4 py-2 bg-slate-800 rounded-lg text-sm" onclick={handleLend}>Lend this book</button>
      {/if}
    </div>

    <!-- Actions -->
    <div class="mt-6 flex gap-3">
      <button
        class="flex-1 px-4 py-2 rounded-lg text-sm {userData?.isWishlist ? 'bg-yellow-600' : 'bg-slate-800'}"
        onclick={toggleWishlist}
      >{userData?.isWishlist ? 'In Wishlist' : 'Add to Wishlist'}</button>
      <button class="px-4 py-2 bg-red-900 rounded-lg text-sm" onclick={handleDelete}>Delete</button>
    </div>
  </div>
{/if}
