import { getSupabase } from '$lib/supabase/client';

export async function voidTransaction(txId: string, staffId: string, reason: string): Promise<void> {
  const supabase = getSupabase();

  // Get transaction items to restore stock
  const { data: items } = await supabase
    .from('transaction_item')
    .select('inventory_id, quantity')
    .eq('transaction_id', txId);

  // Update transaction
  const { error } = await supabase
    .from('transaction')
    .update({ type: 'void', payment_status: 'refunded', notes: reason })
    .eq('id', txId);
  if (error) throw new Error(`Failed to void: ${error.message}`);

  // Restore stock
  if (items) {
    for (const item of items) {
      await supabase.from('stock_movement').insert({
        inventory_id: item.inventory_id,
        type: 'void_restore',
        quantity: item.quantity, // positive — restoring stock
        reference_id: txId,
        staff_id: staffId,
        reason: `Void: ${reason}`,
      });
    }
  }
}
