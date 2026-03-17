<script lang="ts">
  import { getAllUsers, createUser, setCurrentUser } from '$lib/stores/user.svelte';
  import type { User } from '$lib/db';
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/index.svelte';

  let users = $state<User[]>([]);
  let newName = $state('');
  let showCreate = $state(false);

  const avatarColors = [
    'bg-accent/10 text-accent',
    'bg-sage/10 text-sage',
    'bg-berry/10 text-berry',
    'bg-gold/10 text-warm-700',
    'bg-warm-200 text-warm-700',
  ];

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

<div class="flex flex-col items-center justify-center min-h-screen bg-cream p-6">
  <div class="animate-fade-up flex flex-col items-center">
    <span class="font-display text-4xl text-ink font-bold tracking-tight mb-2">{t('profile.title')}</span>
    <p class="text-ink-muted text-sm mb-12">{t('profile.subtitle')}</p>

    <div class="flex gap-8 flex-wrap justify-center mb-10">
      {#each users as user, i}
        <button
          class="flex flex-col items-center gap-3 group"
          onclick={() => handleSelect(user)}
          style="animation-delay: {i * 80}ms"
        >
          <div class="w-20 h-20 rounded-2xl {avatarColors[i % avatarColors.length]} flex items-center justify-center text-2xl font-display font-bold transition-transform group-hover:scale-105 group-hover:shadow-lg">
            {user.avatar || user.name[0].toUpperCase()}
          </div>
          <span class="text-sm text-ink-light font-medium">{user.name}</span>
        </button>
      {/each}

      <button
        class="flex flex-col items-center gap-3 group"
        onclick={() => showCreate = true}
      >
        <div class="w-20 h-20 rounded-2xl border-2 border-dashed border-warm-300 flex items-center justify-center text-warm-400 text-2xl transition-all group-hover:border-warm-500 group-hover:text-warm-600">
          +
        </div>
        <span class="text-sm text-ink-muted">{t('profile.add')}</span>
      </button>
    </div>

    {#if showCreate}
      <form class="animate-fade-up flex gap-3 w-full max-w-xs" onsubmit={(e) => { e.preventDefault(); handleCreate(); }}>
        <input
          type="text"
          bind:value={newName}
          placeholder={t('profile.placeholder')}
          class="input-field flex-1"
          autofocus
        />
        <button type="submit" class="btn-primary">{t('profile.go')}</button>
      </form>
    {/if}
  </div>
</div>
