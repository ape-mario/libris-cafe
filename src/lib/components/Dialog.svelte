<script lang="ts">
  import { getDialog, setDialogInput, confirmDialog, cancelDialog, dialogStore } from '$lib/stores/dialog.svelte';
  import { t } from '$lib/i18n/index.svelte';

  let dialog = $derived(dialogStore.state);
  let inputRef: HTMLInputElement | undefined = $state();

  $effect(() => {
    if (dialog.open && dialog.type === 'prompt') {
      setTimeout(() => inputRef?.focus(), 50);
    }
  });

  let dialogEl: HTMLDivElement | undefined = $state();

  function handleKeydown(e: KeyboardEvent) {
    if (!dialog.open) return;
    if (e.key === 'Escape') cancelDialog();
    if (e.key === 'Enter' && dialog.type === 'confirm') confirmDialog();
    // Focus trap
    if (e.key === 'Tab' && dialogEl) {
      const focusable = dialogEl.querySelectorAll<HTMLElement>('button, input, [tabindex]');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if dialog.open}
  <div class="fixed inset-0 z-[200] flex items-center justify-center p-6 dialog-backdrop">
    <button class="absolute inset-0 bg-ink/30 backdrop-blur-sm border-none cursor-default" onclick={cancelDialog} aria-label="Close dialog"></button>

    <div bind:this={dialogEl} class="relative bg-cream rounded-2xl shadow-2xl w-full max-w-sm p-6 dialog-content" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <h2 id="dialog-title" class="font-display text-lg font-bold text-ink">{dialog.title}</h2>
      {#if dialog.message}
        <p class="text-sm text-ink-muted mt-1.5 leading-relaxed">{dialog.message}</p>
      {/if}

      {#if dialog.type === 'prompt'}
        <form onsubmit={(e) => { e.preventDefault(); confirmDialog(); }} class="mt-4">
          <input
            bind:this={inputRef}
            type="text"
            value={dialog.inputValue}
            oninput={(e) => setDialogInput((e.target as HTMLInputElement).value)}
            placeholder={dialog.placeholder}
            class="input-field"
          />
        </form>
      {/if}

      <div class="flex gap-3 mt-5">
        <button class="btn-secondary flex-1" onclick={cancelDialog}>{t('dialog.cancel')}</button>
        <button
          class="flex-1 {dialog.confirmStyle === 'danger' ? 'btn-danger' : 'btn-primary'}"
          onclick={confirmDialog}
        >{dialog.confirmLabel}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .dialog-backdrop {
    animation: fadeIn 0.15s ease-out;
  }
  .dialog-content {
    animation: dialogIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes dialogIn {
    from { opacity: 0; transform: scale(0.95) translateY(8px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }
</style>
