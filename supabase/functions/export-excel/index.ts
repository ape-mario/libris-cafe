// supabase/functions/export-excel/index.ts
// Generates Excel (.xlsx) reports using ExcelJS.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

// @ts-ignore: Deno-style import
import ExcelJS from 'https://esm.sh/exceljs@4.4.0';

interface ReportColumn {
  key: string;
  label_en: string;
  label_id: string;
  format?: string;
}

interface ReportData {
  title_en: string;
  title_id: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  generated_at: string;
  config: { date_from: string; date_to: string };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { report, lang = 'en' }: { report: ReportData; lang: 'en' | 'id' } = await req.json();

    const title = lang === 'id' ? report.title_id : report.title_en;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Libris Cafe';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(title.substring(0, 31)); // Excel sheet name max 31 chars

    // Title row (merged)
    sheet.mergeCells(1, 1, 1, report.columns.length);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = title;
    titleCell.font = { size: 14, bold: true };
    titleCell.alignment = { horizontal: 'left' };

    // Date range row
    sheet.mergeCells(2, 1, 2, report.columns.length);
    const dateCell = sheet.getCell(2, 1);
    dateCell.value = `${report.config.date_from} — ${report.config.date_to}`;
    dateCell.font = { size: 10, color: { argb: 'FF666666' } };

    // Empty row
    // Row 3 is blank

    // Header row (row 4)
    const headerRow = sheet.getRow(4);
    report.columns.forEach((col, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = lang === 'id' ? col.label_id : col.label_en;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4F463C' }, // Dark brown (matches cafe theme)
      };
      cell.alignment = { horizontal: 'center' };
      cell.border = {
        bottom: { style: 'thin' },
      };
    });

    // Data rows (starting at row 5)
    report.rows.forEach((row, rowIdx) => {
      const excelRow = sheet.getRow(5 + rowIdx);
      report.columns.forEach((col, colIdx) => {
        const cell = excelRow.getCell(colIdx + 1);
        const value = row[col.key];

        // Set value with proper type
        switch (col.format) {
          case 'currency':
            cell.value = typeof value === 'number' ? value : 0;
            cell.numFmt = '#,##0';
            break;
          case 'percentage':
            cell.value = typeof value === 'number' ? value / 100 : 0;
            cell.numFmt = '0.0%';
            break;
          case 'number':
            cell.value = typeof value === 'number' ? value : 0;
            cell.numFmt = '#,##0';
            break;
          case 'date':
            cell.value = value ? new Date(String(value)) : '';
            cell.numFmt = 'yyyy-mm-dd';
            break;
          default:
            cell.value = value !== null && value !== undefined ? String(value) : '';
        }

        // Alternate row shading
        if (rowIdx % 2 === 1) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF5F3F0' },
          };
        }
      });
    });

    // Auto-fit column widths (approximate)
    report.columns.forEach((col, i) => {
      const headerLen = (lang === 'id' ? col.label_id : col.label_en).length;
      const maxDataLen = report.rows.reduce((max, row) => {
        const val = String(row[col.key] ?? '');
        return Math.max(max, val.length);
      }, 0);
      sheet.getColumn(i + 1).width = Math.min(40, Math.max(10, headerLen, maxDataLen) + 2);
    });

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    return new Response(buffer, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${title}.xlsx"`,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
