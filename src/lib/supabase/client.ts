import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? '') as string;
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '') as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Libris Cafe] Supabase not configured. Business features disabled.');
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export function getSupabase() {
  if (!supabase) throw new Error('Supabase not configured');
  return supabase;
}
