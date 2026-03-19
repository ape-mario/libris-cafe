import type { ReportData, ReportColumn } from './types';

/**
 * Format a cell value for CSV based on its column format.
 */
function formatCell(value: unknown, column: ReportColumn): string {
  if (value === null || value === undefined) return '';

  switch (column.format) {
    case 'currency':
      return typeof value === 'number' ? value.toFixed(2) : String(value);
    case 'percentage':
      return typeof value === 'number' ? `${value.toFixed(1)}%` : String(value);
    case 'number':
      return String(value);
    case 'date':
      return String(value);
    default:
      return String(value);
  }
}

/**
 * Escape a CSV field (RFC 4180 compliant).
 * Wraps in quotes if the value contains commas, quotes, or newlines.
 */
function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

/**
 * Generate CSV string from report data.
 * @param data - Report data with columns and rows.
 * @param lang - Language for column headers ('en' or 'id').
 * @returns CSV string with BOM for Excel compatibility.
 */
export function generateCsv(data: ReportData, lang: 'en' | 'id' = 'en'): string {
  const lines: string[] = [];

  // Header row
  const headers = data.columns.map(col =>
    escapeCsv(lang === 'id' ? col.label_id : col.label_en)
  );
  lines.push(headers.join(','));

  // Data rows
  for (const row of data.rows) {
    const cells = data.columns.map(col => {
      const value = row[col.key];
      return escapeCsv(formatCell(value, col));
    });
    lines.push(cells.join(','));
  }

  // BOM + content (BOM helps Excel detect UTF-8)
  return '\ufeff' + lines.join('\r\n');
}

/**
 * Trigger a CSV file download in the browser.
 */
export function downloadCsv(data: ReportData, lang: 'en' | 'id' = 'en'): void {
  const csv = generateCsv(data, lang);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const title = lang === 'id' ? data.title_id : data.title_en;
  const filename = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_${data.config.date_from}_${data.config.date_to}.csv`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
