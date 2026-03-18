import type * as Y from 'yjs';

export type SyncStatus = 'disconnected' | 'connecting' | 'connected' | 'offline';

export interface SyncProvider {
	connect(doc: Y.Doc, roomCode: string): void;
	disconnect(): void;
	readonly status: SyncStatus;
	onStatusChange(cb: (status: SyncStatus) => void): () => void;
}

export type ProviderType = 'partykit' | 'hocuspocus';

export interface SyncConfig {
	provider: ProviderType;
	serverUrl?: string; // required for hocuspocus
}

export function getSyncConfig(): SyncConfig {
	const raw = localStorage.getItem('libris_sync_config');
	if (!raw) return { provider: 'partykit' };
	try {
		return JSON.parse(raw);
	} catch {
		return { provider: 'partykit' };
	}
}

export function saveSyncConfig(config: SyncConfig): void {
	localStorage.setItem('libris_sync_config', JSON.stringify(config));
}
