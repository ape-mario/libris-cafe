import { createProvider } from './base';
import type { SyncProvider } from './provider';

export function createHocuspocusProvider(serverUrl: string): SyncProvider {
	return createProvider(async (doc, roomCode, setStatus) => {
		const { HocuspocusProvider } = await import('@hocuspocus/provider');
		const provider = new HocuspocusProvider({
			url: serverUrl,
			name: roomCode,
			document: doc,
			onSynced() {
				setStatus('connected');
			},
			onClose() {
				setStatus(navigator.onLine ? 'connecting' : 'offline');
			},
			onDisconnect() {
				setStatus(navigator.onLine ? 'connecting' : 'offline');
			}
		});

		return { destroy: () => provider.destroy() };
	});
}
