<script lang="ts">
  import { getCurrentUser, setCurrentUser } from '$lib/stores/user.svelte';

  let user = $derived(getCurrentUser());
</script>

<header class="fixed top-0 left-0 right-0 bg-slate-900 border-b border-slate-700 flex items-center justify-between px-4 py-3 z-50">
  <button
    class="flex items-center gap-2 text-sm text-slate-300 hover:text-white"
    onclick={() => setCurrentUser(null)}
  >
    <span class="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-base">
      {user?.avatar || user?.name?.[0]?.toUpperCase() || '?'}
    </span>
    <span>{user?.name || 'Select Profile'}</span>
  </button>

  <a href="/add" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-500">
    + Add
  </a>
</header>
