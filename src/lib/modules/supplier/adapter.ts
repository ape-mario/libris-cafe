/**
 * Abstract interface for supplier API integration.
 * Each supplier with an API gets a concrete adapter implementation.
 * Suppliers without APIs use the ManualAdapter (no-op).
 */
export interface SupplierAdapter {
  /** Check if a book is available from this supplier */
  checkAvailability(isbn: string): Promise<SupplierAvailability | null>;

  /** Place an order with the supplier */
  createOrder(items: SupplierOrderItem[]): Promise<SupplierOrderResult>;

  /** Check the status of a previously placed order */
  checkOrderStatus(orderId: string): Promise<SupplierOrderStatus>;
}

export interface SupplierAvailability {
  isbn: string;
  title: string;
  available: boolean;
  price: number;
  estimatedDeliveryDays: number;
}

export interface SupplierOrderItem {
  isbn: string;
  title: string;
  quantity: number;
}

export interface SupplierOrderResult {
  success: boolean;
  externalOrderId: string | null;
  message: string;
}

export type SupplierOrderStatusValue = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'unknown';

export interface SupplierOrderStatus {
  externalOrderId: string;
  status: SupplierOrderStatusValue;
  estimatedDelivery: string | null;
  trackingUrl: string | null;
}

/**
 * Registry: maps supplier IDs to their adapter instances.
 * Populated at app init or lazily on first use.
 */
const adapterRegistry = new Map<string, SupplierAdapter>();

export function registerAdapter(supplierId: string, adapter: SupplierAdapter): void {
  adapterRegistry.set(supplierId, adapter);
}

export function getAdapter(supplierId: string): SupplierAdapter | null {
  return adapterRegistry.get(supplierId) ?? null;
}
