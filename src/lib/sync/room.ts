const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 30 chars, no 0/O/1/I/L
const MAX_UNBIASED = Math.floor(256 / CHARS.length) * CHARS.length; // 240

export function generateRoomCode(): string {
	// Rejection sampling to avoid modular bias
	const chars: string[] = [];
	while (chars.length < 8) {
		const bytes = crypto.getRandomValues(new Uint8Array(8 - chars.length));
		for (const b of bytes) {
			if (b < MAX_UNBIASED && chars.length < 8) {
				chars.push(CHARS[b % CHARS.length]);
			}
		}
	}
	return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

export function isValidRoomCode(code: string): boolean {
	const normalized = code.toUpperCase().replace(/-/g, '');
	if (normalized.length !== 8) return false;
	return [...normalized].every((c) => CHARS.includes(c));
}

export function formatRoomCode(code: string): string {
	const normalized = code.toUpperCase().replace(/[^A-Z2-9]/g, '');
	if (normalized.length !== 8) return code.toUpperCase();
	return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

export function getRoomLink(roomCode: string): string {
	return `${window.location.origin}/join/${roomCode}`;
}

export function parseRoomCodeFromUrl(url: string): string | null {
	try {
		const parsed = new URL(url);
		const match = parsed.pathname.match(/^\/join\/([A-Za-z2-9-]+)$/);
		if (!match) return null;
		const code = formatRoomCode(match[1]);
		return isValidRoomCode(code) ? code : null;
	} catch {
		return null;
	}
}
