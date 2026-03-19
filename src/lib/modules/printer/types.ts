/**
 * Abstract printer provider interface.
 * Concrete implementations: BluetoothPrinterProvider, UsbPrinterProvider.
 */
export interface PrinterProvider {
  readonly type: 'bluetooth' | 'usb';
  readonly isConnected: boolean;
  readonly deviceName: string | null;

  /** Scan and connect to a printer. Returns true if connected. */
  connect(): Promise<boolean>;

  /** Disconnect from the printer. */
  disconnect(): Promise<void>;

  /** Send raw bytes to the printer. */
  write(data: Uint8Array): Promise<void>;
}

export interface PrinterDevice {
  id: string;
  name: string;
  type: 'bluetooth' | 'usb';
}

export interface ReceiptData {
  /** Cafe info */
  cafe_name: string;
  cafe_address: string;
  cafe_phone: string;

  /** Transaction info */
  transaction_id: string;
  date: string;
  staff_name: string;

  /** Items */
  items: ReceiptItem[];

  /** Totals */
  subtotal: number;
  discount: number;
  tax: number;
  total: number;

  /** Payment */
  payment_method: string;
  amount_paid?: number;
  change?: number;

  /** Footer */
  footer_message?: string;
}

export interface ReceiptItem {
  title: string;
  quantity: number;
  unit_price: number;
  total: number;
}

/** ESC/POS alignment */
export type Alignment = 'left' | 'center' | 'right';

/** ESC/POS text style */
export interface TextStyle {
  bold?: boolean;
  underline?: boolean;
  doubleWidth?: boolean;
  doubleHeight?: boolean;
  alignment?: Alignment;
}
