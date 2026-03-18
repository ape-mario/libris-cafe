import { createProvider } from './base';
import type { SyncProvider } from './provider';
import * as Y from 'yjs';

/**
 * Yjs sync provider using Trystero (Nostr strategy) for serverless
 * peer-to-peer discovery. No signaling server required.
 */
export function createTrysteroProvider(): SyncProvider {
	return createProvider(async (doc, roomCode, setStatus) => {
		const { joinRoom } = await import('trystero/nostr');

		const room = joinRoom(
			{
				appId: 'libris-books',
				relayRedundancy: 3
			},
			`libris-${roomCode}`
		);

		// Create binary data channels for Y.Doc sync
		const [sendSync, onSync] = room.makeAction<ArrayBuffer>('yjs-sync');
		const [sendUpdate, onUpdate] = room.makeAction<ArrayBuffer>('yjs-update');

		// When a new peer joins, send them our full state
		room.onPeerJoin((peerId) => {
			setStatus('connected');
			const state = Y.encodeStateAsUpdate(doc);
			sendSync(state.buffer as ArrayBuffer, peerId);
		});

		room.onPeerLeave(() => {
			if (Object.keys(room.getPeers()).length === 0) {
				setStatus('connecting');
			}
		});

		// Apply incoming sync/updates, tagged as 'remote' to avoid re-broadcast
		onSync((data) => {
			Y.applyUpdate(doc, new Uint8Array(data), 'remote');
		});

		onUpdate((data) => {
			Y.applyUpdate(doc, new Uint8Array(data), 'remote');
		});

		// Broadcast local changes to all peers
		const observer = (update: Uint8Array, origin: unknown) => {
			if (origin === 'remote') return;
			sendUpdate(update.buffer as ArrayBuffer);
		};
		doc.on('update', observer);

		return {
			destroy: () => {
				doc.off('update', observer);
				room.leave();
			}
		};
	});
}
