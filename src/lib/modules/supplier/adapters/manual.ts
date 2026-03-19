import type {
  SupplierAdapter,
  SupplierAvailability,
  SupplierOrderItem,
  SupplierOrderResult,
  SupplierOrderStatus,
} from '../adapter';

/**
 * Manual adapter for suppliers without an API.
 * All operations return "not supported" — POs are managed
 * manually by the owner (phone, email, in-person).
 */
export class ManualAdapter implements SupplierAdapter {
  async checkAvailability(_isbn: string): Promise<SupplierAvailability | null> {
    // Manual suppliers don't have availability checks
    return null;
  }

  async createOrder(_items: SupplierOrderItem[]): Promise<SupplierOrderResult> {
    return {
      success: false,
      externalOrderId: null,
      message: 'This supplier does not support API ordering. Please place orders manually.',
    };
  }

  async checkOrderStatus(_orderId: string): Promise<SupplierOrderStatus> {
    return {
      externalOrderId: _orderId,
      status: 'unknown',
      estimatedDelivery: null,
      trackingUrl: null,
    };
  }
}
