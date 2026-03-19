import type { ReceiptData, TextStyle, Alignment } from './types';

// ESC/POS command constants
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

// Paper width in characters (58mm printer ≈ 32 chars, 80mm ≈ 48 chars)
const PAPER_WIDTH = 32;

/**
 * ESC/POS command builder for thermal receipt printers.
 * Builds a Uint8Array of raw ESC/POS commands.
 */
export class EscPosBuilder {
  private buffer: number[] = [];
  private charWidth: number;

  constructor(paperWidth: number = PAPER_WIDTH) {
    this.charWidth = paperWidth;
  }

  /** Initialize printer (reset to default state). */
  init(): this {
    this.buffer.push(ESC, 0x40); // ESC @
    return this;
  }

  /** Set text alignment. */
  align(alignment: Alignment): this {
    const n = alignment === 'left' ? 0 : alignment === 'center' ? 1 : 2;
    this.buffer.push(ESC, 0x61, n); // ESC a n
    return this;
  }

  /** Set bold on/off. */
  bold(on: boolean): this {
    this.buffer.push(ESC, 0x45, on ? 1 : 0); // ESC E n
    return this;
  }

  /** Set underline on/off. */
  underline(on: boolean): this {
    this.buffer.push(ESC, 0x2d, on ? 1 : 0); // ESC - n
    return this;
  }

  /** Set double width on/off. */
  doubleWidth(on: boolean): this {
    if (on) {
      this.buffer.push(GS, 0x21, 0x10); // GS ! 0x10
    } else {
      this.buffer.push(GS, 0x21, 0x00); // GS ! 0x00
    }
    return this;
  }

  /** Set double height on/off. */
  doubleHeight(on: boolean): this {
    if (on) {
      this.buffer.push(GS, 0x21, 0x01); // GS ! 0x01
    } else {
      this.buffer.push(GS, 0x21, 0x00); // GS ! 0x00
    }
    return this;
  }

  /** Set text style (convenience method). */
  style(style: TextStyle): this {
    if (style.alignment) this.align(style.alignment);
    if (style.bold !== undefined) this.bold(style.bold);
    if (style.underline !== undefined) this.underline(style.underline);
    if (style.doubleWidth !== undefined) this.doubleWidth(style.doubleWidth);
    if (style.doubleHeight !== undefined) this.doubleHeight(style.doubleHeight);
    return this;
  }

  /** Print a text line followed by newline. */
  text(content: string): this {
    const encoder = new TextEncoder();
    this.buffer.push(...encoder.encode(content), LF);
    return this;
  }

  /** Print an empty line. */
  newline(count: number = 1): this {
    for (let i = 0; i < count; i++) {
      this.buffer.push(LF);
    }
    return this;
  }

  /** Print a separator line (e.g., "--------------------------------"). */
  separator(char: string = '-'): this {
    this.text(char.repeat(this.charWidth));
    return this;
  }

  /** Print two columns (left-aligned text, right-aligned value). */
  columns(left: string, right: string): this {
    const leftLen = Array.from(left).length;
    const rightLen = Array.from(right).length;
    const gap = this.charWidth - leftLen - rightLen;
    if (gap > 0) {
      this.text(left + ' '.repeat(gap) + right);
    } else {
      // Truncate left text if too long
      const truncatedLeft = Array.from(left).slice(0, this.charWidth - rightLen - 1).join('');
      this.text(truncatedLeft + ' ' + right);
    }
    return this;
  }

  /** Cut paper (full cut). */
  cut(): this {
    this.newline(3);
    this.buffer.push(GS, 0x56, 0x00); // GS V 0 (full cut)
    return this;
  }

  /** Partial cut. */
  partialCut(): this {
    this.newline(3);
    this.buffer.push(GS, 0x56, 0x01); // GS V 1 (partial cut)
    return this;
  }

  /** Open cash drawer (kick pulse). */
  openCashDrawer(): this {
    this.buffer.push(ESC, 0x70, 0x00, 0x19, 0xfa); // ESC p 0 25 250
    return this;
  }

  /** Build the final byte array. */
  build(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

/**
 * Format currency for receipt (Indonesian Rupiah).
 */
function formatCurrency(amount: number): string {
  return 'Rp' + amount.toLocaleString('id-ID');
}

/**
 * Build a complete receipt from transaction data.
 */
export function buildReceipt(data: ReceiptData, paperWidth: number = PAPER_WIDTH): Uint8Array {
  const builder = new EscPosBuilder(paperWidth);

  builder
    .init()
    // Header — cafe info
    .style({ alignment: 'center', bold: true, doubleWidth: true })
    .text(data.cafe_name)
    .style({ bold: false, doubleWidth: false })
    .text(data.cafe_address)
    .text(data.cafe_phone)
    .separator('=')
    // Transaction info
    .align('left')
    .columns('No:', data.transaction_id.substring(0, 8).toUpperCase())
    .columns('Tanggal:', data.date)
    .columns('Kasir:', data.staff_name)
    .separator('-');

  // Items
  for (const item of data.items) {
    // Title on its own line if long
    if (item.title.length > paperWidth - 12) {
      builder.text(item.title.substring(0, paperWidth));
      builder.columns(
        `  ${item.quantity}x ${formatCurrency(item.unit_price)}`,
        formatCurrency(item.total)
      );
    } else {
      builder.text(item.title);
      builder.columns(
        `  ${item.quantity}x ${formatCurrency(item.unit_price)}`,
        formatCurrency(item.total)
      );
    }
  }

  builder.separator('-');

  // Totals
  builder
    .columns('Subtotal', formatCurrency(data.subtotal));

  if (data.discount > 0) {
    builder.columns('Diskon', '-' + formatCurrency(data.discount));
  }

  if (data.tax > 0) {
    builder.columns('PPN', formatCurrency(data.tax));
  }

  builder
    .separator('-')
    .bold(true)
    .columns('TOTAL', formatCurrency(data.total))
    .bold(false)
    .separator('-');

  // Payment info
  builder.columns('Bayar', data.payment_method.toUpperCase());

  if (data.amount_paid !== undefined) {
    builder.columns('Tunai', formatCurrency(data.amount_paid));
  }
  if (data.change !== undefined && data.change > 0) {
    builder.columns('Kembalian', formatCurrency(data.change));
  }

  builder.separator('=');

  // Footer
  builder
    .align('center')
    .newline(1)
    .text(data.footer_message ?? 'Terima kasih!')
    .text('Selamat membaca :)')
    .newline(1);

  builder.partialCut();

  return builder.build();
}
