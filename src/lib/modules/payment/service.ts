import { getSupabase } from '$lib/supabase/client';
import type { CreatePaymentRequest, CreatePaymentResponse, Payment } from './types';

/**
 * Generate a unique order ID for Midtrans.
 * Format: LIBRIS-YYYYMMDD-<random8>
 */
export function generateOrderId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = crypto.randomUUID().slice(0, 8);
  return `LIBRIS-${date}-${random}`;
}

/**
 * Create a Midtrans Snap payment token via Edge Function.
 * Never calls Midtrans directly from client (security).
 */
export async function createSnapPayment(
  request: CreatePaymentRequest
): Promise<CreatePaymentResponse> {
  const supabase = getSupabase();

  const { data, error } = await supabase.functions.invoke('create-payment', {
    body: {
      order_id: request.orderId,
      gross_amount: request.grossAmount,
      transaction_id: request.transactionId,
      customer_name: request.customerName ?? null,
      customer_email: request.customerEmail ?? null,
      customer_phone: request.customerPhone ?? null,
      items: request.items.map(item => ({
        id: item.id,
        name: item.name.slice(0, 50), // Midtrans 50 char limit
        price: item.price,
        quantity: item.quantity,
      })),
    },
  });

  if (error) throw new Error(error.message);
  if (!data?.snap_token) throw new Error('Failed to create payment token');

  return {
    snapToken: data.snap_token,
    redirectUrl: data.redirect_url ?? '',
    orderId: data.order_id,
  };
}

/**
 * Check payment status via Edge Function (polling fallback).
 */
export async function checkPaymentStatus(
  orderId: string
): Promise<Record<string, string>> {
  const supabase = getSupabase();

  const { data, error } = await supabase.functions.invoke('check-payment', {
    body: { order_id: orderId },
  });

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Record a payment entry in the database.
 */
export async function recordPayment(params: {
  transactionId: string;
  orderId: string;
  grossAmount: number;
  snapToken: string;
  redirectUrl?: string;
}): Promise<Payment> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('payment')
    .insert({
      transaction_id: params.transactionId,
      midtrans_order_id: params.orderId,
      gross_amount: params.grossAmount,
      snap_token: params.snapToken,
      snap_redirect_url: params.redirectUrl ?? null,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to record payment: ${error.message}`);
  return data as Payment;
}

/**
 * Update payment status after webhook or polling.
 */
export async function updatePaymentStatus(
  orderId: string,
  status: string,
  midtransTransactionId?: string,
  paymentType?: string,
  rawResponse?: Record<string, unknown>
): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from('payment')
    .update({
      status,
      midtrans_transaction_id: midtransTransactionId ?? null,
      payment_type: paymentType ?? null,
      raw_response: rawResponse ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('midtrans_order_id', orderId);

  if (error) throw new Error(`Failed to update payment: ${error.message}`);
}

/**
 * Get payment by transaction ID.
 */
export async function getPaymentByTransaction(transactionId: string): Promise<Payment | null> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('payment')
    .select()
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // not found
    throw new Error(`Failed to fetch payment: ${error.message}`);
  }
  return data as Payment;
}
