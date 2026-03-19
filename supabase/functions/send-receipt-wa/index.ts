import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAuthenticatedUser, unauthorizedResponse } from '../_shared/auth.ts';

const FONNTE_API_KEY = Deno.env.get('FONNTE_API_KEY') ?? '';
const FONNTE_API_URL = 'https://api.fonnte.com/send';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const user = await getAuthenticatedUser(req);
  if (!user) return unauthorizedResponse(corsHeaders);

  try {
    const { receipt_id, recipient, message } = await req.json();

    if (!recipient || !message) {
      return new Response(
        JSON.stringify({ error: 'recipient and message required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!FONNTE_API_KEY) {
      console.warn('FONNTE_API_KEY not configured, skipping WhatsApp send');
      return new Response(
        JSON.stringify({ success: false, error: 'WhatsApp not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send via Fonnte API
    const formData = new FormData();
    formData.append('target', recipient);
    formData.append('message', message);

    const response = await fetch(FONNTE_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': FONNTE_API_KEY,
      },
      body: formData,
    });

    const result = await response.json();

    // Update receipt status in database
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (result.status) {
      await supabase
        .from('receipt')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', receipt_id);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      const errorMsg = result.reason ?? 'Fonnte send failed';
      await supabase
        .from('receipt')
        .update({ status: 'failed', error_message: errorMsg })
        .eq('id', receipt_id);

      return new Response(
        JSON.stringify({ success: false, error: errorMsg }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (err) {
    console.error('send-receipt-wa error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
