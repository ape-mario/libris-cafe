/**
 * WhatsApp notification dispatcher.
 * Reuses the MessagingProvider interface from Phase 2 receipt module.
 * Routes notification events through the existing WhatsApp provider.
 */
import type { NotificationEvent } from './types';

// Import Phase 2 messaging provider (already exists from receipt module)
// The MessagingProvider interface has: sendMessage(recipient, message): Promise<void>
type MessagingProvider = {
  sendMessage(recipient: string, message: string): Promise<{ success: boolean }>;
};

let whatsappProvider: MessagingProvider | null = null;

export function setWhatsappProvider(provider: MessagingProvider): void {
  whatsappProvider = provider;
}

/**
 * Send a WhatsApp notification.
 * Falls back silently if provider is not configured.
 */
export async function sendWhatsappNotification(
  phoneNumber: string,
  event: NotificationEvent
): Promise<boolean> {
  if (!whatsappProvider) {
    console.warn('[Notification] WhatsApp provider not configured, skipping');
    return false;
  }

  const message = formatNotificationMessage(event);

  try {
    const result = await whatsappProvider.sendMessage(phoneNumber, message);
    return result.success;
  } catch (err) {
    console.error('[Notification] WhatsApp send failed:', err);
    return false;
  }
}

function formatNotificationMessage(event: NotificationEvent): string {
  const lines = [
    `*Libris Cafe*`,
    ``,
    `*${event.title}*`,
  ];

  if (event.body) {
    lines.push(event.body);
  }

  // Add type-specific formatting
  switch (event.type) {
    case 'low_stock':
      lines.push('', 'Segera lakukan restok untuk menghindari kehabisan stok.');
      break;
    case 'settlement_due':
      lines.push('', 'Silakan lakukan penyelesaian pembayaran konsinyasi.');
      break;
    case 'daily_summary':
      if (event.data) {
        lines.push(
          '',
          `Penjualan: Rp ${(event.data.totalSales ?? 0).toLocaleString('id-ID')}`,
          `Transaksi: ${event.data.transactionCount ?? 0}`,
          `Margin: Rp ${(event.data.totalMargin ?? 0).toLocaleString('id-ID')}`,
        );
      }
      break;
  }

  lines.push('', `_${new Date().toLocaleDateString('id-ID', { dateStyle: 'full' })}_`);

  return lines.join('\n');
}

/**
 * Dispatch a notification event: creates in-app notification AND
 * optionally sends WhatsApp if the event specifies it.
 */
export async function dispatchNotificationEvent(
  outletId: string,
  recipientId: string,
  event: NotificationEvent,
  phoneNumber?: string
): Promise<void> {
  // 1. Create in-app notification
  const { createNotification } = await import('./service');
  await createNotification({
    outlet_id: outletId,
    recipient_id: recipientId,
    type: event.type,
    title: event.title,
    body: event.body,
    data: event.data,
  });

  // 2. Send WhatsApp if requested and phone is available
  if (event.whatsapp && (phoneNumber || event.whatsappRecipient)) {
    await sendWhatsappNotification(
      (phoneNumber || event.whatsappRecipient)!,
      event
    );
  }
}
