import { getSupabase } from '$lib/supabase/client';
import type {
  ReadingSession,
  CheckInParams,
  CheckOutParams,
  LendingStats,
  SessionStatus,
} from './types';

/**
 * Check in a book for read-in-store.
 * Semi-formal: staff logs it, no deposit or timer.
 * Formal: customer info, deposit, timed return.
 */
export async function checkIn(params: CheckInParams): Promise<ReadingSession> {
  const supabase = getSupabase();

  const expected_return_at =
    params.level === 'formal' && params.duration_minutes
      ? new Date(Date.now() + params.duration_minutes * 60 * 1000).toISOString()
      : null;

  const deposit_status =
    params.level === 'formal' && params.deposit_amount && params.deposit_amount > 0
      ? 'held'
      : null;

  const { data, error } = await supabase
    .from('reading_session')
    .insert({
      inventory_id: params.inventory_id,
      book_id: params.book_id,
      outlet_id: params.outlet_id,
      staff_id: params.staff_id,
      level: params.level,
      status: 'active',
      expected_return_at,
      customer_name: params.customer_name ?? null,
      customer_contact: params.customer_contact ?? null,
      deposit_amount: params.deposit_amount ?? 0,
      deposit_status,
      notes: params.notes ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`Check-in failed: ${error.message}`);
  return data as ReadingSession;
}

/**
 * Check out (return) a book from a reading session.
 */
export async function checkOut(params: CheckOutParams): Promise<ReadingSession> {
  const supabase = getSupabase();

  const updates: Record<string, unknown> = {
    status: 'returned',
    checked_out_at: new Date().toISOString(),
    checked_out_by: params.staff_id,
  };

  if (params.notes) {
    updates.notes = params.notes;
  }

  // Handle deposit refund for formal sessions
  if (params.refund_deposit) {
    updates.deposit_status = 'refunded';
    updates.deposit_refunded_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('reading_session')
    .update(updates)
    .eq('id', params.session_id)
    .select()
    .single();

  if (error) throw new Error(`Check-out failed: ${error.message}`);
  return data as ReadingSession;
}

/**
 * Forfeit deposit for a session (e.g., book damaged or not returned).
 */
export async function forfeitDeposit(sessionId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('reading_session')
    .update({ deposit_status: 'forfeited' })
    .eq('id', sessionId);

  if (error) throw new Error(`Forfeit deposit failed: ${error.message}`);
}

/**
 * Get active reading sessions for an outlet.
 */
export async function getActiveSessions(outletId: string): Promise<ReadingSession[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('reading_session')
    .select()
    .eq('outlet_id', outletId)
    .in('status', ['active', 'overdue'])
    .order('checked_in_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch sessions: ${error.message}`);
  return (data ?? []) as ReadingSession[];
}

/**
 * Get all sessions with optional filters.
 */
export async function getSessions(
  outletId: string,
  options: {
    status?: SessionStatus;
    from?: string;
    to?: string;
    limit?: number;
  } = {}
): Promise<ReadingSession[]> {
  const supabase = getSupabase();
  let query = supabase
    .from('reading_session')
    .select()
    .eq('outlet_id', outletId)
    .order('checked_in_at', { ascending: false });

  if (options.status) {
    query = query.eq('status', options.status);
  }
  if (options.from) {
    query = query.gte('checked_in_at', options.from);
  }
  if (options.to) {
    query = query.lte('checked_in_at', options.to);
  }
  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch sessions: ${error.message}`);
  return (data ?? []) as ReadingSession[];
}

/**
 * Get lending stats for today.
 */
export async function getLendingStats(outletId: string): Promise<LendingStats> {
  const supabase = getSupabase();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Active and overdue counts
  const { count: activeCount } = await supabase
    .from('reading_session')
    .select('*', { count: 'exact', head: true })
    .eq('outlet_id', outletId)
    .eq('status', 'active');

  const { count: overdueCount } = await supabase
    .from('reading_session')
    .select('*', { count: 'exact', head: true })
    .eq('outlet_id', outletId)
    .eq('status', 'overdue');

  // Today's check-ins
  const { count: todayCheckins } = await supabase
    .from('reading_session')
    .select('*', { count: 'exact', head: true })
    .eq('outlet_id', outletId)
    .gte('checked_in_at', todayStart.toISOString());

  // Today's check-outs
  const { count: todayCheckouts } = await supabase
    .from('reading_session')
    .select('*', { count: 'exact', head: true })
    .eq('outlet_id', outletId)
    .eq('status', 'returned')
    .gte('checked_out_at', todayStart.toISOString());

  // Average duration of completed sessions (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: completedSessions } = await supabase
    .from('reading_session')
    .select('checked_in_at, checked_out_at')
    .eq('outlet_id', outletId)
    .eq('status', 'returned')
    .gte('checked_out_at', thirtyDaysAgo)
    .not('checked_out_at', 'is', null);

  let avgDuration = 0;
  if (completedSessions && completedSessions.length > 0) {
    const totalMinutes = completedSessions.reduce((sum, s) => {
      const inTime = new Date(s.checked_in_at).getTime();
      const outTime = new Date(s.checked_out_at!).getTime();
      return sum + (outTime - inTime) / (1000 * 60);
    }, 0);
    avgDuration = Math.round(totalMinutes / completedSessions.length);
  }

  return {
    active_count: activeCount ?? 0,
    overdue_count: overdueCount ?? 0,
    today_checkins: todayCheckins ?? 0,
    today_checkouts: todayCheckouts ?? 0,
    avg_duration_minutes: avgDuration,
  };
}

/**
 * Trigger the server-side overdue detection.
 * Calls the mark_overdue_sessions() RPC function.
 */
export async function triggerOverdueCheck(): Promise<number> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('mark_overdue_sessions');

  if (error) throw new Error(`Overdue check failed: ${error.message}`);
  return data as number;
}

/**
 * Check if a specific inventory item currently has an active session.
 */
export async function hasActiveSession(inventoryId: string): Promise<boolean> {
  const supabase = getSupabase();
  const { count } = await supabase
    .from('reading_session')
    .select('*', { count: 'exact', head: true })
    .eq('inventory_id', inventoryId)
    .in('status', ['active', 'overdue']);

  return (count ?? 0) > 0;
}
