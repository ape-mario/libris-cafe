import { createProvider } from './base';
import type { SyncProvider } from './provider';

export function createWebRTCProvider(): SyncProvider {
	return createProvider(async (doc, roomCode, setStatus) => {
		const { WebrtcProvider } = await import('y-webrtc');
		const provider = new WebrtcProvider(`libris-${roomCode}`, doc, {
			signaling: [
				'wss://signaling.yjs.dev',
				'wss://y-webrtc-signaling-eu.herokuapp.com',
				'wss://y-webrtc-signaling-us.herokuapp.com'
			]
		});

		provider.on('synced', ({ synced }: { synced: boolean }) => {
			if (synced) setStatus('connected');
		});

		provider.on('peers', ({ webrtcPeers }: { webrtcPeers: any[] }) => {
			if (webrtcPeers.length > 0) {
				setStatus('connected');
			}
		});

		return { destroy: () => provider.destroy() };
	});
}
