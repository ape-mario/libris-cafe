import { getSupabase } from '$lib/supabase/client';
import type {
  Consignor, NewConsignor, ConsignmentSettlement, SettlementStatus,
  CreateSettlementInput,
} from './types';

// --- Consignor CRUD ---

export async function createConsignor(input: NewConsignor): Promise<Consignor> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('consignor')
    .insert({
      name: input.name,
      phone: input.phone ?? null,
      email: input.email ?? null,
      bank_account: input.bank_account ?? null,
      bank_name: input.bank_name ?? null,
      commission_rate: input.commission_rate ?? 20,
      notes: input.notes ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create consignor: ${error.message}`);
  return data as Consignor;
}

export async function getConsignors(activeOnly = true): Promise<Consignor[]> {
  const supabase = getSupabase();
  let query = supabase.from('consignor').select();
  if (activeOnly) query = query.eq('is_active', true);
  const { data, error } = await query.order('name');

  if (error) throw new Error(`Failed to fetch consignors: ${error.message}`);
  return (data ?? []) as Consignor[];
}

export async function getConsignorById(id: string): Promise<Consignor | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('consignor')
    .select()
    .eq('id', id)
    .single();

  if (error) return null;
  return data as Consignor;
}

export async function updateConsignor(id: string, updates: Partial<NewConsignor>): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('consignor')
    .update(updates)
    .eq('id', id);

  if (error) throw new Error(`Failed to update consignor: ${error.message}`);
}

export async function deactivateConsignor(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('consignor')
    .update({ is_active: false })
    .eq('id', id);

  if (error) throw new Error(`Failed to deactivate consignor: ${error.message}`);
}

// --- Settlement ---

export async function createSettlement(input: CreateSettlementInput): Promise<ConsignmentSettlement> {
  const commission = Math.round(input.totalSales * (input.commissionRate / 100));
  const payout = input.totalSales - commission;

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('consignment_settlement')
    .insert({
      consignor_id: input.consignorId,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      total_sales: input.totalSales,
      commission,
      payout,
      status: 'draft',
      created_by: input.staffId,
      notes: input.notes ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create settlement: ${error.message}`);
  return data as ConsignmentSettlement;
}

export async function getSettlements(
  consignorId?: string,
  status?: SettlementStatus
): Promise<ConsignmentSettlement[]> {
  const supabase = getSupabase();
  let query = supabase
    .from('consignment_settlement')
    .select('*, consignor(name, phone, bank_name, bank_account)');

  if (consignorId) query = query.eq('consignor_id', consignorId);
  if (status) query = query.eq('status', status);

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch settlements: ${error.message}`);
  return (data ?? []) as ConsignmentSettlement[];
}

export async function getSettlementById(id: string): Promise<ConsignmentSettlement | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('consignment_settlement')
    .select('*, consignor(*)')
    .eq('id', id)
    .single();

  if (error) return null;
  return data as ConsignmentSettlement;
}

export async function confirmSettlement(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('consignment_settlement')
    .update({ status: 'confirmed' })
    .eq('id', id);

  if (error) throw new Error(`Failed to confirm settlement: ${error.message}`);
}

export async function markSettlementPaid(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('consignment_settlement')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(`Failed to mark settlement paid: ${error.message}`);
}

/**
 * Get total unsettled amount across all consignors.
 * Useful for dashboard summary.
 */
export async function getUnsettledTotal(): Promise<number> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('consignment_settlement')
    .select('payout')
    .in('status', ['draft', 'confirmed']);

  if (error) throw new Error(`Failed to fetch unsettled total: ${error.message}`);
  return (data ?? []).reduce((sum: number, s: any) => sum + (s.payout ?? 0), 0);
}
