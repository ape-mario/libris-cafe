import { createProvider } from './base';
import type { SyncProvider } from './provider';
import * as Y from 'yjs';

const log = (...args: unknown[]) => console.log('[Libris Sync]', ...args);

/**
 * Yjs sync provider using Trystero (Nostr strategy) for serverless
 * peer-to-peer discovery. No signaling server required.
 */
export function createTrysteroProvider(): SyncProvider {
	return createProvider(async (doc, roomCode, setStatus) => {
		log('joining room via Nostr relays, roomCode:', roomCode);

		const { joinRoom, getRelaySockets } = await import('trystero/nostr');

		const room = joinRoom(
			{
				appId: 'libris-books',
				relayUrls: [
					'wss://relay.damus.io',
					'wss://nos.lol',
					'wss://relay.nostraddress.com',
					'wss://relay.mostro.network',
					'wss://nostr.data.haus',
					'wss://relay.binaryrobot.com',
					'wss://nostr.vulpem.com',
					'wss://relay.agorist.space'
				]
			},
			`libris-${roomCode}`
		);

		// Log relay connection status
		setTimeout(() => {
			try {
				const sockets = getRelaySockets();
				for (const [url, socket] of Object.entries(sockets)) {
					const state = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][socket.readyState] || 'UNKNOWN';
					log(`relay ${url}: ${state}`);
				}
			} catch (e) {
				log('could not read relay sockets:', e);
			}
		}, 3000);

		// Create binary data channels for Y.Doc sync
		const [sendSync, onSync] = room.makeAction<ArrayBuffer>('yjs-sync');
		const [sendUpdate, onUpdate] = room.makeAction<ArrayBuffer>('yjs-update');

		// When a new peer joins, send them our full state
		room.onPeerJoin((peerId) => {
			log('peer joined:', peerId);
			setStatus('connected');
			const state = Y.encodeStateAsUpdate(doc);
			log('sending full state to peer, bytes:', state.byteLength);
			sendSync(new Uint8Array(state).buffer as ArrayBuffer, peerId);
		});

		room.onPeerLeave((peerId) => {
			log('peer left:', peerId);
			if (Object.keys(room.getPeers()).length === 0) {
				setStatus('connecting');
			}
		});

		// Apply incoming sync/updates, tagged as 'remote' to avoid re-broadcast
		onSync((data) => {
			log('received full state from peer, bytes:', data.byteLength);
			Y.applyUpdate(doc, new Uint8Array(data), 'remote');
			log('applied state, users:', doc.getMap('users').size, 'books:', doc.getMap('books').size);
		});

		onUpdate((data) => {
			log('received update from peer, bytes:', data.byteLength);
			Y.applyUpdate(doc, new Uint8Array(data), 'remote');
		});

		// Broadcast local changes to all peers
		const observer = (update: Uint8Array, origin: unknown) => {
			if (origin === 'remote') return;
			sendUpdate(new Uint8Array(update).buffer as ArrayBuffer);
		};
		doc.on('update', observer);

		return {
			destroy: () => {
				log('destroying provider');
				doc.off('update', observer);
				room.leave();
			}
		};
	});
}
