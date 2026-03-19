import { getSupabase } from '$lib/supabase/client';
import { setCurrentStaff } from './stores.svelte';
import type { Staff, AuthSession } from './types';

const STAFF_COLUMNS = 'id, name, email, role, outlet_id, is_active, created_at';

/**
 * Login with email + PIN (PIN is used as password in Supabase Auth).
 * Staff accounts are pre-created by owner — no self-registration.
 */
export async function loginWithPin(email: string, pin: string): Promise<AuthSession> {
  const supabase = getSupabase();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: pin,
  });

  if (error) throw new Error(error.message);
  if (!data.user || !data.session) throw new Error('Login failed');

  const staff = await getStaffByAuthId(data.user.id);
  if (!staff) throw new Error('Staff record not found');
  if (!staff.is_active) throw new Error('Account is deactivated');

  return {
    staff,
    token: data.session.access_token,
  };
}

/**
 * Fetch staff record by Supabase Auth UID.
 * staff.id IS the Supabase Auth UID (set explicitly when creating staff accounts).
 */
export async function getStaffByAuthId(authId: string): Promise<Staff | null> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('staff')
    .select(STAFF_COLUMNS)
    .eq('id', authId)
    .single();

  if (error || !data) return null;
  return data as Staff;
}

export async function logout(): Promise<void> {
  const supabase = getSupabase();
  await supabase.auth.signOut();
  setCurrentStaff(null);
}

export async function restoreSession(): Promise<AuthSession | null> {
  const supabase = getSupabase();

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;

  const staff = await getStaffByAuthId(session.user.id);
  if (!staff || !staff.is_active) return null;

  return { staff, token: session.access_token };
}
