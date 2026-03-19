import type { PrinterProvider } from './types';

/**
 * Web USB API printer provider.
 * Connects to USB thermal receipt printers.
 */
export class UsbPrinterProvider implements PrinterProvider {
  readonly type = 'usb' as const;
  private device: USBDevice | null = null;
  private endpointNumber: number | null = null;
  private _isConnected = false;
  private _deviceName: string | null = null;

  get isConnected(): boolean {
    return this._isConnected;
  }

  get deviceName(): string | null {
    return this._deviceName;
  }

  async connect(): Promise<boolean> {
    try {
      if (!navigator.usb) {
        throw new Error('Web USB API not supported in this browser');
      }

      // Request USB device — user selects printer from browser dialog
      this.device = await navigator.usb.requestDevice({
        filters: [
          // Common USB printer class (7 = Printer)
          { classCode: 7 },
        ],
      });

      if (!this.device) return false;

      this._deviceName = this.device.productName ?? 'USB Printer';

      await this.device.open();

      // Select configuration (usually configuration 1)
      if (this.device.configuration === null) {
        await this.device.selectConfiguration(1);
      }

      // Find the printer interface and claim it
      const iface = this.device.configuration!.interfaces.find(i =>
        i.alternate.interfaceClass === 7 // Printer class
      );

      if (!iface) {
        throw new Error('No printer interface found on USB device');
      }

      await this.device.claimInterface(iface.interfaceNumber);

      // Find bulk OUT endpoint for sending data
      const endpoint = iface.alternate.endpoints.find(
        e => e.direction === 'out' && e.type === 'bulk'
      );

      if (!endpoint) {
        throw new Error('No bulk OUT endpoint found on printer');
      }

      this.endpointNumber = endpoint.endpointNumber;
      this._isConnected = true;
      return true;
    } catch (err) {
      console.error('USB printer connection failed:', err);
      this._isConnected = false;
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.device) {
      try {
        await this.device.close();
      } catch {
        // Device may already be disconnected
      }
    }
    this._isConnected = false;
    this.device = null;
    this.endpointNumber = null;
    this._deviceName = null;
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this.device || !this._isConnected || this.endpointNumber === null) {
      throw new Error('Printer not connected');
    }

    // USB can handle larger transfers than BLE, send in 64-byte chunks
    const CHUNK_SIZE = 64;
    for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
      const chunk = data.slice(offset, offset + CHUNK_SIZE);
      await this.device.transferOut(this.endpointNumber, chunk);
    }
  }
}
