<script lang="ts">
  import Quagga from '@ericblade/quagga2';
  import { onMount, onDestroy } from 'svelte';

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
          error = 'Camera access denied or not available';
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

<div class="relative">
  {#if error}
    <p class="text-red-400 text-sm">{error}</p>
  {/if}
  <div bind:this={scannerRef} class="w-full rounded-lg overflow-hidden bg-black aspect-video"></div>
  <p class="text-center text-sm text-slate-400 mt-2">Point camera at book barcode</p>
</div>
