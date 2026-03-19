export type ReceiptChannel = 'whatsapp' | 'email';
export type ReceiptStatus = 'queued' | 'sent' | 'failed';

export interface Receipt {
  id: string;
  transaction_id: string;
  type: ReceiptChannel;
  recipient: string;
  status: ReceiptStatus;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface ReceiptData {
  transactionId: string;
  orderId: string;
  date: string;
  items: {
    title: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paymentMethod: string;
  paymentReference: string | null;
  cafeName: string;
  cafeAddress: string;
  staffName: string;
}

/**
 * Abstract messaging provider interface.
 * Concrete implementations: Fonnte (WhatsApp), email.
 * Swappable without changing caller code.
 */
export interface MessagingProvider {
  send(recipient: string, message: string): Promise<{ success: boolean; error?: string }>;
}
