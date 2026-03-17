<script lang="ts">
  import { goto } from '$app/navigation';
  import { addBook } from '$lib/services/books';
  import { resizeImage } from '$lib/services/covers';
  import { searchOpenLibrary, lookupByISBN, type OpenLibraryResult } from '$lib/services/openlibrary';

  let mode = $state<'search' | 'manual' | 'scan'>('search');
  let searchQuery = $state('');
  let searchResults = $state<OpenLibraryResult[]>([]);
  let searching = $state(false);

  // Manual form fields
  let title = $state('');
  let authors = $state('');
  let isbn = $state('');
  let categories = $state('');
  let coverFile = $state<File | null>(null);
  let coverPreview = $state<string | null>(null);
  let saving = $state(false);
  let error = $state('');

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    searching = true;
    searchResults = await searchOpenLibrary(searchQuery);
    searching = false;
  }

  async function selectResult(result: OpenLibraryResult) {
    title = result.title;
    authors = result.authors.join(', ');
    isbn = result.isbn || '';
    coverPreview = result.coverUrl || null;
    mode = 'manual';
  }

  async function handleCoverUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    coverFile = file;
    coverPreview = URL.createObjectURL(file);
  }

  async function handleSave() {
    if (!title.trim()) {
      error = 'Title is required';
      return;
    }
    saving = true;
    error = '';

    let coverBlob: Blob | undefined;
    if (coverFile) {
      coverBlob = await resizeImage(coverFile);
    }

    const result = await addBook({
      title: title.trim(),
      authors: authors.split(',').map((a) => a.trim()).filter(Boolean),
      isbn: isbn.trim() || undefined,
      coverUrl: !coverFile && coverPreview ? coverPreview : undefined,
      coverBlob,
      categories: categories.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean)
    });

    if (result === null) {
      error = 'A book with this ISBN already exists';
      saving = false;
      return;
    }

    goto('/');
  }
</script>

<div class="max-w-lg mx-auto">
  <h1 class="text-xl font-bold mb-4">Add Book</h1>

  <!-- Mode tabs -->
  <div class="flex gap-2 mb-6">
    <button
      class="px-4 py-2 rounded-lg text-sm {mode === 'search' ? 'bg-blue-600' : 'bg-slate-800'}"
      onclick={() => mode = 'search'}
    >Search</button>
    <button
      class="px-4 py-2 rounded-lg text-sm {mode === 'manual' ? 'bg-blue-600' : 'bg-slate-800'}"
      onclick={() => mode = 'manual'}
    >Manual</button>
    <button
      class="px-4 py-2 rounded-lg text-sm {mode === 'scan' ? 'bg-blue-600' : 'bg-slate-800'}"
      onclick={() => mode = 'scan'}
    >Scan</button>
  </div>

  <!-- Search mode -->
  {#if mode === 'search'}
    <form class="flex gap-2 mb-4" onsubmit={(e) => { e.preventDefault(); handleSearch(); }}>
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search by title or author..."
        class="flex-1 px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white"
      />
      <button type="submit" class="px-4 py-2 bg-blue-600 rounded-lg" disabled={searching}>
        {searching ? '...' : 'Search'}
      </button>
    </form>

    {#each searchResults as result}
      <button
        class="w-full flex gap-3 p-3 mb-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-left"
        onclick={() => selectResult(result)}
      >
        {#if result.coverUrl}
          <img src={result.coverUrl} alt="" class="w-12 h-16 object-cover rounded" />
        {:else}
          <div class="w-12 h-16 bg-slate-700 rounded flex items-center justify-center text-xs text-slate-500">No cover</div>
        {/if}
        <div>
          <div class="font-medium">{result.title}</div>
          <div class="text-sm text-slate-400">{result.authors.join(', ')}</div>
          {#if result.publishYear}<div class="text-xs text-slate-500">{result.publishYear}</div>{/if}
        </div>
      </button>
    {/each}
  {/if}

  <!-- Scan mode placeholder -->
  {#if mode === 'scan'}
    <p class="text-slate-400">Barcode scanning will be implemented in a later task.</p>
  {/if}

  <!-- Manual mode -->
  {#if mode === 'manual'}
    <form class="flex flex-col gap-4" onsubmit={(e) => { e.preventDefault(); handleSave(); }}>
      {#if coverPreview}
        <img src={coverPreview} alt="Cover" class="w-32 h-44 object-cover rounded mx-auto" />
      {/if}

      <label class="flex flex-col gap-1">
        <span class="text-sm text-slate-400">Cover Image</span>
        <input type="file" accept="image/*" onchange={handleCoverUpload}
          class="text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-slate-700 file:text-white" />
      </label>

      <label class="flex flex-col gap-1">
        <span class="text-sm text-slate-400">Title *</span>
        <input type="text" bind:value={title}
          class="px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white" />
      </label>

      <label class="flex flex-col gap-1">
        <span class="text-sm text-slate-400">Authors (comma-separated)</span>
        <input type="text" bind:value={authors}
          class="px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white" />
      </label>

      <label class="flex flex-col gap-1">
        <span class="text-sm text-slate-400">ISBN</span>
        <input type="text" bind:value={isbn}
          class="px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white" />
      </label>

      <label class="flex flex-col gap-1">
        <span class="text-sm text-slate-400">Categories (comma-separated)</span>
        <input type="text" bind:value={categories} placeholder="e.g. sci-fi, novel"
          class="px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white" />
      </label>

      {#if error}
        <p class="text-red-400 text-sm">{error}</p>
      {/if}

      <button type="submit" class="px-4 py-3 bg-blue-600 rounded-lg hover:bg-blue-500 font-medium" disabled={saving}>
        {saving ? 'Saving...' : 'Add Book'}
      </button>
    </form>
  {/if}
</div>
