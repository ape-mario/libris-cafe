import { describe, it, expect } from 'vitest';
import { EscPosBuilder, buildReceipt } from './escpos';
import type { ReceiptData } from './types';

describe('EscPosBuilder', () => {
  it('should initialize with ESC @ command', () => {
    const builder = new EscPosBuilder();
    const data = builder.init().build();

    // ESC @ = 0x1b 0x40
    expect(data[0]).toBe(0x1b);
    expect(data[1]).toBe(0x40);
  });

  it('should set center alignment', () => {
    const builder = new EscPosBuilder();
    const data = builder.align('center').build();

    // ESC a 1 = 0x1b 0x61 0x01
    expect(data[0]).toBe(0x1b);
    expect(data[1]).toBe(0x61);
    expect(data[2]).toBe(1);
  });

  it('should toggle bold on and off', () => {
    const builder = new EscPosBuilder();
    const data = builder.bold(true).bold(false).build();

    // ESC E 1 then ESC E 0
    expect(data[0]).toBe(0x1b);
    expect(data[1]).toBe(0x45);
    expect(data[2]).toBe(1);
    expect(data[3]).toBe(0x1b);
    expect(data[4]).toBe(0x45);
    expect(data[5]).toBe(0);
  });

  it('should produce text followed by LF', () => {
    const builder = new EscPosBuilder();
    const data = builder.text('Hello').build();
    const decoder = new TextDecoder();

    // Last byte should be LF (0x0a)
    expect(data[data.length - 1]).toBe(0x0a);
    // Content should contain "Hello"
    expect(decoder.decode(data.slice(0, 5))).toBe('Hello');
  });

  it('should produce separator line of correct width', () => {
    const width = 32;
    const builder = new EscPosBuilder(width);
    const data = builder.separator('-').build();
    const decoded = new TextDecoder().decode(data);

    // Should contain 32 dashes
    expect(decoded).toContain('-'.repeat(width));
  });

  it('should produce two-column layout', () => {
    const builder = new EscPosBuilder(32);
    const data = builder.columns('Subtotal', 'Rp50.000').build();
    const decoded = new TextDecoder().decode(data);

    expect(decoded).toContain('Subtotal');
    expect(decoded).toContain('Rp50.000');
    // Total length before LF should be 32
    const lineContent = decoded.split('\n')[0];
    expect(lineContent.length).toBe(32);
  });

  it('should produce full cut command', () => {
    const builder = new EscPosBuilder();
    const data = builder.cut().build();
    const arr = Array.from(data);

    // Should contain GS V 0 = 0x1d 0x56 0x00
    const gsIdx = arr.lastIndexOf(0x1d);
    expect(arr[gsIdx + 1]).toBe(0x56);
    expect(arr[gsIdx + 2]).toBe(0x00);
  });
});

describe('buildReceipt', () => {
  it('should build a complete receipt byte array', () => {
    const receiptData: ReceiptData = {
      cafe_name: 'Libris Cafe',
      cafe_address: 'Jl. Buku No. 42',
      cafe_phone: '021-1234567',
      transaction_id: 'abc12345-6789',
      date: '2026-03-19 14:30',
      staff_name: 'Adi',
      items: [
        { title: 'Laskar Pelangi', quantity: 1, unit_price: 75000, total: 75000 },
        { title: 'Bumi Manusia', quantity: 1, unit_price: 95000, total: 95000 },
      ],
      subtotal: 170000,
      discount: 0,
      tax: 18700,
      total: 188700,
      payment_method: 'cash',
      amount_paid: 200000,
      change: 11300,
    };

    const bytes = buildReceipt(receiptData);

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);

    // Should start with init command ESC @
    expect(bytes[0]).toBe(0x1b);
    expect(bytes[1]).toBe(0x40);

    // Should contain cafe name somewhere in the output
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toContain('Libris Cafe');
    expect(decoded).toContain('Laskar Pelangi');
    expect(decoded).toContain('Bumi Manusia');
    expect(decoded).toContain('Terima kasih!');
  });
});
