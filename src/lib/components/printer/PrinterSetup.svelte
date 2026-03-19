<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import { getPrinterStore } from '$lib/modules/printer/stores.svelte';

  const printer = getPrinterStore();
</script>

<div class="bg-base-200 rounded-xl p-4 space-y-3">
  <h3 class="font-semibold text-sm">{t('printer.setup')}</h3>

  {#if printer.isConnected}
    <!-- Connected state -->
    <div class="flex items-center gap-2">
      <div class="w-2 h-2 rounded-full bg-success"></div>
      <span class="text-sm">{printer.deviceName}</span>
      <span class="text-xs text-base-content/50">({printer.connectionType})</span>
    </div>
    <button
      class="w-full py-2 rounded-lg border border-base-300 text-sm"
      onclick={() => printer.disconnect()}
    >
      {t('printer.disconnect')}
    </button>
  {:else}
    <!-- Disconnected state — show connection options -->
    <div class="flex gap-2">
      {#if printer.bluetoothSupported}
        <button
          class="flex-1 py-2 rounded-lg bg-primary text-primary-content text-sm font-medium"
          onclick={() => printer.connect('bluetooth')}
        >
          Bluetooth
        </button>
      {/if}
      {#if printer.usbSupported}
        <button
          class="flex-1 py-2 rounded-lg bg-primary text-primary-content text-sm font-medium"
          onclick={() => printer.connect('usb')}
        >
          USB
        </button>
      {/if}
    </div>

    {#if !printer.bluetoothSupported && !printer.usbSupported}
      <p class="text-xs text-base-content/50">{t('printer.notSupported')}</p>
    {/if}

    {#if printer.error}
      <p class="text-xs text-error">{printer.error}</p>
    {/if}
  {/if}
</div>
