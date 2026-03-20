import { getSupabase } from '$lib/supabase/client';
import { getQueue, getIsOnline } from '../sync/manager';
import type { CheckoutRequest, CheckoutResult, Cart } from './types';
import { getPrinterStatus, printReceipt } from '$lib/modules/printer/service';
import type { ReceiptData } from '$lib/modules/printer/types';

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

  // Try online first — use atomic RPC for cash, multi-step for digital
  if (getIsOnline()) {
    try {
      const supabase = getSupabase();

      if (isCashPayment) {
        // ATOMIC: single DB transaction via RPC — insert tx + items + stock movements
        const { data, error } = await supabase.rpc('checkout_transaction', {
          p_outlet_id: outletId,
          p_staff_id: staffId,
          p_type: 'sale',
          p_subtotal: cart.subtotal,
          p_discount: cart.discount,
          p_tax: cart.tax,
          p_total: cart.total,
          p_payment_method: paymentMethod,
          p_payment_status: 'paid',
          p_customer_name: customerName ?? null,
          p_customer_contact: customerContact ?? null,
          p_notes: notes ?? null,
          p_offline_id: offlineId,
          p_items: JSON.stringify(itemsPayload),
        });

        if (error) throw new Error(error.message);

        return {
          transactionId: data.transaction_id,
          offlineId,
          synced: true,
          requiresPayment: false,
        };
      } else {
        // Digital: insert transaction as pending (stock decrement handled by webhook RPC)
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

        const { error: itemsError } = await supabase.from('transaction_item').insert(itemsWithTxId);
        if (itemsError) {
          await supabase.from('transaction').delete().eq('id', txData.id);
          throw new Error(`Failed to create items: ${itemsError.message}`);
        }

        return {
          transactionId: txData.id,
          offlineId,
          synced: true,
          requiresPayment: true,
          orderId: offlineId,
        };
      }
    } catch (err) {
      // For digital payments, don't fall back to offline — throw
      if (isDigital) throw err;

      // For stock errors, don't queue — the transaction is genuinely invalid
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Insufficient stock') || msg.includes('stock')) {
        throw new Error(msg);
      }

      // For network errors only, fall through to offline queue
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

/**
 * Build receipt data from a completed transaction.
 * Called after successful checkout to prepare for thermal printing.
 */
export function buildReceiptFromTransaction(
  transactionId: string,
  cart: Cart,
  cafeInfo: { name: string; address: string; phone: string },
  staffName: string,
  paymentMethod: string
): ReceiptData {
  return {
    cafe_name: cafeInfo.name,
    cafe_address: cafeInfo.address,
    cafe_phone: cafeInfo.phone,
    transaction_id: transactionId,
    date: new Date().toLocaleString('id-ID'),
    staff_name: staffName,
    items: cart.items.map(item => ({
      title: item.book.title,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      total: item.total,
    })),
    subtotal: cart.subtotal,
    discount: cart.discount,
    tax: cart.tax,
    total: cart.total,
    payment_method: paymentMethod,
    // TODO: i18n — pass translated string from caller once i18n is available in non-Svelte code
    footer_message: 'Terima kasih telah berkunjung!',
  };
}

/**
 * Attempt to print receipt on thermal printer if connected.
 * Non-blocking — failures are logged but don't affect the transaction.
 */
export async function tryPrintReceipt(receiptData: ReceiptData): Promise<void> {
  const status = getPrinterStatus();
  if (!status.connected) return;

  try {
    await printReceipt(receiptData, { openDrawer: true });
  } catch (err) {
    console.warn('Thermal print failed (non-critical):', err);
  }
}
