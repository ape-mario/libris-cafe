import { describe, it, expect } from 'vitest';
import {
	generateRoomCode,
	isValidRoomCode,
	formatRoomCode,
	parseRoomCodeFromUrl
} from './room';

describe('Room codes', () => {
	it('generates 8-character code in XXXX-XXXX format', () => {
		const code = generateRoomCode();
		expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
	});

	it('excludes ambiguous characters (0, O, 1, I, L)', () => {
		for (let i = 0; i < 100; i++) {
			const code = generateRoomCode();
			expect(code).not.toMatch(/[01OIL]/);
		}
	});

	it('validates correct format', () => {
		expect(isValidRoomCode('ABCD-EF23')).toBe(true);
		expect(isValidRoomCode('abcd-ef23')).toBe(true);
		expect(isValidRoomCode('ABC')).toBe(false);
		expect(isValidRoomCode('ABCD-EFGI')).toBe(false); // I is ambiguous
	});

	it('handles multiple dashes in validation', () => {
		expect(isValidRoomCode('AB-CD-EF-23')).toBe(true); // 8 valid chars after removing dashes
	});

	it('formats room code to uppercase with dash', () => {
		expect(formatRoomCode('abcdef23')).toBe('ABCD-EF23');
		expect(formatRoomCode('ABCD-EF23')).toBe('ABCD-EF23');
	});

	it('parseRoomCodeFromUrl extracts valid code', () => {
		const code = parseRoomCodeFromUrl('https://libris.app/join/ABCD-EF23');
		expect(code).toBe('ABCD-EF23');
	});

	it('parseRoomCodeFromUrl works with base path', () => {
		const code = parseRoomCodeFromUrl('https://user.github.io/libris/join/ABCD-EF23');
		expect(code).toBe('ABCD-EF23');
	});

	it('parseRoomCodeFromUrl returns null for invalid URL', () => {
		expect(parseRoomCodeFromUrl('https://libris.app/settings')).toBeNull();
		expect(parseRoomCodeFromUrl('not-a-url')).toBeNull();
	});
});
