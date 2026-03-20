<script lang="ts">
  import '../app.css';
  import { onMount, onDestroy } from 'svelte';
  import { getCurrentUser, restoreUser, userStore } from '$lib/stores/user.svelte';
  import ProfilePicker from '$lib/components/ProfilePicker.svelte';
  import TopBar from '$lib/components/TopBar.svelte';
  import BottomNav from '$lib/components/BottomNav.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import Dialog from '$lib/components/Dialog.svelte';
  import { t } from '$lib/i18n/index.svelte';
  import { getLocale, localeStore } from '$lib/i18n/index.svelte';
  import { cacheAllCovers } from '$lib/services/coverCache';
  import { initTheme } from '$lib/stores/theme.svelte';
  import { initDoc } from '$lib/db';
  import { page } from '$app/state';

  let { children } = $props();
  let loaded = $state(false);
  let initError = $state<string | null>(null);
  let user = $derived(userStore.current);
  let locale = $derived(localeStore.current);

  // PWA install prompt
  let deferredPrompt = $state<Event | null>(null);
  let showInstallBanner = $state(false);
  let pwaHandler: ((e: Event) => void) | null = null;
  let showScrollTop = $state(false);
  let scrollHandler: (() => void) | null = null;

  function dismissInstall() {
    showInstallBanner = false;
    deferredPrompt = null;
    try { localStorage.setItem('libris_pwa_dismissed', '1'); } catch {}
  }

  async function handleInstall() {
    if (!deferredPrompt) return;
    (deferredPrompt as any).prompt();
    await (deferredPrompt as any).userChoice;
    dismissInstall(); // prompt can only be used once regardless of outcome
  }

  $effect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
    }
  });

  onMount(async () => {
    initTheme();

    // Scroll-to-top button visibility
    scrollHandler = () => {
      showScrollTop = window.scrollY > 600;
    };
    window.addEventListener('scroll', scrollHandler, { passive: true });

    // PWA install prompt
    const dismissed = localStorage.getItem('libris_pwa_dismissed');
    if (!dismissed) {
      pwaHandler = (e: Event) => {
        e.preventDefault();
        deferredPrompt = e;
        showInstallBanner = true;
      };
      window.addEventListener('beforeinstallprompt', pwaHandler);
    }

    // Install global error handler
    const { installGlobalErrorHandler, logError } = await import('$lib/services/logger');
    installGlobalErrorHandler();

    // First-time setup redirect: if Supabase is not configured and setup hasn't been done
    try {
      const { supabase: sb } = await import('$lib/supabase/client');
      const setupDone = localStorage.getItem('libris_setup_done');
      if (!sb && !setupDone && !page.url.pathname.startsWith('/setup')) {
        const { goto: nav } = await import('$app/navigation');
        nav((await import('$app/paths')).base + '/setup');
        return;
      }
    } catch {}

    // Initialize Y.Doc with IndexedDB persistence
    try {
      await initDoc();
    } catch (e) {
      logError('Failed to initialize database', { error: String(e) });
      initError = e instanceof DOMException && e.name === 'QuotaExceededError'
        ? 'Storage is full. Please free up space and reload.'
        : 'Failed to load your library. Please reload the page.';
      return;
    }

    // Run one-time Dexie→Yjs migration if needed
    try {
      const { migrateFromDexie, shouldCleanupDexie, cleanupDexie } = await import('$lib/db/migrate');
      await migrateFromDexie((await import('$lib/db')).doc);

      if (shouldCleanupDexie()) {
        await cleanupDexie();
      }
    } catch (e) {
      console.warn('[Libris] Migration check failed:', e);
    }

    // Handle /join/[code] URL or auto-reconnect to previous room.
    // Must happen before restoreUser so sync starts immediately.
    try {
      const { joinRoom, autoReconnect } = await import('$lib/sync/manager');
      const { isValidRoomCode, formatRoomCode } = await import('$lib/sync/room');

      const joinMatch = page.url.pathname.match(/\/join\/([A-Za-z2-9-]+)$/);
      if (joinMatch) {
        const code = formatRoomCode(joinMatch[1]);
        if (isValidRoomCode(code)) {
          joinRoom(code);
        }
      } else {
        autoReconnect();
      }
    } catch (e) {
      console.warn('[Libris] Sync setup failed:', e);
    }

    restoreUser();

    // Restore staff session from Supabase (if previously logged in)
    try {
      const { restoreSession } = await import('$lib/modules/auth/service');
      const { setCurrentStaff } = await import('$lib/modules/auth/stores.svelte');
      const session = await restoreSession();
      if (session) {
        setCurrentStaff(session.staff);

        // Init notification subscription
        try {
          const { subscribeToNotifications } = await import('$lib/modules/notification/realtime');
          const { getNotifications: fetchNotifs } = await import('$lib/modules/notification/service');
          const { setNotifications, setUnreadCount } = await import('$lib/modules/notification/stores.svelte');

          const notifs = await fetchNotifs(session.staff.id);
          setNotifications(notifs);
          setUnreadCount(notifs.filter(n => !n.read).length);

          const { showToast } = await import('$lib/stores/toast.svelte');
          subscribeToNotifications(session.staff.id, (title) => showToast(title, 'info'));
        } catch {
          // Notification module not available or error — continue silently
        }
      }
    } catch {
      // Supabase not configured or session expired — continue as guest
    }

    // Listen for auth state changes (session expiry, logout in another tab)
    try {
      const { supabase } = await import('$lib/supabase/client');
      if (supabase) {
        supabase.auth.onAuthStateChange((event: string, session: unknown) => {
          if (event === 'SIGNED_OUT' || !session) {
            import('$lib/modules/auth/stores.svelte').then(({ setCurrentStaff }) => {
              setCurrentStaff(null);
            });
            // Unsubscribe from realtime notifications to prevent leaked subscriptions
            try {
              import('$lib/modules/notification/realtime').then(({ unsubscribeFromNotifications }) => {
                unsubscribeFromNotifications();
              });
            } catch {}
            // Clear all session-scoped stores
            import('$lib/modules/notification/stores.svelte').then(({ clearNotifications }) => {
              clearNotifications();
            }).catch(() => {});
            import('$lib/modules/pos/stores.svelte').then(({ resetCart }) => {
              resetCart();
            }).catch(() => {});
          }
        });
      }
    } catch {}

    // Signal that auth restoration is complete
    {
      const { setAuthReady } = await import('$lib/modules/auth/stores.svelte');
      setAuthReady(true);
    }

    // Init sync manager for offline queue
    try {
      const { initSyncManager } = await import('$lib/modules/sync/manager');
      initSyncManager();
    } catch {}

    // Load public availability for guest browse (anonymous Supabase call)
    try {
      const { setAvailabilityOutlet, fetchAvailability } = await import('$lib/modules/inventory/public-availability');
      const { supabase } = await import('$lib/supabase/client');
      if (supabase) {
        const { data } = await supabase.from('outlet').select('id').limit(1).single();
        if (data?.id) {
          setAvailabilityOutlet(data.id);
          fetchAvailability();
        }
      }
    } catch {
      // Supabase not configured — browse works without availability
    }

    loaded = true;
    setTimeout(() => cacheAllCovers(), 3000);
  });

  onDestroy(() => {
    if (pwaHandler) window.removeEventListener('beforeinstallprompt', pwaHandler);
    if (scrollHandler) window.removeEventListener('scroll', scrollHandler);
  });
</script>

{#if initError}
  <div class="min-h-screen bg-cream flex items-center justify-center p-6">
    <div class="text-center max-w-sm">
      <div class="w-16 h-16 rounded-2xl bg-berry/10 mx-auto mb-4 flex items-center justify-center">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-berry"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
      </div>
      <p class="font-display text-lg text-ink font-semibold mb-2">{t('error.generic')}</p>
      <p class="text-sm text-ink-muted mb-6">{initError}</p>
      <button class="btn-primary" onclick={() => location.reload()}>{t('app.reload')}</button>
    </div>
  </div>
{:else if !loaded}
  <div class="min-h-screen bg-cream flex items-center justify-center">
    <div class="animate-fade-in flex flex-col items-center gap-3">
      <span class="font-display text-2xl text-ink font-semibold tracking-tight">{t('app.name')}</span>
      <div class="w-8 h-0.5 bg-warm-300 rounded-full animate-pulse"></div>
    </div>
  </div>
{:else if !user}
  <ProfilePicker />
{:else}
  {#if showInstallBanner}
    <div class="fixed top-0 left-0 right-0 z-50 bg-accent text-cream px-4 py-2.5 flex items-center gap-3 animate-fade-up">
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold">{t('pwa.install')}</p>
        <p class="text-xs opacity-80">{t('pwa.install_desc')}</p>
      </div>
      <button class="bg-cream/20 hover:bg-cream/30 text-cream text-xs font-medium px-3 py-1.5 rounded-lg transition-colors" onclick={handleInstall}>{t('pwa.install')}</button>
      <button class="text-cream/60 hover:text-cream text-lg leading-none" onclick={dismissInstall}>&#215;</button>
    </div>
  {/if}
  <TopBar />
  <main class="pt-20 pb-24 px-5 min-h-screen bg-cream max-w-2xl mx-auto noise-bg">
    {@render children()}
  </main>
  <BottomNav />
  {#if showScrollTop}
    <button
      class="fixed bottom-20 right-4 z-40 w-10 h-10 rounded-full bg-surface border border-warm-100 shadow-lg flex items-center justify-center text-ink-muted hover:text-accent transition-all animate-scale-in"
      onclick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Scroll to top"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>
    </button>
  {/if}
{/if}

<Toast />
<Dialog />
