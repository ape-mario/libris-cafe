import { goto } from '$app/navigation';
import { base } from '$app/paths';
import { getCurrentStaff } from './stores.svelte';
import type { AppRole } from './types';

/**
 * Check if current user has required role. Redirect to login if not.
 * Call in onMount() of protected layouts.
 */
export function requireRole(requiredRole: AppRole): boolean {
  const staff = getCurrentStaff();

  if (requiredRole === 'guest') return true;

  if (!staff) {
    goto(`${base}/login`);
    return false;
  }

  if (requiredRole === 'owner' && staff.role !== 'owner') {
    goto(`${base}/`);
    return false;
  }

  return true;
}
