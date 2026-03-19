export type PaymentMethod = 'cash' | 'qris' | 'ewallet' | 'bank_transfer' | 'card';

export type PaymentStatus =
  | 'pending' | 'capture' | 'settlement' | 'deny'
  | 'cancel' | 'expire' | 'refund';

export interface Payment {
  id: string;
  transaction_id: string;
  midtrans_order_id: string;
  midtrans_transaction_id: string | null;
  payment_type: string | null;
  gross_amount: number;
  status: PaymentStatus;
  snap_token: string | null;
  snap_redirect_url: string | null;
  raw_response: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePaymentRequest {
  transactionId: string;
  orderId: string;
  grossAmount: number;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  items: {
    id: string;
    name: string;
    price: number;
    quantity: number;
  }[];
}

export interface CreatePaymentResponse {
  snapToken: string;
  redirectUrl: string;
  orderId: string;
}

export interface SnapResult {
  status_code: string;
  status_message: string;
  transaction_id: string;
  order_id: string;
  gross_amount: string;
  payment_type: string;
  transaction_time: string;
  transaction_status: string;
  fraud_status?: string;
}

export interface MidtransNotification {
  transaction_time: string;
  transaction_status: string;
  transaction_id: string;
  status_message: string;
  status_code: string;
  signature_key: string;
  settlement_time?: string;
  payment_type: string;
  order_id: string;
  merchant_id: string;
  gross_amount: string;
  fraud_status?: string;
  currency: string;
}
