<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import { queueReceipt, sendReceipt } from '$lib/modules/receipt/service';
  import { formatReceiptText, formatReceiptHtml } from '$lib/modules/receipt/template';
  import { showToast } from '$lib/stores/toast.svelte';
  import type { ReceiptData, ReceiptChannel } from '$lib/modules/receipt/types';

  interface Props {
    receiptData: ReceiptData;
    onDone: () => void;
  }

  let { receiptData, onDone }: Props = $props();

  let channel = $state<ReceiptChannel>('whatsapp');
  let recipient = $state('');
  let sending = $state(false);

  async function handleSend() {
    if (!recipient.trim() || sending) return;

    sending = true;
    try {
      // Queue receipt record
      const receipt = await queueReceipt(receiptData.transactionId, channel, recipient);

      // Generate content
      const content = channel === 'whatsapp'
        ? formatReceiptText(receiptData)
        : formatReceiptHtml(receiptData);

      // Send via Edge Function
      const result = await sendReceipt(receipt.id, channel, recipient, content);

      if (result.success) {
        showToast(t('receipt.sent'), 'success');
        onDone();
      } else {
        showToast(`${t('receipt.failed')}: ${result.error}`, 'error');
      }
    } catch (err) {
      showToast(t('receipt.failed'), 'error');
    } finally {
      sending = false;
    }
  }
</script>

<div class="bg-surface rounded-2xl border border-warm-100 p-5 space-y-4">
  <h3 class="font-display text-lg font-bold text-ink">{t('receipt.title')}</h3>

  <!-- Channel Toggle -->
  <div class="flex gap-2">
    <button
      class="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors {channel === 'whatsapp' ? 'bg-sage/10 text-sage border-2 border-sage/30' : 'bg-warm-50 text-ink-muted'}"
      onclick={() => { channel = 'whatsapp'; recipient = ''; }}
    >
      WhatsApp
    </button>
    <button
      class="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors {channel === 'email' ? 'bg-accent/10 text-accent border-2 border-accent/30' : 'bg-warm-50 text-ink-muted'}"
      onclick={() => { channel = 'email'; recipient = ''; }}
    >
      Email
    </button>
  </div>

  <!-- Recipient Input -->
  <div>
    {#if channel === 'whatsapp'}
      <input
        type="tel"
        bind:value={recipient}
        placeholder={t('receipt.phone_placeholder')}
        class="w-full px-4 py-3 rounded-xl bg-cream border border-warm-100 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-sage/30 focus:border-sage transition-all"
      />
    {:else}
      <input
        type="email"
        bind:value={recipient}
        placeholder={t('receipt.email_placeholder')}
        class="w-full px-4 py-3 rounded-xl bg-cream border border-warm-100 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
      />
    {/if}
  </div>

  <!-- Summary Preview -->
  <div class="bg-cream rounded-xl p-3 text-xs text-ink-muted space-y-1">
    <p class="font-medium text-ink text-sm">Rp {receiptData.total.toLocaleString('id-ID')}</p>
    <p>{receiptData.items.length} item · {receiptData.date}</p>
  </div>

  <!-- Actions -->
  <div class="flex gap-2">
    <button
      class="flex-1 py-3 rounded-xl bg-accent text-cream font-semibold text-sm hover:bg-accent/90 transition-colors disabled:opacity-50"
      onclick={handleSend}
      disabled={!recipient.trim() || sending}
    >
      {sending ? t('receipt.sending') : (channel === 'whatsapp' ? t('receipt.send_whatsapp') : t('receipt.send_email'))}
    </button>
    <button
      class="px-4 py-3 rounded-xl bg-warm-50 text-ink-muted text-sm font-medium hover:bg-warm-100 transition-colors"
      onclick={onDone}
    >
      {t('receipt.skip')}
    </button>
  </div>
</div>
