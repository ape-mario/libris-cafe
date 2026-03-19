import { getSupabase } from '$lib/supabase/client';
import type { ReportConfig, ReportData } from './types';
import { REPORT_SCHEMAS } from './types';
import { downloadCsv } from './csv-export';

/**
 * Fetch report data from Supabase based on config.
 */
export async function fetchReportData(config: ReportConfig): Promise<ReportData> {
  const schema = REPORT_SCHEMAS[config.type];
  if (!schema) throw new Error(`Unknown report type: ${config.type}`);

  const supabase = getSupabase();
  let rows: Record<string, unknown>[] = [];

  switch (config.type) {
    case 'sales_daily':
    case 'sales_weekly':
    case 'sales_monthly':
      rows = await fetchSalesReport(supabase, config);
      break;
    case 'inventory_status':
      rows = await fetchInventoryStatus(supabase, config);
      break;
    case 'stock_movement':
      rows = await fetchStockMovement(supabase, config);
      break;
    case 'dead_stock':
      rows = await fetchDeadStock(supabase, config);
      break;
    case 'profit_margin':
      rows = await fetchProfitMargin(supabase, config);
      break;
    case 'consignment_summary':
      rows = await fetchConsignmentSummary(supabase, config);
      break;
    case 'supplier_performance':
      rows = await fetchSupplierPerformance(supabase, config);
      break;
    case 'lending_sessions':
      rows = await fetchLendingSessions(supabase, config);
      break;
  }

  return {
    title_en: schema.title_en,
    title_id: schema.title_id,
    columns: schema.columns,
    rows,
    generated_at: new Date().toISOString(),
    config,
  };
}

/**
 * Export a report in the specified format.
 * CSV: client-side download.
 * PDF/Excel: call Edge Function, receive file, download.
 */
export async function exportReport(
  config: ReportConfig,
  lang: 'en' | 'id' = 'en'
): Promise<void> {
  const data = await fetchReportData(config);

  switch (config.format) {
    case 'csv':
      downloadCsv(data, lang);
      break;
    case 'pdf':
      await exportViaPdfEdgeFunction(data, lang);
      break;
    case 'excel':
      await exportViaExcelEdgeFunction(data, lang);
      break;
  }
}

// --- Private data fetchers ---

async function fetchSalesReport(
  supabase: ReturnType<typeof getSupabase>,
  config: ReportConfig
): Promise<Record<string, unknown>[]> {
  // Use RPC for aggregated sales data
  const { data, error } = await supabase.rpc('get_sales_report', {
    p_outlet_id: config.outlet_id,
    p_date_from: config.date_from,
    p_date_to: config.date_to,
    p_period: config.type.replace('sales_', ''), // 'daily', 'weekly', 'monthly'
  });

  if (error) throw new Error(`Sales report failed: ${error.message}`);
  return (data ?? []) as Record<string, unknown>[];
}

async function fetchInventoryStatus(
  supabase: ReturnType<typeof getSupabase>,
  config: ReportConfig
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('inventory')
    .select('book_id, type, stock, price, condition')
    .eq('outlet_id', config.outlet_id)
    .order('stock', { ascending: true });

  if (error) throw new Error(`Inventory report failed: ${error.message}`);
  return (data ?? []) as Record<string, unknown>[];
}

async function fetchStockMovement(
  supabase: ReturnType<typeof getSupabase>,
  config: ReportConfig
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('stock_movement')
    .select('*, inventory!inner(book_id, outlet_id), staff(name)')
    .eq('inventory.outlet_id', config.outlet_id)
    .gte('created_at', config.date_from)
    .lte('created_at', config.date_to)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Stock movement report failed: ${error.message}`);
  return (data ?? []).map((row: any) => ({
    date: row.created_at,
    title: row.inventory?.book_id ?? '',
    type: row.type,
    quantity: row.quantity,
    staff: row.staff?.name ?? '',
    reason: row.reason ?? '',
  }));
}

async function fetchDeadStock(
  supabase: ReturnType<typeof getSupabase>,
  config: ReportConfig
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase.rpc('get_dead_stock', {
    p_outlet_id: config.outlet_id,
    p_days_threshold: 90,
  });

  if (error) throw new Error(`Dead stock report failed: ${error.message}`);
  return (data ?? []) as Record<string, unknown>[];
}

async function fetchProfitMargin(
  supabase: ReturnType<typeof getSupabase>,
  config: ReportConfig
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase.rpc('get_profit_margin_report', {
    p_outlet_id: config.outlet_id,
    p_date_from: config.date_from,
    p_date_to: config.date_to,
  });

  if (error) throw new Error(`Profit margin report failed: ${error.message}`);
  return (data ?? []) as Record<string, unknown>[];
}

async function fetchConsignmentSummary(
  supabase: ReturnType<typeof getSupabase>,
  config: ReportConfig
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase.rpc('get_consignment_summary', {
    p_outlet_id: config.outlet_id,
    p_date_from: config.date_from,
    p_date_to: config.date_to,
  });

  if (error) throw new Error(`Consignment report failed: ${error.message}`);
  return (data ?? []) as Record<string, unknown>[];
}

async function fetchSupplierPerformance(
  supabase: ReturnType<typeof getSupabase>,
  config: ReportConfig
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase.rpc('get_supplier_performance', {
    p_outlet_id: config.outlet_id,
    p_date_from: config.date_from,
    p_date_to: config.date_to,
  });

  if (error) throw new Error(`Supplier report failed: ${error.message}`);
  return (data ?? []) as Record<string, unknown>[];
}

async function fetchLendingSessions(
  supabase: ReturnType<typeof getSupabase>,
  config: ReportConfig
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('reading_session')
    .select('*')
    .eq('outlet_id', config.outlet_id)
    .gte('checked_in_at', config.date_from)
    .lte('checked_in_at', config.date_to)
    .order('checked_in_at', { ascending: false });

  if (error) throw new Error(`Lending report failed: ${error.message}`);
  return (data ?? []).map((row: any) => ({
    date: row.checked_in_at,
    title: row.book_id,
    customer: row.customer_name ?? '-',
    level: row.level,
    duration_min: row.checked_out_at
      ? Math.round((new Date(row.checked_out_at).getTime() - new Date(row.checked_in_at).getTime()) / 60000)
      : null,
    deposit: row.deposit_amount,
    status: row.status,
  }));
}

// --- Edge Function callers for PDF/Excel ---

async function exportViaPdfEdgeFunction(data: ReportData, lang: 'en' | 'id'): Promise<void> {
  const supabase = getSupabase();
  const { data: fileBlob, error } = await supabase.functions.invoke('export-pdf', {
    body: { report: data, lang },
  });

  if (error) throw new Error(`PDF export failed: ${error.message}`);

  const title = lang === 'id' ? data.title_id : data.title_en;
  downloadBlob(fileBlob, `${title}_${data.config.date_from}_${data.config.date_to}.pdf`, 'application/pdf');
}

async function exportViaExcelEdgeFunction(data: ReportData, lang: 'en' | 'id'): Promise<void> {
  const supabase = getSupabase();
  const { data: fileBlob, error } = await supabase.functions.invoke('export-excel', {
    body: { report: data, lang },
  });

  if (error) throw new Error(`Excel export failed: ${error.message}`);

  const title = lang === 'id' ? data.title_id : data.title_en;
  downloadBlob(
    fileBlob,
    `${title}_${data.config.date_from}_${data.config.date_to}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
}

function downloadBlob(data: Blob | ArrayBuffer, filename: string, mimeType: string): void {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
