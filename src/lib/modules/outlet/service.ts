import { getSupabase } from '$lib/supabase/client';
import type { Outlet } from './types';

// -- Outlet CRUD ------------------------------------------------------

export async function fetchOutlets(): Promise<Outlet[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('outlet')
    .select('*')
    .order('name');

  if (error) throw new Error(`Failed to fetch outlets: ${error.message}`);
  return data ?? [];
}

export async function fetchOutlet(id: string): Promise<Outlet | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('outlet')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // not found
    throw new Error(`Failed to fetch outlet: ${error.message}`);
  }
  return data;
}

export async function createOutlet(outlet: {
  name: string;
  address?: string;
  phone?: string;
  tax_rate?: number;
}): Promise<Outlet> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('outlet')
    .insert({
      name: outlet.name,
      address: outlet.address ?? null,
      phone: outlet.phone ?? null,
      tax_rate: outlet.tax_rate ?? 11.00,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create outlet: ${error.message}`);
  return data;
}

export async function updateOutlet(
  id: string,
  updates: Partial<Pick<Outlet, 'name' | 'address' | 'phone' | 'tax_rate'>>
): Promise<Outlet> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('outlet')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update outlet: ${error.message}`);
  return data;
}

export async function deleteOutlet(id: string): Promise<void> {
  const supabase = getSupabase();

  // Safety check: ensure no inventory or transactions reference this outlet
  const { count: invCount } = await supabase
    .from('inventory')
    .select('id', { count: 'exact', head: true })
    .eq('outlet_id', id);

  if (invCount && invCount > 0) {
    throw new Error('Cannot delete outlet with existing inventory. Transfer or remove inventory first.');
  }

  const { count: txCount } = await supabase
    .from('transaction')
    .select('id', { count: 'exact', head: true })
    .eq('outlet_id', id);

  if (txCount && txCount > 0) {
    throw new Error('Cannot delete outlet with transaction history. Archive the outlet instead.');
  }

  const { error } = await supabase
    .from('outlet')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Failed to delete outlet: ${error.message}`);
}

// -- Staff Assignment -------------------------------------------------

export async function fetchStaffByOutlet(outletId: string): Promise<any[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('staff')
    .select('*')
    .eq('outlet_id', outletId)
    .eq('is_active', true)
    .order('name');

  if (error) throw new Error(`Failed to fetch staff: ${error.message}`);
  return data ?? [];
}

export async function reassignStaff(staffId: string, newOutletId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('staff')
    .update({ outlet_id: newOutletId })
    .eq('id', staffId);

  if (error) throw new Error(`Failed to reassign staff: ${error.message}`);
}

export async function fetchAllStaffGroupedByOutlet(): Promise<Map<string, any[]>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('staff')
    .select('*, outlet:outlet_id(id, name)')
    .eq('is_active', true)
    .order('name');

  if (error) throw new Error(`Failed to fetch all staff: ${error.message}`);

  const grouped = new Map<string, any[]>();
  for (const s of data ?? []) {
    const outletId = s.outlet_id ?? 'unassigned';
    if (!grouped.has(outletId)) grouped.set(outletId, []);
    grouped.get(outletId)!.push(s);
  }
  return grouped;
}
