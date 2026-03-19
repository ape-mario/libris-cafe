import { getActiveSessions, getLendingStats, triggerOverdueCheck } from './service';
import type { ReadingSession, LendingStats, SessionWithBook } from './types';

let activeSessions = $state<SessionWithBook[]>([]);
let lendingStats = $state<LendingStats>({
  active_count: 0,
  overdue_count: 0,
  today_checkins: 0,
  today_checkouts: 0,
  avg_duration_minutes: 0,
});
let isLoading = $state(false);
let error = $state<string | null>(null);

/** Refresh active sessions from the server. */
export async function refreshSessions(outletId: string): Promise<void> {
  isLoading = true;
  error = null;
  try {
    activeSessions = await getActiveSessions(outletId);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load sessions';
  } finally {
    isLoading = false;
  }
}

/** Refresh lending stats. */
export async function refreshStats(outletId: string): Promise<void> {
  try {
    lendingStats = await getLendingStats(outletId);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load stats';
  }
}

/** Run overdue check and refresh data. */
export async function checkOverdue(outletId: string): Promise<number> {
  const count = await triggerOverdueCheck();
  if (count > 0) {
    await refreshSessions(outletId);
    await refreshStats(outletId);
  }
  return count;
}

export function getLendingStore() {
  return {
    get activeSessions() { return activeSessions; },
    get overdueSessions() { return activeSessions.filter(s => s.status === 'overdue'); },
    get stats() { return lendingStats; },
    get isLoading() { return isLoading; },
    get error() { return error; },
    refreshSessions,
    refreshStats,
    checkOverdue,
  };
}
