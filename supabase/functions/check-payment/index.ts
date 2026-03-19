import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const MIDTRANS_SERVER_KEY = Deno.env.get('MIDTRANS_SERVER_KEY') ?? '';
const MIDTRANS_IS_PRODUCTION = Deno.env.get('MIDTRANS_IS_PRODUCTION') === 'true';

const STATUS_API_URL = MIDTRANS_IS_PRODUCTION
  ? 'https://api.midtrans.com/v2'
  : 'https://api.sandbox.midtrans.com/v2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { order_id } = await req.json();

    if (!order_id) {
      return new Response(
        JSON.stringify({ error: 'order_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const auth = btoa(`${MIDTRANS_SERVER_KEY}:`);
    const response = await fetch(`${STATUS_API_URL}/${order_id}/status`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
      },
    });

    const result = await response.json();

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('check-payment error:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
