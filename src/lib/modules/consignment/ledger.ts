import { getSupabase } from '$lib/supabase/client';
import type { ConsignmentSaleRecord } from './types';

/**
 * Get all sales of consignment items for a given consignor within a date range.
 * Joins transaction_item -> inventory (where source = 'consignment' and consignor_id matches)
 * -> transaction (for date and status).
 */
export async function getConsignmentSales(
  consignorId: string,
  periodStart: string,
  periodEnd: string
): Promise<ConsignmentSaleRecord[]> {
  const supabase = getSupabase();

  // Use a raw query via RPC for the complex join.
  // This function should be created as a Supabase RPC or we query with joins.
  const { data, error } = await supabase
    .from('transaction_item')
    .select(`
      id,
      transaction_id,
      title,
      quantity,
      unit_price,
      total,
      inventory!inner(consignor_id, commission_rate),
      transaction!inner(created_at, payment_status)
    `)
    .eq('inventory.consignor_id', consignorId)
    .eq('transaction.payment_status', 'paid')
    .gte('transaction.created_at', periodStart)
    .lte('transaction.created_at', `${periodEnd}T23:59:59Z`);

  if (error) throw new Error(`Failed to fetch consignment sales: ${error.message}`);

  return (data ?? []).map((row: any) => {
    const commissionRate = row.inventory?.commission_rate ?? 20;
    const commissionAmount = Math.round(row.total * (commissionRate / 100));

    return {
      transaction_id: row.transaction_id,
      transaction_date: row.transaction?.created_at,
      book_title: row.title,
      quantity: row.quantity,
      unit_price: row.unit_price,
      total: row.total,
      commission_rate: commissionRate,
      commission_amount: commissionAmount,
      payout_amount: row.total - commissionAmount,
    } satisfies ConsignmentSaleRecord;
  });
}

/**
 * Calculate settlement totals from a list of sale records.
 */
export function calculateSettlementTotals(
  sales: ConsignmentSaleRecord[]
): { totalSales: number; totalCommission: number; totalPayout: number } {
  return sales.reduce(
    (acc, sale) => ({
      totalSales: acc.totalSales + sale.total,
      totalCommission: acc.totalCommission + sale.commission_amount,
      totalPayout: acc.totalPayout + sale.payout_amount,
    }),
    { totalSales: 0, totalCommission: 0, totalPayout: 0 }
  );
}
