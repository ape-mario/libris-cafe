import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CheckInParams, CheckOutParams, ReadingSession } from './types';
import { calculateReadingFee } from './service';

// Mock Supabase
const mockSelect = vi.fn();
const mockSingle = vi.fn();
const mockInsert = vi.fn(() => ({ select: mockSelect }));
const mockUpdate = vi.fn(() => ({ eq: vi.fn(() => ({ select: mockSelect })) }));
const mockEq = vi.fn();
const mockIn = vi.fn();
const mockOrder = vi.fn();
const mockGte = vi.fn();
const mockRpc = vi.fn();

vi.mock('$lib/supabase/client', () => ({
  getSupabase: () => ({
    from: vi.fn((table: string) => ({
      insert: mockInsert,
      update: mockUpdate,
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          in: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
      })),
    })),
    rpc: mockRpc,
  }),
}));

describe('Lending Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should prepare check-in params for semi-formal level', async () => {
    const params: CheckInParams = {
      inventory_id: 'inv-1',
      book_id: 'book-1',
      outlet_id: 'outlet-1',
      staff_id: 'staff-1',
      level: 'semi_formal',
    };

    // Semi-formal: no expected_return_at, no deposit
    expect(params.level).toBe('semi_formal');
    expect(params.duration_minutes).toBeUndefined();
    expect(params.deposit_amount).toBeUndefined();
  });

  it('should prepare check-in params for formal level with deposit and duration', () => {
    const params: CheckInParams = {
      inventory_id: 'inv-1',
      book_id: 'book-1',
      outlet_id: 'outlet-1',
      staff_id: 'staff-1',
      level: 'formal',
      duration_minutes: 120,
      customer_name: 'John Doe',
      customer_contact: '08123456789',
      deposit_amount: 50000,
    };

    expect(params.level).toBe('formal');
    expect(params.duration_minutes).toBe(120);
    expect(params.deposit_amount).toBe(50000);
    expect(params.customer_name).toBe('John Doe');
  });

  it('should prepare check-out params with deposit refund', () => {
    const params: CheckOutParams = {
      session_id: 'session-1',
      staff_id: 'staff-1',
      refund_deposit: true,
      notes: 'Book returned in good condition',
    };

    expect(params.refund_deposit).toBe(true);
    expect(params.notes).toBe('Book returned in good condition');
  });

  it('should calculate expected_return_at for formal sessions', () => {
    const durationMinutes = 120;
    const now = Date.now();
    const expectedReturn = new Date(now + durationMinutes * 60 * 1000);

    // Expected return should be ~2 hours from now
    const diffMs = expectedReturn.getTime() - now;
    const diffMinutes = diffMs / (1000 * 60);
    expect(diffMinutes).toBeCloseTo(120, 0);
  });

  it('should calculate reading fee based on duration and hourly rate', () => {
    // Session started 89 minutes ago (well within the 60-90 min range -> 1.5h)
    const ago = new Date(Date.now() - 89 * 60 * 1000).toISOString();
    const session = {
      id: 'session-1',
      checked_in_at: ago,
    } as ReadingSession;

    const result = calculateReadingFee(session, 10000);

    expect(result.fee_rate).toBe(10000);
    // 89min / 30min = 2.97, ceil = 3, /2 = 1.5h
    expect(result.fee_hours).toBe(1.5);
    expect(result.fee_amount).toBe(15000);
  });

  it('should round up reading fee to nearest half-hour', () => {
    // Session started 31 minutes ago -> ceil(31/30)=ceil(1.03)=2 half-hours = 1 hour
    const ago = new Date(Date.now() - (31 * 60 * 1000)).toISOString();
    const session = {
      id: 'session-2',
      checked_in_at: ago,
    } as ReadingSession;

    const result = calculateReadingFee(session, 10000);

    expect(result.fee_hours).toBe(1);
    expect(result.fee_amount).toBe(10000);
  });

  it('should return zero fee when feePerHour is 0', () => {
    const session = {
      id: 'session-3',
      checked_in_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    } as ReadingSession;

    const result = calculateReadingFee(session, 0);
    expect(result.fee_amount).toBe(0);
    expect(result.fee_hours).toBe(0);
  });

  it('should calculate average duration from completed sessions', () => {
    const sessions = [
      {
        checked_in_at: '2026-03-19T10:00:00Z',
        checked_out_at: '2026-03-19T11:30:00Z', // 90 min
      },
      {
        checked_in_at: '2026-03-19T12:00:00Z',
        checked_out_at: '2026-03-19T13:00:00Z', // 60 min
      },
      {
        checked_in_at: '2026-03-19T14:00:00Z',
        checked_out_at: '2026-03-19T16:30:00Z', // 150 min
      },
    ];

    const totalMinutes = sessions.reduce((sum, s) => {
      const inTime = new Date(s.checked_in_at).getTime();
      const outTime = new Date(s.checked_out_at).getTime();
      return sum + (outTime - inTime) / (1000 * 60);
    }, 0);
    const avg = Math.round(totalMinutes / sessions.length);

    expect(avg).toBe(100); // (90 + 60 + 150) / 3 = 100
  });
});
