<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { getCurrentUser, setCurrentUser } from '$lib/stores/user.svelte';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { getSyncStatus, getRoomCode, onSyncStatusChange } from '$lib/sync/manager';
  import type { SyncStatus } from '$lib/sync/provider';
  import { getCurrentStaff, isStaff } from '$lib/modules/auth/stores.svelte';
  import { getUnreadCount } from '$lib/modules/notification/stores.svelte';
  import { getIsOnline } from '$lib/modules/sync/manager';

  let user = $derived(getCurrentUser());
  let online = $state(true);
  let syncStatus = $state<SyncStatus>('disconnected');
  let roomCode = $state<string | null>(null);
  let unsubSync: (() => void) | null = null;

  const statusColors: Record<SyncStatus, string> = {
    connected: 'bg-sage',
    connecting: 'bg-gold animate-pulse',
    disconnected: 'bg-warm-300',
    offline: 'bg-warm-400'
  };

  onMount(() => {
    online = navigator.onLine;
    const onOnline = () => { online = true; };
    const onOffline = () => { online = false; };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    roomCode = getRoomCode();
    syncStatus = getSyncStatus();
    unsubSync = onSyncStatusChange((s) => { syncStatus = s; });

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      unsubSync?.();
    };
  });
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
      <!-- Staff badge -->
      {#if isStaff()}
        <span class="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full font-medium">
          {getCurrentStaff()?.name} · {getCurrentStaff()?.role}
        </span>
      {/if}
      <!-- Offline queue indicator -->
      {#if !getIsOnline()}
        <span class="text-xs bg-berry/10 text-berry px-2 py-0.5 rounded-full font-medium">
          Offline
        </span>
      {/if}
      <!-- Notification bell -->
      {#if isStaff()}
        <a href="{base}/staff/notifications" class="relative w-9 h-9 rounded-lg flex items-center justify-center text-ink-muted hover:bg-warm-100 transition-colors" aria-label={t('nav.notifications')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
          </svg>
          {#if getUnreadCount() > 0}
            <span class="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-berry text-cream text-[10px] font-bold flex items-center justify-center">
              {getUnreadCount() > 9 ? '9+' : getUnreadCount()}
            </span>
          {/if}
        </a>
      {/if}
      <!-- Sync indicator -->
      {#if !online}
        <span class="text-[10px] text-warm-400 font-medium uppercase tracking-wider">Offline</span>
      {:else if roomCode}
        <a href="{base}/settings" class="flex items-center gap-1.5" title="{syncStatus}">
          <div class="w-1.5 h-1.5 rounded-full {statusColors[syncStatus]}"></div>
        </a>
      {/if}

      <a href="{base}/settings" class="w-9 h-9 rounded-lg flex items-center justify-center text-ink-muted hover:bg-warm-100 transition-colors" aria-label={t('settings.title')}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </a>
      <a href="{base}/add" class="btn-primary !py-2 !px-4 !text-xs">
        {t('topbar.add')}
      </a>
    </div>
  </div>
</header>
