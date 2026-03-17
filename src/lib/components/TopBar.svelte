<script lang="ts">
  import { getCurrentUser, setCurrentUser } from '$lib/stores/user.svelte';
  import { t } from '$lib/i18n/index.svelte';

  let user = $derived(getCurrentUser());
</script>

<header class="fixed top-0 left-0 right-0 z-50 backdrop-blur-lg bg-cream/80 border-b border-warm-100">
  <div class="max-w-2xl mx-auto flex items-center justify-between px-5 py-3">
    <button
      class="flex items-center gap-2.5 group"
      onclick={() => setCurrentUser(null)}
    >
      <div class="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center text-sm font-display font-bold">
        {user?.avatar || user?.name?.[0]?.toUpperCase() || '?'}
      </div>
      <span class="text-sm font-medium text-ink-light group-hover:text-ink transition-colors">{user?.name || 'Profile'}</span>
    </button>

    <div class="flex items-center gap-2">
      <a href="/settings" class="w-9 h-9 rounded-lg flex items-center justify-center text-ink-muted hover:bg-warm-100 transition-colors">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </a>
      <a href="/add" class="btn-primary !py-2 !px-4 !text-xs">
        {t('topbar.add')}
      </a>
    </div>
  </div>
</header>
