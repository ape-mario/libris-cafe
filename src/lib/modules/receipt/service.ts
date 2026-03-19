import { getSupabase } from '$lib/supabase/client';
import type { Receipt, ReceiptChannel } from './types';

/**
 * Queue a receipt record in the database (status = queued).
 */
export async function queueReceipt(
  transactionId: string,
  type: ReceiptChannel,
  recipient: string
): Promise<Receipt> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('receipt')
    .insert({
      transaction_id: transactionId,
      type,
      recipient,
      status: 'queued',
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to queue receipt: ${error.message}`);
  return data as Receipt;
}

/**
 * Send a receipt via the appropriate Edge Function.
 * Updates receipt status to 'sent' or 'failed'.
 */
export async function sendReceipt(
  receiptId: string,
  channel: ReceiptChannel,
  recipient: string,
  content: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();

  const functionName = channel === 'whatsapp' ? 'send-receipt-wa' : 'send-receipt-email';

  const { data, error } = await supabase.functions.invoke(functionName, {
    body: {
      receipt_id: receiptId,
      recipient,
      message: content,
    },
  });

  if (error) {
    // Update receipt as failed
    const { error: failedUpdateError } = await supabase
      .from('receipt')
      .update({ status: 'failed', error_message: error.message })
      .eq('id', receiptId);

    if (failedUpdateError) {
      console.error('Failed to update receipt status to failed:', failedUpdateError.message);
    }

    return { success: false, error: error.message };
  }

  // Update receipt as sent
  const { error: sentUpdateError } = await supabase
    .from('receipt')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', receiptId);

  if (sentUpdateError) {
    console.error('Failed to update receipt status to sent:', sentUpdateError.message);
  }

  return { success: true };
}

/**
 * Get all receipts for a transaction.
 */
export async function getReceiptsByTransaction(transactionId: string): Promise<Receipt[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('receipt')
    .select()
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch receipts: ${error.message}`);
  return (data ?? []) as Receipt[];
}
