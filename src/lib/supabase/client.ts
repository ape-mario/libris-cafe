import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function getStoredUrl(): string {
  try { return localStorage.getItem('libris_supabase_url') ?? ''; } catch { return ''; }
}

function getStoredKey(): string {
  try { return localStorage.getItem('libris_supabase_anon_key') ?? ''; } catch { return ''; }
}

const supabaseUrl = ((import.meta.env.VITE_SUPABASE_URL as string) || getStoredUrl());
const supabaseAnonKey = ((import.meta.env.VITE_SUPABASE_ANON_KEY as string) || getStoredKey());

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Libris Cafe] Supabase not configured. Business features disabled.');
}

export let supabase: SupabaseClient | null = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

/**
 * Re-initialize the Supabase client after setup wizard saves credentials.
 */
export function reinitSupabase(): void {
  const url = getStoredUrl();
  const key = getStoredKey();
  if (url && key) {
    supabase = createClient(url, key);
  }
}

export function getSupabase() {
  if (!supabase) throw new Error('Supabase not configured');
  return supabase;
}
