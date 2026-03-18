import type { SyncProvider, SyncStatus } from './provider';
import { getSyncConfig, saveSyncConfig, type SyncConfig } from './provider';
import { createPartyKitProvider } from './partykit';
import { createHocuspocusProvider } from './hocuspocus';
import { createWebRTCProvider } from './webrtc';
import { generateRoomCode } from './room';
import { doc } from '$lib/db';

const ROOM_KEY = 'libris_room_code';

let provider: SyncProvider | null = null;
let currentStatus: SyncStatus = 'disconnected';
let currentRoomCode: string | null = null;
const listeners = new Set<(status: SyncStatus) => void>();

function notifyListeners() {
	listeners.forEach((cb) => cb(currentStatus));
}

function createProvider(config: SyncConfig): SyncProvider {
	if (config.provider === 'hocuspocus' && config.serverUrl) {
		return createHocuspocusProvider(config.serverUrl);
	}
	if (config.provider === 'partykit') {
		return createPartyKitProvider();
	}
	return createWebRTCProvider();
}

export function getSyncStatus(): SyncStatus {
	return currentStatus;
}

export function getRoomCode(): string | null {
	if (currentRoomCode) return currentRoomCode;
	return localStorage.getItem(ROOM_KEY);
}

export function onSyncStatusChange(cb: (status: SyncStatus) => void): () => void {
	listeners.add(cb);
	return () => listeners.delete(cb);
}

export function createRoom(): string {
	const code = generateRoomCode();
	connectToRoom(code);
	return code;
}

export function joinRoom(code: string): void {
	connectToRoom(code);
}

export function leaveRoom(): void {
	if (provider) {
		provider.disconnect();
		provider = null;
	}
	currentRoomCode = null;
	currentStatus = 'disconnected';
	localStorage.removeItem(ROOM_KEY);
	notifyListeners();
}

export function connectToRoom(code: string): void {
	// Disconnect existing
	if (provider) {
		provider.disconnect();
	}

	const config = getSyncConfig();
	provider = createProvider(config);

	// Listen for status changes
	provider.onStatusChange((status) => {
		currentStatus = status;
		notifyListeners();
	});

	currentRoomCode = code;
	localStorage.setItem(ROOM_KEY, code);
	provider.connect(doc, code);
}

/**
 * Auto-reconnect if a room code was previously saved.
 * Called on app startup from +layout.svelte.
 */
export function autoReconnect(): void {
	const code = localStorage.getItem(ROOM_KEY);
	if (code) {
		connectToRoom(code);
	}
}
