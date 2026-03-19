import type { Staff, AppRole } from './types';
import { restoreActiveOutlet, setActiveOutletId, setOutlets } from '../outlet/stores.svelte';
import { fetchOutlets } from '../outlet/service';

let currentStaff = $state<Staff | null>(null);
let authReady = $state(false);

export function getAuthReady(): boolean {
  return authReady;
}

export function setAuthReady(ready: boolean): void {
  authReady = ready;
}

export function getCurrentStaff(): Staff | null {
  return currentStaff;
}

export function setCurrentStaff(staff: Staff | null): void {
  currentStaff = staff;
}

export function getAppRole(): AppRole {
  if (!currentStaff) return 'guest';
  return currentStaff.role;
}

export function isOwner(): boolean {
  return currentStaff?.role === 'owner';
}

export function isStaff(): boolean {
  return currentStaff !== null;
}

export function isGuest(): boolean {
  return currentStaff === null;
}

export async function initOutletContext(): Promise<void> {
  try {
    const outlets = await fetchOutlets();
    setOutlets(outlets);

    // Restore previously selected outlet, or default to first
    const restored = restoreActiveOutlet();
    if (!restored && outlets.length > 0) {
      setActiveOutletId(outlets[0].id);
    }
  } catch {
    // Supabase not configured or fetch failed — single-outlet mode
  }
}
