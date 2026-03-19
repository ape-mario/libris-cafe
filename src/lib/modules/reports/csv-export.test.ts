import { describe, it, expect } from 'vitest';
import { generateCsv } from './csv-export';
import type { ReportData } from './types';

const sampleReport: ReportData = {
  title_en: 'Daily Sales Report',
  title_id: 'Laporan Penjualan Harian',
  columns: [
    { key: 'date', label_en: 'Date', label_id: 'Tanggal', format: 'date' },
    { key: 'total', label_en: 'Total', label_id: 'Total', format: 'currency' },
    { key: 'items', label_en: 'Items', label_id: 'Item', format: 'number' },
  ],
  rows: [
    { date: '2026-03-01', total: 150000, items: 5 },
    { date: '2026-03-02', total: 225000, items: 8 },
    { date: '2026-03-03', total: 0, items: 0 },
  ],
  generated_at: '2026-03-19T10:00:00Z',
  config: {
    type: 'sales_daily',
    format: 'csv',
    outlet_id: 'outlet-1',
    date_from: '2026-03-01',
    date_to: '2026-03-03',
  },
};

describe('generateCsv', () => {
  it('should generate CSV with English headers', () => {
    const csv = generateCsv(sampleReport, 'en');

    expect(csv).toContain('\ufeff'); // BOM
    expect(csv).toContain('Date,Total,Items');
    expect(csv).toContain('2026-03-01,150000.00,5');
    expect(csv).toContain('2026-03-02,225000.00,8');
    expect(csv).toContain('2026-03-03,0.00,0');
  });

  it('should generate CSV with Indonesian headers', () => {
    const csv = generateCsv(sampleReport, 'id');

    expect(csv).toContain('Tanggal,Total,Item');
  });

  it('should escape fields containing commas', () => {
    const report: ReportData = {
      ...sampleReport,
      columns: [
        { key: 'name', label_en: 'Name', label_id: 'Nama', format: 'text' },
      ],
      rows: [
        { name: 'Smith, John' },
      ],
    };

    const csv = generateCsv(report, 'en');
    expect(csv).toContain('"Smith, John"');
  });

  it('should escape fields containing double quotes', () => {
    const report: ReportData = {
      ...sampleReport,
      columns: [
        { key: 'title', label_en: 'Title', label_id: 'Judul', format: 'text' },
      ],
      rows: [
        { title: 'The "Great" Book' },
      ],
    };

    const csv = generateCsv(report, 'en');
    expect(csv).toContain('"The ""Great"" Book"');
  });

  it('should handle null and undefined values', () => {
    const report: ReportData = {
      ...sampleReport,
      columns: [
        { key: 'a', label_en: 'A', label_id: 'A', format: 'text' },
        { key: 'b', label_en: 'B', label_id: 'B', format: 'number' },
      ],
      rows: [
        { a: null, b: undefined },
      ],
    };

    const csv = generateCsv(report, 'en');
    const lines = csv.split('\r\n');
    // Data line should be just a comma (two empty fields)
    expect(lines[1]).toBe(',');
  });

  it('should format percentage values correctly', () => {
    const report: ReportData = {
      ...sampleReport,
      columns: [
        { key: 'rate', label_en: 'Rate', label_id: 'Rate', format: 'percentage' },
      ],
      rows: [
        { rate: 15.678 },
      ],
    };

    const csv = generateCsv(report, 'en');
    expect(csv).toContain('15.7%');
  });
});
