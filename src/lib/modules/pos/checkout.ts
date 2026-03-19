import { getSupabase } from '$lib/supabase/client';
import { getQueue, getIsOnline } from '../sync/manager';
import type { CheckoutRequest } from './types';

export interface CheckoutResult {
  transactionId: string | null;
  offlineId: string;
  synced: boolean;
  requiresPayment: boolean;
  orderId?: string;
}

export async function checkout(request: CheckoutRequest): Promise<CheckoutResult> {
  const offlineId = crypto.randomUUID();
  const { cart, paymentMethod, staffId, outletId, customerName, customerContact, notes } = request;

  const isDigital = paymentMethod !== 'cash';
  const isCashPayment = paymentMethod === 'cash';

  const transactionPayload = {
    outlet_id: outletId,
    staff_id: staffId,
    type: 'sale' as const,
    subtotal: cart.subtotal,
    discount: cart.discount,
    tax: cart.tax,
    total: cart.total,
    payment_method: paymentMethod,
    payment_status: isCashPayment ? ('paid' as const) : ('pending' as const),
    customer_name: customerName ?? null,
    customer_contact: customerContact ?? null,
    notes: notes ?? null,
    offline_id: offlineId,
  };

  const itemsPayload = cart.items.map(item => ({
    inventory_id: item.inventory.id,
    book_id: item.book.id,
    title: item.book.title,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    discount: item.discount,
    total: item.total,
  }));

  // Digital payments require online
  if (isDigital && !getIsOnline()) {
    throw new Error('Digital payment requires internet connection');
  }

  // Try online first
  if (getIsOnline()) {
    try {
      const supabase = getSupabase();

      const { data: txData, error: txError } = await supabase
        .from('transaction')
        .insert(transactionPayload)
        .select()
        .single();

      if (txError) throw txError;

      const itemsWithTxId = itemsPayload.map(item => ({
        ...item,
        transaction_id: txData.id,
      }));

      await supabase.from('transaction_item').insert(itemsWithTxId);

      // For cash: immediately record stock movements
      if (isCashPayment) {
        for (const item of cart.items) {
          await supabase.from('stock_movement').insert({
            inventory_id: item.inventory.id,
            type: 'sale_out',
            quantity: -item.quantity,
            reference_id: txData.id,
            staff_id: staffId,
          });
        }
      }
      // For digital: stock decrement happens in webhook after payment confirmed

      return {
        transactionId: txData.id,
        offlineId,
        synced: true,
        requiresPayment: isDigital,
        orderId: offlineId,  // used as Midtrans order_id base
      };
    } catch (err) {
      // For digital payments, don't fall back to offline — throw
      if (isDigital) throw err;
      // For cash, fall through to offline queue
    }
  }

  // Queue offline (cash only — digital already threw above)
  const queue = getQueue();
  await queue.enqueue('transaction', {
    ...transactionPayload,
    items: itemsPayload,
  });

  return { transactionId: null, offlineId, synced: false, requiresPayment: false };
}
