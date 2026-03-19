// supabase/functions/export-pdf/index.ts
// Generates PDF reports using jsPDF (Deno-compatible ESM build).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

// jsPDF ESM import for Deno
// @ts-ignore: Deno-style import
import { jsPDF } from 'https://esm.sh/jspdf@2.5.1';
// @ts-ignore: Deno-style import
import autoTable from 'https://esm.sh/jspdf-autotable@3.8.2';

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

function formatCell(value: unknown, format?: string): string {
  if (value === null || value === undefined) return '-';
  switch (format) {
    case 'currency':
      return `Rp${Number(value).toLocaleString('id-ID')}`;
    case 'percentage':
      return `${Number(value).toFixed(1)}%`;
    case 'number':
      return Number(value).toLocaleString('id-ID');
    default:
      return String(value);
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { report, lang = 'en' }: { report: ReportData; lang: 'en' | 'id' } = await req.json();

    const title = lang === 'id' ? report.title_id : report.title_en;
    const headers = report.columns.map(c => lang === 'id' ? c.label_id : c.label_en);

    // Create PDF (A4 landscape for wide reports)
    const isWide = report.columns.length > 5;
    const doc = new jsPDF({
      orientation: isWide ? 'landscape' : 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    // Title
    doc.setFontSize(16);
    doc.text(title, 14, 20);

    // Subtitle (date range)
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(
      `${report.config.date_from} — ${report.config.date_to}`,
      14, 28
    );
    doc.text(
      `${lang === 'id' ? 'Dibuat' : 'Generated'}: ${new Date(report.generated_at).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US')}`,
      14, 33
    );

    // Table
    const body = report.rows.map(row =>
      report.columns.map(col => formatCell(row[col.key], col.format))
    );

    autoTable(doc, {
      head: [headers],
      body,
      startY: 38,
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [79, 70, 60], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 243, 240] },
      margin: { left: 14, right: 14 },
    });

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `Libris Cafe — ${lang === 'id' ? 'Halaman' : 'Page'} ${i}/${pageCount}`,
        14,
        doc.internal.pageSize.height - 10
      );
    }

    // Output as arraybuffer
    const pdfOutput = doc.output('arraybuffer');

    return new Response(pdfOutput, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${title}.pdf"`,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
