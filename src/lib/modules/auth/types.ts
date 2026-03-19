export interface Staff {
  id: string;
  name: string;
  email: string | null;
  role: 'owner' | 'staff';
  outlet_id: string;
  is_active: boolean;
  created_at: string;
}

export interface AuthSession {
  staff: Staff;
  token: string;  // Supabase JWT
}

export type AppRole = 'owner' | 'staff' | 'guest';
