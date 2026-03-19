import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase
const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();
const mockGetSession = vi.fn();
const mockFrom = vi.fn();

vi.mock('$lib/supabase/client', () => ({
  getSupabase: () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
      getSession: mockGetSession,
    },
    from: mockFrom,
  }),
}));

// Mock auth store
vi.mock('./stores.svelte', () => ({
  setCurrentStaff: vi.fn(),
  initOutletContext: vi.fn().mockResolvedValue(undefined),
}));

import { loginWithPin, logout, getStaffByAuthId, restoreSession } from './service';

const mockStaffData = {
  id: 'auth-123',
  name: 'Andi',
  email: 'andi@cafe.com',
  role: 'staff',
  outlet_id: 'outlet-1',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
};

function mockStaffQuery(data: any, error: any = null) {
  mockFrom.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data, error }),
      }),
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Auth service', () => {
  it('should login with valid PIN and return staff data', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: 'auth-123' }, session: { access_token: 'jwt-xyz' } },
      error: null,
    });
    mockStaffQuery(mockStaffData);

    const result = await loginWithPin('andi@cafe.com', '1234');
    expect(result.staff.name).toBe('Andi');
    expect(result.staff.role).toBe('staff');
    expect(result.token).toBe('jwt-xyz');
  });

  it('should throw on invalid credentials', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    });

    await expect(loginWithPin('andi@cafe.com', '0000')).rejects.toThrow(
      'Invalid login credentials'
    );
  });

  it('should throw when staff record not found', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: 'auth-999' }, session: { access_token: 'jwt' } },
      error: null,
    });
    mockStaffQuery(null, { code: 'PGRST116', message: 'not found' });

    await expect(loginWithPin('unknown@cafe.com', '1234')).rejects.toThrow(
      'Staff record not found'
    );
  });

  it('should logout and clear store', async () => {
    mockSignOut.mockResolvedValue({ error: null });
    await logout();
    expect(mockSignOut).toHaveBeenCalled();
    const { setCurrentStaff } = await import('./stores.svelte');
    expect(setCurrentStaff).toHaveBeenCalledWith(null);
  });
});

describe('getStaffByAuthId', () => {
  it('should return staff data for valid auth ID', async () => {
    mockStaffQuery(mockStaffData);
    const staff = await getStaffByAuthId('auth-123');
    expect(staff).not.toBeNull();
    expect(staff!.name).toBe('Andi');
    expect(mockFrom).toHaveBeenCalledWith('staff');
  });

  it('should return null when not found', async () => {
    mockStaffQuery(null, { code: 'PGRST116' });
    const staff = await getStaffByAuthId('nonexistent');
    expect(staff).toBeNull();
  });
});

describe('restoreSession', () => {
  it('should restore session for active staff', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'auth-123' }, access_token: 'jwt-restored' } },
    });
    mockStaffQuery(mockStaffData);

    const result = await restoreSession();
    expect(result).not.toBeNull();
    expect(result!.staff.name).toBe('Andi');
    expect(result!.token).toBe('jwt-restored');
  });

  it('should return null when no session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const result = await restoreSession();
    expect(result).toBeNull();
  });

  it('should return null when staff is inactive', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'auth-123' }, access_token: 'jwt' } },
    });
    mockStaffQuery({ ...mockStaffData, is_active: false });

    const result = await restoreSession();
    expect(result).toBeNull();
  });
});
