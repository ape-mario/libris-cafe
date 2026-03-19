import {
  connectPrinter,
  disconnectPrinter,
  printReceipt,
  getPrinterStatus,
  isBluetoothSupported,
  isUsbSupported,
  type PrinterConnectionType,
} from './service';
import type { ReceiptData } from './types';

let isConnected = $state(false);
let connectionType = $state<PrinterConnectionType | null>(null);
let deviceName = $state<string | null>(null);
let isPrinting = $state(false);
let error = $state<string | null>(null);

function syncStatus() {
  const status = getPrinterStatus();
  isConnected = status.connected;
  connectionType = status.type;
  deviceName = status.deviceName;
}

export function getPrinterStore() {
  return {
    get isConnected() { return isConnected; },
    get connectionType() { return connectionType; },
    get deviceName() { return deviceName; },
    get isPrinting() { return isPrinting; },
    get error() { return error; },
    get bluetoothSupported() { return isBluetoothSupported(); },
    get usbSupported() { return isUsbSupported(); },

    async connect(type: PrinterConnectionType): Promise<boolean> {
      error = null;
      try {
        const success = await connectPrinter(type);
        syncStatus();
        return success;
      } catch (e) {
        error = e instanceof Error ? e.message : 'Connection failed';
        return false;
      }
    },

    async disconnect(): Promise<void> {
      await disconnectPrinter();
      syncStatus();
    },

    async print(data: ReceiptData, options?: { paperWidth?: number; openDrawer?: boolean }): Promise<boolean> {
      error = null;
      isPrinting = true;
      try {
        await printReceipt(data, options);
        return true;
      } catch (e) {
        error = e instanceof Error ? e.message : 'Print failed';
        return false;
      } finally {
        isPrinting = false;
      }
    },
  };
}
