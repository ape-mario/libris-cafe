export type NotificationType =
  | 'low_stock'
  | 'out_of_stock'
  | 'po_received'
  | 'settlement_due'
  | 'payment_failed'
  | 'offline_synced'
  | 'daily_summary'
  | 'restock_suggestion';

export interface Notification {
  id: string;
  outlet_id: string | null;
  recipient_id: string | null;
  type: NotificationType;
  title: string;
  body: string | null;
  data: Record<string, any> | null;
  read: boolean;
  created_at: string;
}

export interface NewNotification {
  outlet_id: string;
  recipient_id: string;
  type: NotificationType;
  title: string;
  body?: string;
  data?: Record<string, any>;
}

export interface NotificationEvent {
  type: NotificationType;
  title: string;
  body?: string;
  data?: Record<string, any>;
  /** Send WhatsApp in addition to in-app? */
  whatsapp?: boolean;
  /** WhatsApp recipient phone number (if different from staff phone) */
  whatsappRecipient?: string;
}
