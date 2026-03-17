<script lang="ts">
  import { getDialog, setDialogInput, confirmDialog, cancelDialog } from '$lib/stores/dialog.svelte';
  import { t } from '$lib/i18n/index.svelte';

  let dialog = $derived(getDialog());
  let inputRef: HTMLInputElement | undefined;

  $effect(() => {
    if (dialog.open && dialog.type === 'prompt') {
      setTimeout(() => inputRef?.focus(), 50);
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    if (!dialog.open) return;
    if (e.key === 'Escape') cancelDialog();
    if (e.key === 'Enter' && dialog.type === 'confirm') confirmDialog();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if dialog.open}
  <div class="fixed inset-0 z-[200] flex items-center justify-center p-6 dialog-backdrop">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="absolute inset-0 bg-ink/30 backdrop-blur-sm" onclick={cancelDialog}></div>

    <div class="relative bg-cream rounded-2xl shadow-2xl w-full max-w-sm p-6 dialog-content">
      <h2 class="font-display text-lg font-bold text-ink">{dialog.title}</h2>
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
