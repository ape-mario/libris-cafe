import { getSupabase } from '$lib/supabase/client';
import type { Notification } from './types';
import { addNotification, incrementUnread } from './stores.svelte';
import type { RealtimeChannel } from '@supabase/supabase-js';

let subscription: RealtimeChannel | null = null;

/**
 * Subscribe to new notifications for the current staff member via Supabase Realtime.
 * Call once after login. Call unsubscribe() on logout.
 */
export function subscribeToNotifications(
  staffId: string,
  onNotification?: (title: string) => void
): void {
  if (subscription) return; // Already subscribed

  const supabase = getSupabase();

  subscription = supabase
    .channel('notifications')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notification',
        filter: `recipient_id=eq.${staffId}`,
      },
      (payload: { new: Record<string, unknown> }) => {
        const notif = payload.new as Notification;
        addNotification(notif);
        incrementUnread();

        // Notify caller for urgent notification types
        const urgentTypes = ['low_stock', 'out_of_stock', 'payment_failed', 'settlement_due'];
        if (urgentTypes.includes(notif.type)) {
          onNotification?.(notif.title);
        }
      }
    )
    .subscribe();
}

export function unsubscribeFromNotifications(): void {
  if (subscription) {
    const supabase = getSupabase();
    supabase.removeChannel(subscription);
    subscription = null;
  }
}
