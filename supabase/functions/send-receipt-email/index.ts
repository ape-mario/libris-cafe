import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SMTP_HOST = Deno.env.get('SMTP_HOST') ?? '';
const SMTP_PORT = parseInt(Deno.env.get('SMTP_PORT') ?? '587', 10);
const SMTP_USER = Deno.env.get('SMTP_USER') ?? '';
const SMTP_PASS = Deno.env.get('SMTP_PASS') ?? '';
const SMTP_FROM = Deno.env.get('SMTP_FROM') ?? 'receipt@libriscafe.id';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { receipt_id, recipient, message } = await req.json();

    if (!recipient || !message) {
      return new Response(
        JSON.stringify({ error: 'recipient and message required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (!SMTP_HOST || !SMTP_USER) {
      // Fallback: use Supabase's built-in email (via Resend/Postmark if configured)
      // For now, log and mark as failed
      console.warn('SMTP not configured');
      await supabase
        .from('receipt')
        .update({ status: 'failed', error_message: 'Email not configured' })
        .eq('id', receipt_id);

      return new Response(
        JSON.stringify({ success: false, error: 'Email not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send email via SMTP using Deno's built-in network
    // Using a simple SMTP approach compatible with Deno Edge Functions
    const emailPayload = {
      from: SMTP_FROM,
      to: recipient,
      subject: 'Struk Pembelian - Libris Cafe',
      html: message,
    };

    // Use fetch-based email API (e.g., Resend, Mailgun, or similar)
    // This example uses a generic email API endpoint
    const emailApiUrl = Deno.env.get('EMAIL_API_URL') ?? `https://api.resend.com/emails`;
    const emailApiKey = Deno.env.get('EMAIL_API_KEY') ?? SMTP_PASS;

    const response = await fetch(emailApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${emailApiKey}`,
      },
      body: JSON.stringify(emailPayload),
    });

    if (response.ok) {
      await supabase
        .from('receipt')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', receipt_id);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      const errorText = await response.text();
      await supabase
        .from('receipt')
        .update({ status: 'failed', error_message: errorText })
        .eq('id', receipt_id);

      return new Response(
        JSON.stringify({ success: false, error: errorText }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (err) {
    console.error('send-receipt-email error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
