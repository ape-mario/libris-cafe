<script lang="ts">
  import Quagga from '@ericblade/quagga2';
  import { onMount, onDestroy } from 'svelte';
  import { t } from '$lib/i18n/index.svelte';

  let { onDetected }: { onDetected: (code: string) => void } = $props();
  let scannerRef: HTMLDivElement;
  let active = $state(false);
  let error = $state('');

  onMount(() => {
    Quagga.init(
      {
        inputStream: {
          type: 'LiveStream',
          target: scannerRef,
          constraints: { facingMode: 'environment', width: 640, height: 480 }
        },
        decoder: {
          readers: ['ean_reader', 'ean_8_reader', 'upc_reader']
        }
      },
      (err: any) => {
        if (err) {
          error = t('scanner.error');
          return;
        }
        Quagga.start();
        active = true;
      }
    );

    Quagga.onDetected((result: any) => {
      const code = result.codeResult?.code;
      if (code) {
        Quagga.stop();
        active = false;
        onDetected(code);
      }
    });
  });

  onDestroy(() => {
    if (active) Quagga.stop();
  });
</script>

<div class="relative animate-fade-in">
  {#if error}
    <div class="card p-4 mb-3 border-berry/20">
      <p class="text-berry text-sm font-medium">{error}</p>
    </div>
  {/if}
  <div bind:this={scannerRef} class="w-full rounded-xl overflow-hidden bg-warm-900 aspect-video"></div>
  <p class="text-center text-xs text-ink-muted mt-3">{t('scanner.hint')}</p>
</div>
