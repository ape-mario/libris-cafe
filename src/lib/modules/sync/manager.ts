import { OfflineQueue } from './queue';
import { getSupabase } from '$lib/supabase/client';

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
  } finally {
    processing = false;
  }
}

async function syncTransaction(supabase: any, payload: any): Promise<void> {
  const { items, ...transaction } = payload;
  const { data: txData, error: txError } = await supabase
    .from('transaction')
    .insert(transaction)
    .select()
    .single();
  if (txError) throw new Error(txError.message);

  const itemsWithTxId = items.map((item: any) => ({ ...item, transaction_id: txData.id }));
  const { error: itemsError } = await supabase.from('transaction_item').insert(itemsWithTxId);
  if (itemsError) throw new Error(itemsError.message);

  for (const item of items) {
    await supabase.from('stock_movement').insert({
      inventory_id: item.inventory_id,
      type: 'sale_out',
      quantity: -item.quantity,
      reference_id: txData.id,
      staff_id: transaction.staff_id,
    });
  }
}

async function syncStockAdjustment(supabase: any, payload: any): Promise<void> {
  const { error } = await supabase.from('stock_movement').insert(payload);
  if (error) throw new Error(error.message);
}

export { processQueue };
