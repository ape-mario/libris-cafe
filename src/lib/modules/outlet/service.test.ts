import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase client
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockFrom = vi.fn(() => ({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  delete: mockDelete,
}));

vi.mock('$lib/supabase/client', () => ({
  getSupabase: () => ({ from: mockFrom }),
}));

import { fetchOutlets, createOutlet, deleteOutlet } from './service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Outlet Service', () => {
  it('should fetch all outlets', async () => {
    const mockData = [
      { id: 'o1', name: 'Main Cafe', address: 'Jl. Merdeka 1' },
      { id: 'o2', name: 'Branch Cafe', address: 'Jl. Sudirman 5' },
    ];
    mockSelect.mockReturnValue({
      order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
    });

    const outlets = await fetchOutlets();
    expect(outlets).toHaveLength(2);
    expect(outlets[0].name).toBe('Main Cafe');
    expect(mockFrom).toHaveBeenCalledWith('outlet');
  });

  it('should create an outlet', async () => {
    const newOutlet = { id: 'o3', name: 'New Branch', address: 'Jl. Asia 10', tax_rate: 11 };
    mockInsert.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: newOutlet, error: null }),
      }),
    });

    const result = await createOutlet({ name: 'New Branch', address: 'Jl. Asia 10' });
    expect(result.name).toBe('New Branch');
  });

  it('should reject deleting outlet with inventory', async () => {
    mockSelect.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ count: 5, error: null }),
    });

    // The select chain for inventory check
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ count: 5, error: null }),
      }),
    });

    await expect(deleteOutlet('o1')).rejects.toThrow('Cannot delete outlet with existing inventory');
  });
});
