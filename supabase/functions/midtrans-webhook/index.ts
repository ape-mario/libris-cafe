import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { crypto } from 'https://deno.land/std@0.177.0/crypto/mod.ts';

const MIDTRANS_SERVER_KEY = Deno.env.get('MIDTRANS_SERVER_KEY') ?? '';

serve(async (req: Request) => {
  // Webhook only accepts POST — no CORS needed (server-to-server)
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
    } else {
      paymentStatus = transaction_status; // deny, cancel, expire, pending, refund
    }

    // Use idempotent RPC — handles duplicate webhook deliveries safely
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: result, error } = await supabase.rpc('process_payment_webhook', {
      p_midtrans_order_id: order_id,
      p_midtrans_transaction_id: midtrans_tx_id,
      p_payment_type: payment_type,
      p_gross_amount: parseFloat(gross_amount),
      p_status: paymentStatus,
      p_raw_response: notification,
    });

    if (error) {
      console.error('Webhook RPC error:', error);
      return new Response('Processing error', { status: 500 });
    }

    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('Webhook error:', err);
    return new Response('Internal error', { status: 500 });
  }
});
