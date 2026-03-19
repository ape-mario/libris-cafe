import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase
const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();
const mockFrom = vi.fn();

vi.mock('$lib/supabase/client', () => ({
  getSupabase: () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
    from: mockFrom,
  }),
}));

import { loginWithPin, logout } from './service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Auth service', () => {
  it('should login with valid PIN and return staff data', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: 'auth-123' }, session: { access_token: 'jwt-xyz' } },
      error: null,
    });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'staff-1',
              name: 'Andi',
              email: 'andi@cafe.com',
              role: 'staff',
              outlet_id: 'outlet-1',
              is_active: true,
              created_at: '2026-01-01T00:00:00Z',
            },
            error: null,
          }),
        }),
      }),
    });

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

  it('should logout', async () => {
    mockSignOut.mockResolvedValue({ error: null });
    await logout();
    expect(mockSignOut).toHaveBeenCalled();
  });
});
