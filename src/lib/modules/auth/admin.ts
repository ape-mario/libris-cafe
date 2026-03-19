import { getSupabase } from '$lib/supabase/client';
import type { Staff } from './types';

/**
 * Create a new staff account via the create-staff Edge Function.
 * Only callable by owners.
 */
export async function createStaffAccount(
  name: string,
  email: string,
  pin: string,
  role: 'staff' | 'owner',
  outletId: string,
): Promise<Staff> {
  const supabase = getSupabase();
  const { data, error } = await supabase.functions.invoke('create-staff', {
    body: { name, email, pin, role, outlet_id: outletId },
  });
  if (error) throw new Error(error.message);
  return data.staff;
}

/**
 * Deactivate a staff account (set is_active = false).
 */
export async function deactivateStaff(staffId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('staff')
    .update({ is_active: false })
    .eq('id', staffId);
  if (error) throw new Error(error.message);
}

/**
 * Reset a staff member's PIN by updating their auth password.
 * This requires the reset-pin Edge Function (or direct admin access).
 */
export async function resetPin(staffId: string, newPin: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.functions.invoke('create-staff', {
    body: { action: 'reset-pin', staff_id: staffId, pin: newPin },
  });
  if (error) throw new Error(error.message);
}

/**
 * Fetch all staff, optionally filtered by outlet.
 */
export async function fetchAllStaff(outletId?: string): Promise<Staff[]> {
  const supabase = getSupabase();
  let query = supabase
    .from('staff')
    .select('id, name, email, role, outlet_id, is_active, created_at')
    .order('created_at', { ascending: false });

  if (outletId) {
    query = query.eq('outlet_id', outletId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as Staff[];
}
