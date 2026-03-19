import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get today's date range
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    // Get all outlets
    const { data: outlets } = await supabase.from('outlet').select('id, name');

    for (const outlet of outlets ?? []) {
      // Fetch today's transactions
      const { data: transactions } = await supabase
        .from('transaction')
        .select('total, type, payment_status')
        .eq('outlet_id', outlet.id)
        .eq('payment_status', 'paid')
        .eq('type', 'sale')
        .gte('created_at', startOfDay.toISOString())
        .lte('created_at', endOfDay.toISOString());

      const totalSales = (transactions ?? []).reduce((sum: number, t: any) => sum + (t.total ?? 0), 0);
      const transactionCount = (transactions ?? []).length;

      // Fetch low stock count
      const { data: lowStock } = await supabase
        .from('inventory')
        .select('id')
        .eq('outlet_id', outlet.id)
        .lte('stock', 0);

      const outOfStockCount = (lowStock ?? []).length;

      // Find owner(s) for this outlet
      const { data: owners } = await supabase
        .from('staff')
        .select('id, phone')
        .eq('outlet_id', outlet.id)
        .eq('role', 'owner')
        .eq('is_active', true);

      for (const owner of owners ?? []) {
        // Create in-app notification
        await supabase.from('notification').insert({
          outlet_id: outlet.id,
          recipient_id: owner.id,
          type: 'daily_summary',
          title: `Daily Summary \u2014 ${outlet.name}`,
          body: `Sales: Rp ${totalSales.toLocaleString('id-ID')} | Transactions: ${transactionCount} | Out of stock: ${outOfStockCount}`,
          data: {
            totalSales,
            transactionCount,
            outOfStockCount,
            date: today.toISOString().split('T')[0],
          },
        });

        // Send WhatsApp (if phone is available and WhatsApp provider is configured)
        if (owner.phone) {
          const fonntToken = Deno.env.get('FONNTE_API_TOKEN');
          if (fonntToken) {
            const message = [
              '*Libris Cafe \u2014 Ringkasan Harian*',
              '',
              `Penjualan: Rp ${totalSales.toLocaleString('id-ID')}`,
              `Transaksi: ${transactionCount}`,
              `Stok habis: ${outOfStockCount} item`,
              '',
              `_${today.toLocaleDateString('id-ID', { dateStyle: 'full' })}_`,
            ].join('\n');

            await fetch('https://api.fonnte.com/send', {
              method: 'POST',
              headers: {
                'Authorization': fonntToken,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                target: owner.phone,
                message,
              }),
            });
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Daily summaries sent' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
