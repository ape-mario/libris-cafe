import { OfflineQueue } from './queue';
import { getSupabase } from '$lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

const queue = new OfflineQueue();
let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
let processing = false;

export function getQueue(): OfflineQueue {
  return queue;
}

export function getIsOnline(): boolean {
  return isOnline;
}

export function initSyncManager(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('online', () => { isOnline = true; processQueue(); });
  window.addEventListener('offline', () => { isOnline = false; });
  if (isOnline) processQueue();
}

async function processQueue(): Promise<void> {
  if (processing || !isOnline) return;
  processing = true;
  try {
    const supabase = getSupabase();
    const pending = await queue.getPending();
    for (const entry of pending) {
      if (!isOnline) break;
      try {
        if (entry.type === 'transaction') {
          await syncTransaction(supabase, entry.payload);
        } else if (entry.type === 'stock_adjustment') {
          await syncStockAdjustment(supabase, entry.payload);
        }
        await queue.markSynced(entry.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await queue.markFailed(entry.id, message);
        if (message.includes('duplicate') || message.includes('unique')) {
          await queue.markSynced(entry.id);
        }
      }
    }
    // Purge old synced entries to prevent IndexedDB growth
    await queue.purgeSynced();
  } finally {
    processing = false;
  }
}

async function syncTransaction(supabase: SupabaseClient, payload: Record<string, unknown>): Promise<void> {
  const { items, ...transaction } = payload;

  // Use atomic checkout RPC — single DB transaction
  const { error } = await supabase.rpc('checkout_transaction', {
    p_outlet_id: transaction.outlet_id,
    p_staff_id: transaction.staff_id,
    p_type: transaction.type || 'sale',
    p_subtotal: transaction.subtotal,
    p_discount: transaction.discount || 0,
    p_tax: transaction.tax || 0,
    p_total: transaction.total,
    p_payment_method: transaction.payment_method,
    p_payment_status: transaction.payment_status || 'paid',
    p_customer_name: transaction.customer_name,
    p_customer_contact: transaction.customer_contact,
    p_notes: transaction.notes,
    p_offline_id: transaction.offline_id,
    p_items: JSON.stringify(items),
  });

  if (error) throw new Error(error.message);
}

async function syncStockAdjustment(supabase: SupabaseClient, payload: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from('stock_movement').insert(payload);
  if (error) throw new Error(error.message);
}

export { processQueue };
