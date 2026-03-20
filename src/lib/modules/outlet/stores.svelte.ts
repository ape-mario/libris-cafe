import type { Outlet, OutletTransfer } from './types';

let outlets = $state<Outlet[]>([]);
let activeOutletId = $state<string | null>(null);
let pendingTransfers = $state<OutletTransfer[]>([]);

export function getOutlets(): Outlet[] {
  return outlets;
}

export function setOutlets(list: Outlet[]): void {
  outlets = list;
}

export function getActiveOutletId(): string | null {
  return activeOutletId;
}

export function getActiveOutlet(): Outlet | null {
  return outlets.find(o => o.id === activeOutletId) ?? null;
}

export function setActiveOutletId(id: string): void {
  activeOutletId = id;
  // Persist to localStorage so it survives page reload
  try {
    localStorage.setItem('libris_active_outlet', id);
  } catch {
    // localStorage unavailable
  }
}

export function restoreActiveOutlet(): string | null {
  try {
    const stored = localStorage.getItem('libris_active_outlet');
    if (stored) {
      activeOutletId = stored;
      return stored;
    }
  } catch {
    // localStorage unavailable
  }
  return null;
}

export function getPendingTransfers(): OutletTransfer[] {
  return pendingTransfers;
}

export function setPendingTransfers(transfers: OutletTransfer[]): void {
  pendingTransfers = transfers;
}

export const outletStore = {
  get outlets() { return outlets; },
  get activeOutletId() { return activeOutletId; },
  get activeOutlet() { return outlets.find(o => o.id === activeOutletId) ?? null; },
  get pendingTransfers() { return pendingTransfers; }
};

export function getPendingTransferCount(): number {
  return pendingTransfers.filter(t =>
    t.status === 'requested' || t.status === 'approved' || t.status === 'shipped'
  ).length;
}
