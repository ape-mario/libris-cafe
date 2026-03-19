import type { ReceiptData } from './types';

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Format receipt as plain text (for WhatsApp).
 */
export function formatReceiptText(data: ReceiptData): string {
  const divider = '\u2500'.repeat(30);
  const lines: string[] = [];

  lines.push(`*${data.cafeName}*`);
  lines.push(data.cafeAddress);
  lines.push(divider);
  lines.push(`Tanggal: ${data.date}`);
  lines.push(`Kasir: ${data.staffName}`);
  lines.push(`No: ${data.orderId}`);
  lines.push(divider);

  for (const item of data.items) {
    const itemTotal = formatRp(item.total);
    lines.push(`${item.title}`);
    lines.push(`  ${item.quantity}x ${formatRp(item.unitPrice)}  ${itemTotal}`);
  }

  lines.push(divider);
  lines.push(`Subtotal: ${formatRp(data.subtotal)}`);

  if (data.discount > 0) {
    lines.push(`Diskon: -${formatRp(data.discount)}`);
  }

  if (data.tax > 0) {
    lines.push(`Pajak: ${formatRp(data.tax)}`);
  }

  lines.push(`*TOTAL: ${formatRp(data.total)}*`);
  lines.push(divider);
  lines.push(`Pembayaran: ${formatPaymentMethod(data.paymentMethod)}`);

  if (data.paymentReference) {
    lines.push(`Ref: ${data.paymentReference}`);
  }

  lines.push('');
  lines.push('Terima kasih! \u{1F4DA}');

  return lines.join('\n');
}

/**
 * Format receipt as HTML (for email).
 */
export function formatReceiptHtml(data: ReceiptData): string {
  const itemRows = data.items.map(item => `
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #f0ebe4;">
        <div style="font-weight: 500; color: #2d2a26;">${escapeHtml(item.title)}</div>
        <div style="font-size: 12px; color: #8a857e;">${item.quantity}x ${formatRp(item.unitPrice)}</div>
      </td>
      <td style="padding: 8px 0; text-align: right; border-bottom: 1px solid #f0ebe4; color: #2d2a26;">
        ${formatRp(item.total)}
      </td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; background-color: #faf8f5; font-family: 'Source Sans 3', 'Segoe UI', sans-serif;">
  <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
    <!-- Header -->
    <div style="background: #d4763c; padding: 24px; text-align: center;">
      <h1 style="margin: 0; color: #faf8f5; font-family: 'Playfair Display', Georgia, serif; font-size: 24px;">
        ${escapeHtml(data.cafeName)}
      </h1>
      <p style="margin: 4px 0 0; color: #faf8f5; opacity: 0.8; font-size: 13px;">
        ${escapeHtml(data.cafeAddress)}
      </p>
    </div>

    <!-- Receipt Info -->
    <div style="padding: 20px 24px 0;">
      <table style="width: 100%; font-size: 13px; color: #8a857e;">
        <tr>
          <td>Tanggal</td>
          <td style="text-align: right;">${data.date}</td>
        </tr>
        <tr>
          <td>Kasir</td>
          <td style="text-align: right;">${escapeHtml(data.staffName)}</td>
        </tr>
        <tr>
          <td>No. Transaksi</td>
          <td style="text-align: right; font-family: monospace; font-size: 11px;">${escapeHtml(data.orderId)}</td>
        </tr>
      </table>
    </div>

    <!-- Items -->
    <div style="padding: 16px 24px;">
      <table style="width: 100%; font-size: 14px;">
        ${itemRows}
      </table>
    </div>

    <!-- Totals -->
    <div style="padding: 0 24px 20px;">
      <table style="width: 100%; font-size: 14px;">
        <tr>
          <td style="padding: 4px 0; color: #8a857e;">Subtotal</td>
          <td style="text-align: right; color: #2d2a26;">${formatRp(data.subtotal)}</td>
        </tr>
        ${data.discount > 0 ? `
        <tr>
          <td style="padding: 4px 0; color: #8a857e;">Diskon</td>
          <td style="text-align: right; color: #c84b6c;">-${formatRp(data.discount)}</td>
        </tr>
        ` : ''}
        ${data.tax > 0 ? `
        <tr>
          <td style="padding: 4px 0; color: #8a857e;">Pajak</td>
          <td style="text-align: right; color: #2d2a26;">${formatRp(data.tax)}</td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding: 12px 0 0; font-weight: 700; font-size: 18px; color: #2d2a26; border-top: 2px solid #2d2a26;">TOTAL</td>
          <td style="padding: 12px 0 0; text-align: right; font-weight: 700; font-size: 18px; color: #2d2a26; border-top: 2px solid #2d2a26;">${formatRp(data.total)}</td>
        </tr>
      </table>
    </div>

    <!-- Payment Info -->
    <div style="padding: 16px 24px; background: #f8f5f0; border-top: 1px solid #f0ebe4;">
      <p style="margin: 0; font-size: 13px; color: #8a857e;">
        Pembayaran: <strong style="color: #2d2a26;">${formatPaymentMethod(data.paymentMethod)}</strong>
        ${data.paymentReference ? `<br>Ref: <code style="font-size: 11px;">${escapeHtml(data.paymentReference)}</code>` : ''}
      </p>
    </div>

    <!-- Footer -->
    <div style="padding: 20px 24px; text-align: center;">
      <p style="margin: 0; font-size: 13px; color: #8a857e;">Terima kasih telah berbelanja di ${escapeHtml(data.cafeName)}!</p>
    </div>
  </div>
</body>
</html>`;
}

function formatRp(amount: number): string {
  return `Rp ${amount.toLocaleString('id-ID')}`;
}

function formatPaymentMethod(method: string): string {
  const map: Record<string, string> = {
    cash: 'Tunai',
    qris: 'QRIS',
    ewallet: 'E-Wallet',
    bank_transfer: 'Transfer Bank',
    card: 'Kartu',
  };
  return map[method] ?? method;
}
