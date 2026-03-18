<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { getCurrentUser, restoreUser } from '$lib/stores/user.svelte';
  import ProfilePicker from '$lib/components/ProfilePicker.svelte';
  import TopBar from '$lib/components/TopBar.svelte';
  import BottomNav from '$lib/components/BottomNav.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import Dialog from '$lib/components/Dialog.svelte';
  import { t } from '$lib/i18n/index.svelte';
  import { getLocale } from '$lib/i18n/index.svelte';
  import { cacheAllCovers } from '$lib/services/coverCache';
  import { initTheme } from '$lib/stores/theme.svelte';
  import { initDoc } from '$lib/db';

  let { children } = $props();
  let loaded = $state(false);
  let user = $derived(getCurrentUser());
  let locale = $derived(getLocale());

  $effect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
    }
  });

  onMount(async () => {
    initTheme();

    // Initialize Y.Doc with IndexedDB persistence
    await initDoc();

    // Run one-time Dexie→Yjs migration if needed
    try {
      const { migrateFromDexie, shouldCleanupDexie, cleanupDexie } = await import('$lib/db/migrate');
      await migrateFromDexie((await import('$lib/db')).doc);

      // Cleanup old Dexie DB after 90 days
      if (shouldCleanupDexie()) {
        await cleanupDexie();
      }
    } catch (e) {
      console.warn('[Libris] Migration check failed:', e);
    }

    restoreUser();
    loaded = true;
    setTimeout(() => cacheAllCovers(), 3000);
  });
</script>

{#if !loaded}
  <div class="min-h-screen bg-cream flex items-center justify-center">
    <div class="animate-fade-in flex flex-col items-center gap-3">
      <span class="font-display text-2xl text-ink font-semibold tracking-tight">{t('app.name')}</span>
      <div class="w-8 h-0.5 bg-warm-300 rounded-full animate-pulse"></div>
    </div>
  </div>
{:else if !user}
  <ProfilePicker />
{:else}
  <TopBar />
  <main class="pt-20 pb-24 px-5 min-h-screen bg-cream max-w-2xl mx-auto noise-bg">
    {@render children()}
  </main>
  <BottomNav />
{/if}

<Toast />
<Dialog />
