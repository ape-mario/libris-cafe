<script lang="ts">
  import { getAllUsers, createUser, setCurrentUser } from '$lib/stores/user.svelte';
  import type { User } from '$lib/db';
  import { onMount } from 'svelte';

  let users = $state<User[]>([]);
  let newName = $state('');
  let showCreate = $state(false);

  onMount(async () => {
    users = await getAllUsers();
  });

  async function handleSelect(user: User) {
    setCurrentUser(user);
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    const user = await createUser(newName.trim());
    users = await getAllUsers();
    setCurrentUser(user);
    newName = '';
    showCreate = false;
  }
</script>

<div class="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white p-4">
  <h1 class="text-2xl font-bold mb-8">Who's reading?</h1>

  <div class="flex gap-6 flex-wrap justify-center mb-8">
    {#each users as user}
      <button
        class="flex flex-col items-center gap-2 p-4 rounded-xl hover:bg-slate-800 transition"
        onclick={() => handleSelect(user)}
      >
        <div class="w-20 h-20 rounded-full bg-slate-700 flex items-center justify-center text-3xl">
          {user.avatar || user.name[0].toUpperCase()}
        </div>
        <span class="text-sm">{user.name}</span>
      </button>
    {/each}

    <button
      class="flex flex-col items-center gap-2 p-4 rounded-xl hover:bg-slate-800 transition"
      onclick={() => showCreate = true}
    >
      <div class="w-20 h-20 rounded-full bg-slate-700 flex items-center justify-center text-3xl border-2 border-dashed border-slate-500">
        +
      </div>
      <span class="text-sm">Add Profile</span>
    </button>
  </div>

  {#if showCreate}
    <form class="flex gap-2" onsubmit={(e) => { e.preventDefault(); handleCreate(); }}>
      <input
        type="text"
        bind:value={newName}
        placeholder="Enter name"
        class="px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white"
      />
      <button type="submit" class="px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-500">
        Create
      </button>
    </form>
  {/if}
</div>
