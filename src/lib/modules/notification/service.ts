import { getSupabase } from '$lib/supabase/client';
import type { Notification, NewNotification } from './types';

export async function createNotification(input: NewNotification): Promise<Notification> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('notification')
    .insert({
      outlet_id: input.outlet_id,
      recipient_id: input.recipient_id,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      data: input.data ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create notification: ${error.message}`);
  return data as Notification;
}

export async function getNotifications(
  recipientId: string,
  limit = 50
): Promise<Notification[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('notification')
    .select()
    .eq('recipient_id', recipientId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to fetch notifications: ${error.message}`);
  return (data ?? []) as Notification[];
}

export async function getUnreadCount(recipientId: string): Promise<number> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('notification')
    .select('id')
    .eq('recipient_id', recipientId)
    .eq('read', false);

  if (error) return 0;
  return (data ?? []).length;
}

export async function markAsRead(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('notification')
    .update({ read: true })
    .eq('id', id);

  if (error) throw new Error(`Failed to mark notification as read: ${error.message}`);
}

export async function markAllAsRead(recipientId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('notification')
    .update({ read: true })
    .eq('recipient_id', recipientId)
    .eq('read', false);

  if (error) throw new Error(`Failed to mark all as read: ${error.message}`);
}

/**
 * Send notification to all staff with a given role at an outlet.
 * Used for broadcast alerts (e.g., low stock -> all staff + owner).
 */
export async function broadcastNotification(
  outletId: string,
  role: 'owner' | 'staff' | 'all',
  notification: Omit<NewNotification, 'outlet_id' | 'recipient_id'>
): Promise<void> {
  const supabase = getSupabase();

  let query = supabase
    .from('staff')
    .select('id')
    .eq('outlet_id', outletId)
    .eq('is_active', true);

  if (role !== 'all') query = query.eq('role', role);

  const { data: staffList, error } = await query;
  if (error) throw new Error(`Failed to fetch staff for broadcast: ${error.message}`);
  if (!staffList || staffList.length === 0) return;

  const notifications = staffList.map((s: { id: string }) => ({
    outlet_id: outletId,
    recipient_id: s.id,
    type: notification.type,
    title: notification.title,
    body: notification.body ?? null,
    data: notification.data ?? null,
  }));

  if (notifications.length > 0) {
    const { error: insertError } = await supabase.from('notification').insert(notifications);
    if (insertError) throw new Error(`Failed to broadcast notifications: ${insertError.message}`);
  }
}
