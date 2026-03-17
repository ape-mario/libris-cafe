<script lang="ts">
  import { getToasts } from '$lib/stores/toast.svelte';

  let toasts = $derived(getToasts());

  const iconMap: Record<string, string> = {
    success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
    error: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>`,
    info: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`
  };

  const colorMap: Record<string, string> = {
    success: 'bg-sage text-white',
    error: 'bg-berry text-white',
    info: 'bg-ink text-cream'
  };
</script>

{#if toasts.length}
  <div class="fixed bottom-24 left-0 right-0 z-[100] flex flex-col items-center gap-2 pointer-events-none px-4">
    {#each toasts as toast (toast.id)}
      <div
        class="pointer-events-auto max-w-sm w-full rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg {colorMap[toast.type]} {toast.leaving ? 'toast-leave' : 'toast-enter'}"
      >
        <span class="flex-shrink-0 opacity-80">{@html iconMap[toast.type]}</span>
        <span class="text-sm font-medium">{toast.message}</span>
      </div>
    {/each}
  </div>
{/if}

<style>
  .toast-enter {
    animation: toastIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .toast-leave {
    animation: toastOut 0.3s ease-in both;
  }
  @keyframes toastIn {
    from { opacity: 0; transform: translateY(16px) scale(0.95); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes toastOut {
    from { opacity: 1; transform: translateY(0) scale(1); }
    to { opacity: 0; transform: translateY(-8px) scale(0.95); }
  }
</style>
