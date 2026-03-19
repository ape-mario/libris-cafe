export interface Consignor {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  bank_account: string | null;
  bank_name: string | null;
  commission_rate: number;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export type SettlementStatus = 'draft' | 'confirmed' | 'paid';

export interface ConsignmentSettlement {
  id: string;
  consignor_id: string;
  period_start: string;
  period_end: string;
  total_sales: number;
  commission: number;
  payout: number;
  status: SettlementStatus;
  paid_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  // Joined
  consignor?: Consignor;
}

export interface NewConsignor {
  name: string;
  phone?: string;
  email?: string;
  bank_account?: string;
  bank_name?: string;
  commission_rate?: number;
  notes?: string;
}

export interface CreateSettlementInput {
  consignorId: string;
  periodStart: string;
  periodEnd: string;
  totalSales: number;
  commission: number;
  payout: number;
  staffId: string;
  notes?: string;
}

export interface ConsignmentSaleRecord {
  transaction_id: string;
  transaction_date: string;
  book_title: string;
  quantity: number;
  unit_price: number;
  total: number;
  commission_rate: number;
  commission_amount: number;
  payout_amount: number;
}
