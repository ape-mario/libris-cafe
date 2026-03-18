import { db } from '$lib/db';
import { exportData, importData } from './backup';

const SYNC_CONFIG_ID = 'default';

export interface SyncStatus {
  configured: boolean;
  serverUrl: string;
  lastSyncedAt: Date | undefined;
  autoSync: boolean;
}

export async function getSyncConfig(): Promise<SyncStatus> {
  const config = await db.syncConfig.get(SYNC_CONFIG_ID);
  return {
    configured: !!config?.serverUrl,
    serverUrl: config?.serverUrl || '',
    lastSyncedAt: config?.lastSyncedAt,
    autoSync: config?.autoSync || false
  };
}

export async function saveSyncConfig(serverUrl: string, autoSync: boolean): Promise<void> {
  const existing = await db.syncConfig.get(SYNC_CONFIG_ID);
  if (existing) {
    await db.syncConfig.update(SYNC_CONFIG_ID, { serverUrl, autoSync });
  } else {
    await db.syncConfig.add({ id: SYNC_CONFIG_ID, serverUrl, autoSync });
  }
}

export async function pushSync(): Promise<void> {
  const config = await db.syncConfig.get(SYNC_CONFIG_ID);
  if (!config?.serverUrl) throw new Error('Sync not configured');

  const data = await exportData();
  const url = config.serverUrl.replace(/\/$/, '');

  // Try to get existing doc for revision
  let rev: string | undefined;
  try {
    const existing = await fetch(`${url}/mybooks_sync`);
    if (existing.ok) {
      const doc = await existing.json();
      rev = doc._rev;
    }
  } catch {
    // Doc doesn't exist yet, that's fine
  }

  const payload: any = {
    _id: 'mybooks_sync',
    data: JSON.parse(data),
    updatedAt: new Date().toISOString()
  };
  if (rev) payload._rev = rev;

  const res = await fetch(`${url}/mybooks_sync`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Push failed: ${err}`);
  }

  await db.syncConfig.update(SYNC_CONFIG_ID, { lastSyncedAt: new Date() });
}

export async function pullSync(): Promise<void> {
  const config = await db.syncConfig.get(SYNC_CONFIG_ID);
  if (!config?.serverUrl) throw new Error('Sync not configured');

  const url = config.serverUrl.replace(/\/$/, '');
  const res = await fetch(`${url}/mybooks_sync`);

  if (!res.ok) {
    if (res.status === 404) throw new Error('No remote data found. Push first.');
    throw new Error(`Pull failed: ${res.statusText}`);
  }

  const doc = await res.json();
  if (!doc.data) throw new Error('Invalid remote data');

  await importData(JSON.stringify(doc.data));
  await db.syncConfig.update(SYNC_CONFIG_ID, { lastSyncedAt: new Date() });
}

export async function fullSync(): Promise<'pushed' | 'pulled' | 'conflict'> {
  const config = await db.syncConfig.get(SYNC_CONFIG_ID);
  if (!config?.serverUrl) throw new Error('Sync not configured');

  const url = config.serverUrl.replace(/\/$/, '');

  // Check remote
  let remoteTimestamp: Date | null = null;
  try {
    const res = await fetch(`${url}/mybooks_sync`);
    if (res.ok) {
      const doc = await res.json();
      if (doc.updatedAt) remoteTimestamp = new Date(doc.updatedAt);
    }
  } catch {
    // No remote, just push
  }

  const localTimestamp = config.lastSyncedAt;

  if (!remoteTimestamp) {
    // No remote data, push ours
    await pushSync();
    return 'pushed';
  }

  if (!localTimestamp || remoteTimestamp > localTimestamp) {
    // Remote is newer, pull
    await pullSync();
    return 'pulled';
  }

  // Local is newer or same, push
  await pushSync();
  return 'pushed';
}
