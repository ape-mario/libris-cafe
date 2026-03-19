import type { Staff, AppRole } from './types';

let currentStaff = $state<Staff | null>(null);

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
