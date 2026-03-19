import type { PrinterProvider, ReceiptData } from './types';
import { BluetoothPrinterProvider } from './bluetooth-provider';
import { UsbPrinterProvider } from './usb-provider';
import { buildReceipt } from './escpos';

export type PrinterConnectionType = 'bluetooth' | 'usb';

let activeProvider: PrinterProvider | null = null;

/**
 * Get or create a printer provider of the specified type.
 */
export function getProvider(type: PrinterConnectionType): PrinterProvider {
  if (activeProvider && activeProvider.type === type) {
    return activeProvider;
  }

  // Disconnect existing provider if switching types
  if (activeProvider) {
    activeProvider.disconnect();
  }

  activeProvider =
    type === 'bluetooth'
      ? new BluetoothPrinterProvider()
      : new UsbPrinterProvider();

  return activeProvider;
}

/**
 * Connect to a printer. Shows browser device picker.
 */
export async function connectPrinter(type: PrinterConnectionType): Promise<boolean> {
  const provider = getProvider(type);
  return provider.connect();
}

/**
 * Disconnect the current printer.
 */
export async function disconnectPrinter(): Promise<void> {
  if (activeProvider) {
    await activeProvider.disconnect();
    activeProvider = null;
  }
}

/**
 * Print a receipt. Builds ESC/POS commands and sends to printer.
 */
export async function printReceipt(
  data: ReceiptData,
  options: { paperWidth?: number; openDrawer?: boolean } = {}
): Promise<void> {
  if (!activeProvider || !activeProvider.isConnected) {
    throw new Error('No printer connected. Please connect a printer first.');
  }

  const receiptBytes = buildReceipt(data, options.paperWidth ?? 32);
  await activeProvider.write(receiptBytes);

  // Optionally open cash drawer after printing
  if (options.openDrawer) {
    const { EscPosBuilder } = await import('./escpos');
    const drawerCmd = new EscPosBuilder().openCashDrawer().build();
    await activeProvider.write(drawerCmd);
  }
}

/**
 * Print raw bytes (for testing or custom commands).
 */
export async function printRaw(data: Uint8Array): Promise<void> {
  if (!activeProvider || !activeProvider.isConnected) {
    throw new Error('No printer connected');
  }
  await activeProvider.write(data);
}

/**
 * Check if Web Bluetooth is supported.
 */
export function isBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

/**
 * Check if Web USB is supported.
 */
export function isUsbSupported(): boolean {
  return typeof navigator !== 'undefined' && 'usb' in navigator;
}

/**
 * Get the current printer status.
 */
export function getPrinterStatus(): {
  connected: boolean;
  type: PrinterConnectionType | null;
  deviceName: string | null;
} {
  return {
    connected: activeProvider?.isConnected ?? false,
    type: activeProvider?.type ?? null,
    deviceName: activeProvider?.deviceName ?? null,
  };
}
