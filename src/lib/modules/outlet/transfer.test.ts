import { describe, it, expect } from 'vitest';
import { canTransition, getNextStatuses } from './transfer';
import type { TransferStatus } from './types';

describe('Transfer State Machine', () => {
  it('should allow requested -> approved', () => {
    expect(canTransition('requested', 'approved')).toBe(true);
  });

  it('should allow requested -> cancelled', () => {
    expect(canTransition('requested', 'cancelled')).toBe(true);
  });

  it('should allow approved -> shipped', () => {
    expect(canTransition('approved', 'shipped')).toBe(true);
  });

  it('should allow shipped -> received', () => {
    expect(canTransition('shipped', 'received')).toBe(true);
  });

  it('should not allow skipping steps (requested -> shipped)', () => {
    expect(canTransition('requested', 'shipped')).toBe(false);
  });

  it('should not allow backwards (received -> shipped)', () => {
    expect(canTransition('received', 'shipped')).toBe(false);
  });

  it('should not allow transition from received', () => {
    expect(getNextStatuses('received')).toEqual([]);
  });

  it('should not allow transition from cancelled', () => {
    expect(getNextStatuses('cancelled')).toEqual([]);
  });

  it('should allow cancel from any active status', () => {
    const activeStatuses: TransferStatus[] = ['requested', 'approved', 'shipped'];
    for (const status of activeStatuses) {
      expect(canTransition(status, 'cancelled')).toBe(true);
    }
  });

  it('should return correct next statuses', () => {
    expect(getNextStatuses('requested')).toEqual(['approved', 'cancelled']);
    expect(getNextStatuses('approved')).toEqual(['shipped', 'cancelled']);
    expect(getNextStatuses('shipped')).toEqual(['received', 'cancelled']);
  });
});
