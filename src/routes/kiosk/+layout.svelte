<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { IdleTimer } from '$lib/modules/kiosk/idle-timer';
  import { getKioskStore } from '$lib/modules/kiosk/stores.svelte';
  import { t } from '$lib/i18n/index.svelte';
  import IdleOverlay from '$lib/components/kiosk/IdleOverlay.svelte';
  import KioskHeader from '$lib/components/kiosk/KioskHeader.svelte';

  let { children } = $props();

  const kiosk = getKioskStore();
  let idleTimer: IdleTimer | null = null;

  function handleIdle() {
    kiosk.setIdle();
    // Reset to kiosk home
    goto(`${base}/kiosk`);
  }

  function handleCountdown(seconds: number) {
    kiosk.setCountdown(seconds);
  }

  function handleInteraction() {
    kiosk.setActive();
  }

  onMount(() => {
    // Enable kiosk mode
    kiosk.enable();

    // Request fullscreen if configured
    if (kiosk.config.auto_fullscreen && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {
        // Fullscreen may be blocked by browser policy — continue anyway
      });
    }

    // Start idle timer
    idleTimer = new IdleTimer({
      timeoutMs: kiosk.config.idle_timeout_ms,
      onIdle: handleIdle,
      onCountdown: handleCountdown,
      warningMs: 10000,
    });
    idleTimer.start();

    // Set active on first interaction
    document.addEventListener('touchstart', handleInteraction, { once: true });
  });

  onDestroy(() => {
    idleTimer?.stop();
    kiosk.disable();

    // Exit fullscreen
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  });
</script>

<div class="kiosk-container min-h-screen bg-cream flex flex-col select-none">
  <KioskHeader cafeName={kiosk.config.cafe_name} logoUrl={kiosk.config.cafe_logo_url} />

  <main class="flex-1 overflow-y-auto p-4">
    {@render children()}
  </main>

  {#if kiosk.state === 'idle'}
    <IdleOverlay
      welcomeMessage={t('kiosk.welcome')}
      cafeName={kiosk.config.cafe_name}
      ontap={handleInteraction}
    />
  {/if}

  {#if kiosk.countdownSeconds !== null && kiosk.countdownSeconds > 0}
    <div class="fixed bottom-4 left-1/2 -translate-x-1/2 bg-amber-500 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg z-40">
      {t('kiosk.resetIn', { seconds: kiosk.countdownSeconds })}
    </div>
  {/if}
</div>

<style>
  .kiosk-container {
    /* Prevent pull-to-refresh and overscroll on tablet */
    overscroll-behavior: none;
    touch-action: pan-y;
    /* Hide scrollbar for cleaner kiosk look */
    &::-webkit-scrollbar { display: none; }
  }
</style>
