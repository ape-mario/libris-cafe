export type LendingLevel = 'semi_formal' | 'formal';

export type SessionStatus = 'active' | 'returned' | 'overdue';

export type DepositStatus = 'held' | 'refunded' | 'forfeited';

export interface ReadingSession {
  id: string;
  inventory_id: string;
  book_id: string;
  outlet_id: string;
  staff_id: string;
  status: SessionStatus;
  checked_in_at: string;
  expected_return_at: string | null;
  checked_out_at: string | null;
  checked_out_by: string | null;
  level: LendingLevel;
  customer_name: string | null;
  customer_contact: string | null;
  deposit_amount: number;
  deposit_status: DepositStatus | null;
  deposit_refunded_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CheckInParams {
  inventory_id: string;
  book_id: string;
  outlet_id: string;
  staff_id: string;
  level: LendingLevel;
  /** Duration in minutes for formal lending. Null for semi-formal. */
  duration_minutes?: number;
  customer_name?: string;
  customer_contact?: string;
  deposit_amount?: number;
  notes?: string;
}

export interface CheckOutParams {
  session_id: string;
  staff_id: string;
  refund_deposit: boolean;
  notes?: string;
  fee_amount?: number;
}

export interface CheckOutResult {
  session: ReadingSession;
  fee_amount: number;
  fee_hours: number;
  fee_rate: number;
}

export interface SessionWithBook extends ReadingSession {
  /** Denormalized book title from Yjs for display */
  book_title?: string;
  /** Denormalized book cover URL from Yjs */
  book_cover_url?: string;
}

export interface LendingStats {
  active_count: number;
  overdue_count: number;
  today_checkin: number;
  today_checkout: number;
  avg_duration_minutes: number;
}
