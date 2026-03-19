import { getSupabase } from '$lib/supabase/client';

export async function voidTransaction(txId: string, staffId: string, reason: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('void_transaction', {
    p_transaction_id: txId,
    p_staff_id: staffId,
    p_reason: reason,
  });
  if (error) throw new Error(`Failed to void: ${error.message}`);
}
