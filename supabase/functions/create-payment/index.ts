import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { getAuthenticatedUser, unauthorizedResponse } from '../_shared/auth.ts';

const MIDTRANS_SERVER_KEY = Deno.env.get('MIDTRANS_SERVER_KEY') ?? '';
const MIDTRANS_IS_PRODUCTION = Deno.env.get('MIDTRANS_IS_PRODUCTION') === 'true';

const SNAP_API_URL = MIDTRANS_IS_PRODUCTION
  ? 'https://app.midtrans.com/snap/v1/transactions'
  : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Verify authenticated staff
  const user = await getAuthenticatedUser(req);
  if (!user) return unauthorizedResponse(corsHeaders);

  try {
    const {
      order_id,
      gross_amount,
      transaction_id,
      customer_name,
      customer_email,
      customer_phone,
      items,
    } = await req.json();

    if (!order_id || !gross_amount) {
      return new Response(
        JSON.stringify({ error: 'order_id and gross_amount required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build Midtrans Snap request
    const snapPayload = {
      transaction_details: {
        order_id,
        gross_amount: Math.round(gross_amount), // Midtrans requires integer
      },
      customer_details: {
        first_name: customer_name ?? 'Customer',
        email: customer_email ?? undefined,
        phone: customer_phone ?? undefined,
      },
      item_details: items?.map((item: any) => ({
        id: item.id,
        name: item.name,
        price: Math.round(item.price),
        quantity: item.quantity,
      })),
      enabled_payments: [
        'credit_card', 'bca_va', 'bni_va', 'bri_va', 'permata_va',
        'gopay', 'shopeepay', 'qris',
      ],
      expiry: {
        unit: 'minutes',
        duration: 15,
      },
    };

    // Call Midtrans Snap API
    const auth = btoa(`${MIDTRANS_SERVER_KEY}:`);
    const response = await fetch(SNAP_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
      },
      body: JSON.stringify(snapPayload),
    });

    const result = await response.json();

    if (!response.ok || !result.token) {
      console.error('Midtrans error:', result);
      return new Response(
        JSON.stringify({ error: result.error_messages?.[0] ?? 'Failed to create Snap token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Store payment record in database
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    await supabase.from('payment').insert({
      transaction_id,
      midtrans_order_id: order_id,
      gross_amount: Math.round(gross_amount),
      snap_token: result.token,
      snap_redirect_url: result.redirect_url,
      status: 'pending',
    });

    // Update transaction with midtrans_order_id
    await supabase
      .from('transaction')
      .update({ midtrans_order_id: order_id })
      .eq('id', transaction_id);

    return new Response(
      JSON.stringify({
        snap_token: result.token,
        redirect_url: result.redirect_url,
        order_id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('create-payment error:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
