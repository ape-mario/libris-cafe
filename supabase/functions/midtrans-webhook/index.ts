import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { crypto } from 'https://deno.land/std@0.177.0/crypto/mod.ts';

const MIDTRANS_SERVER_KEY = Deno.env.get('MIDTRANS_SERVER_KEY') ?? '';

serve(async (req: Request) => {
  // Webhook only accepts POST
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const notification = await req.json();
    const {
      order_id,
      transaction_id: midtrans_tx_id,
      transaction_status,
      payment_type,
      gross_amount,
      signature_key,
      fraud_status,
      status_code,
    } = notification;

    // Verify signature: SHA512(order_id + status_code + gross_amount + server_key)
    const rawSignature = `${order_id}${status_code}${gross_amount}${MIDTRANS_SERVER_KEY}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(rawSignature);
    const hashBuffer = await crypto.subtle.digest('SHA-512', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const computedSignature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    if (computedSignature !== signature_key) {
      console.error('Invalid signature for order:', order_id);
      return new Response('Invalid signature', { status: 403 });
    }

    // Determine final status
    let paymentStatus: string;
    if (transaction_status === 'capture') {
      paymentStatus = (fraud_status === 'accept') ? 'capture' : 'deny';
    } else if (transaction_status === 'settlement') {
      paymentStatus = 'settlement';
    } else if (transaction_status === 'deny') {
      paymentStatus = 'deny';
    } else if (transaction_status === 'cancel' || transaction_status === 'expire') {
      paymentStatus = transaction_status;
    } else if (transaction_status === 'pending') {
      paymentStatus = 'pending';
    } else if (transaction_status === 'refund') {
      paymentStatus = 'refund';
    } else {
      paymentStatus = transaction_status;
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Update payment record
    await supabase
      .from('payment')
      .update({
        status: paymentStatus,
        midtrans_transaction_id: midtrans_tx_id,
        payment_type,
        raw_response: notification,
        updated_at: new Date().toISOString(),
      })
      .eq('midtrans_order_id', order_id);

    // Map Midtrans status to our transaction payment_status
    let txPaymentStatus: string;
    if (paymentStatus === 'settlement' || paymentStatus === 'capture') {
      txPaymentStatus = 'paid';
    } else if (paymentStatus === 'deny' || paymentStatus === 'cancel' || paymentStatus === 'expire') {
      txPaymentStatus = 'failed';
    } else if (paymentStatus === 'refund') {
      txPaymentStatus = 'refunded';
    } else {
      txPaymentStatus = 'pending';
    }

    // Update transaction status
    const { data: txData } = await supabase
      .from('transaction')
      .update({
        payment_status: txPaymentStatus,
        midtrans_transaction_id: midtrans_tx_id,
      })
      .eq('midtrans_order_id', order_id)
      .select('id, staff_id')
      .single();

    // If payment is successful, decrement stock
    if (txPaymentStatus === 'paid' && txData) {
      const { data: items } = await supabase
        .from('transaction_item')
        .select('inventory_id, quantity')
        .eq('transaction_id', txData.id);

      if (items) {
        for (const item of items) {
          await supabase.from('stock_movement').insert({
            inventory_id: item.inventory_id,
            type: 'sale_out',
            quantity: -item.quantity,
            reference_id: txData.id,
            staff_id: txData.staff_id,
          });
        }
      }
    }

    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('Webhook error:', err);
    return new Response('Internal error', { status: 500 });
  }
});
