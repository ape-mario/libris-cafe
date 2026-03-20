<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import { getPrinterStore } from '$lib/modules/printer/stores.svelte';

  const printer = getPrinterStore();

  const hasBluetooth = typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  const hasUsb = typeof navigator !== 'undefined' && 'usb' in navigator;
  const isSupported = hasBluetooth || hasUsb;
</script>

<div class="bg-warm-50 rounded-xl p-4 space-y-3">
  <h3 class="font-semibold text-sm">{t('printer.setup')}</h3>

  {#if !isSupported}
    <div class="bg-gold/10 text-gold border border-gold/30 rounded-xl px-4 py-3 text-sm">
      <p class="font-semibold">{t('printer.notSupported')}</p>
      <p class="text-xs mt-1 opacity-80">Thermal printing requires Chrome on desktop or Android.</p>
    </div>
  {:else if printer.isConnected}
    <!-- Connected state -->
    <div class="flex items-center gap-2">
      <div class="w-2 h-2 rounded-full bg-success"></div>
      <span class="text-sm">{printer.deviceName}</span>
      <span class="text-xs text-ink-muted">({printer.connectionType})</span>
    </div>
    <button
      class="w-full py-2 rounded-lg border border-warm-100 text-sm"
      onclick={() => printer.disconnect()}
    >
      {t('printer.disconnect')}
    </button>
  {:else}
    <!-- Disconnected state — show connection options -->
    <div class="flex gap-2">
      <button
        class="flex-1 py-2 rounded-lg bg-accent text-cream text-sm font-medium disabled:opacity-40"
        onclick={() => printer.connect('bluetooth')}
        disabled={!hasBluetooth}
      >
        Bluetooth
      </button>
      <button
        class="flex-1 py-2 rounded-lg bg-accent text-cream text-sm font-medium disabled:opacity-40"
        onclick={() => printer.connect('usb')}
        disabled={!hasUsb}
      >
        USB
      </button>
    </div>

    {#if printer.error}
      <p class="text-xs text-berry">{printer.error}</p>
    {/if}
  {/if}
</div>
