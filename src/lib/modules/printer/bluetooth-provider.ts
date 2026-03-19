import type { PrinterProvider } from './types';

// Common thermal printer Bluetooth service UUIDs
const PRINTER_SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';
const PRINTER_CHAR_UUID = '00002af1-0000-1000-8000-00805f9b34fb';

// Some printers use the Serial Port Profile (SPP) UUID
const SPP_SERVICE_UUID = '00001101-0000-1000-8000-00805f9b34fb';

/**
 * Web Bluetooth API printer provider.
 * Connects to BLE thermal printers (e.g., common 58mm/80mm receipt printers).
 */
export class BluetoothPrinterProvider implements PrinterProvider {
  readonly type = 'bluetooth' as const;
  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
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
      if (!navigator.bluetooth) {
        throw new Error('Web Bluetooth API not supported in this browser');
      }

      // Request device with printer service filter
      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [PRINTER_SERVICE_UUID] },
          { services: [SPP_SERVICE_UUID] },
          // Also accept by name prefix (common thermal printer brands)
          { namePrefix: 'RPP' },
          { namePrefix: 'MPT' },
          { namePrefix: 'BlueTooth Printer' },
          { namePrefix: 'Printer' },
        ],
        optionalServices: [PRINTER_SERVICE_UUID, SPP_SERVICE_UUID],
      });

      if (!this.device) return false;

      this._deviceName = this.device.name ?? 'Unknown Printer';

      // Listen for disconnection
      this.device.addEventListener('gattserverdisconnected', () => {
        this._isConnected = false;
        this.characteristic = null;
      });

      // Connect to GATT server
      const server = await this.device.gatt!.connect();

      // Try to find the printer service
      let service: BluetoothRemoteGATTService;
      try {
        service = await server.getPrimaryService(PRINTER_SERVICE_UUID);
      } catch {
        // Fallback to SPP service
        service = await server.getPrimaryService(SPP_SERVICE_UUID);
      }

      // Get the write characteristic
      const characteristics = await service.getCharacteristics();
      this.characteristic =
        characteristics.find(c => c.properties.writeWithoutResponse || c.properties.write) ?? null;

      if (!this.characteristic) {
        throw new Error('No writable characteristic found on printer');
      }

      this._isConnected = true;
      return true;
    } catch (err) {
      console.error('Bluetooth printer connection failed:', err);
      this._isConnected = false;
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this._isConnected = false;
    this.characteristic = null;
    this.device = null;
    this._deviceName = null;
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this.characteristic || !this._isConnected) {
      throw new Error('Printer not connected');
    }

    // BLE has a max packet size (typically 20 bytes for older devices, 512 for BLE 5.0)
    // Send in chunks of 20 bytes for maximum compatibility
    const CHUNK_SIZE = 20;
    for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
      const chunk = data.slice(offset, offset + CHUNK_SIZE);
      if (this.characteristic.properties.writeWithoutResponse) {
        await this.characteristic.writeValueWithoutResponse(chunk);
      } else {
        await this.characteristic.writeValueWithResponse(chunk);
      }
      // Small delay between chunks to prevent buffer overflow on printer
      if (offset + CHUNK_SIZE < data.length) {
        await new Promise(r => setTimeout(r, 10));
      }
    }
  }
}
