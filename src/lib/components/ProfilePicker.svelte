<script lang="ts">
  import { getAllUsers, createUser, setCurrentUser } from '$lib/stores/user.svelte';
  import type { User } from '$lib/db';
  import { db } from '$lib/db';
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/index.svelte';
  import { getLocale, setLocale } from '$lib/i18n/index.svelte';

  interface UserWithStats extends User {
    bookCount: number;
    readCount: number;
  }

  let users = $state<UserWithStats[]>([]);
  let newName = $state('');
  let showCreate = $state(false);
  let locale = $derived(getLocale());

  const avatarColors = [
    'bg-accent/10 text-accent',
    'bg-sage/10 text-sage',
    'bg-berry/10 text-berry',
    'bg-gold/10 text-warm-700',
    'bg-warm-200 text-warm-700',
  ];

  onMount(async () => {
    await loadUsers();
  });

  async function loadUsers() {
    const allUsers = await getAllUsers();
    const totalBooks = await db.books.count();

    users = await Promise.all(
      allUsers.map(async (user) => {
        const userData = await db.userBookData.where('userId').equals(user.id).toArray();
        const readCount = userData.filter(d => d.status === 'read').length;
        return { ...user, bookCount: totalBooks, readCount };
      })
    );
  }

  async function handleSelect(user: UserWithStats) {
    setCurrentUser(user);
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    await createUser(newName.trim());
    await loadUsers();
    // Auto-select the newly created user (last one)
    const latest = users[users.length - 1];
    if (latest) setCurrentUser(latest);
    newName = '';
    showCreate = false;
  }
</script>

<div class="flex flex-col items-center justify-center min-h-screen bg-cream p-6 relative">
  <!-- Language toggle (top-right) -->
  <button
    class="absolute top-5 right-5 text-xs text-ink-muted hover:text-ink transition-colors font-medium"
    onclick={() => setLocale(locale === 'en' ? 'id' : 'en')}
    aria-label="Switch language"
  >
    {locale === 'en' ? 'ID' : 'EN'}
  </button>

  <div class="animate-fade-up flex flex-col items-center">
    <span class="font-display text-4xl text-ink font-bold tracking-tight mb-2">{t('profile.title')}</span>
    <p class="text-ink-muted text-sm mb-12">{t('profile.subtitle')}</p>

    <div class="flex gap-8 flex-wrap justify-center mb-10">
      {#each users as user, i}
        <button
          class="flex flex-col items-center gap-2.5 group"
          onclick={() => handleSelect(user)}
          style="animation-delay: {i * 40}ms"
          aria-label={user.name}
        >
          <div class="w-20 h-20 rounded-2xl {avatarColors[i % avatarColors.length]} flex items-center justify-center text-2xl font-display font-bold transition-transform group-hover:scale-105 group-hover:shadow-lg">
            {user.avatar || user.name[0].toUpperCase()}
          </div>
          <div class="flex flex-col items-center">
            <span class="text-sm text-ink-light font-medium">{user.name}</span>
            {#if user.bookCount > 0}
              <span class="text-xs text-ink-muted mt-0.5">
                {t('profile.stats', { books: user.bookCount, read: user.readCount })}
              </span>
            {/if}
          </div>
        </button>
      {/each}

      <button
        class="flex flex-col items-center gap-2.5 group"
        onclick={() => showCreate = true}
        aria-label={t('profile.add')}
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
