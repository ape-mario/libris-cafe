import { supabase } from '$lib/supabase/client';

export interface PublicBookAvailability {
  book_id: string;
  type: 'for_sale' | 'read_in_store' | 'both';
  price: number | null;
  in_stock: boolean;
  is_preloved: boolean;
  location: string | null;
}

let availabilityCache: Map<string, PublicBookAvailability> = new Map();
let lastFetch = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let outletId: string | null = null;

/**
 * Set the outlet ID for availability queries.
 * Called once on app init (reads from first outlet or config).
 */
export function setAvailabilityOutlet(id: string): void {
  outletId = id;
}

/**
 * Fetch availability data from Supabase RPC (anonymous-accessible).
 * Cached for 5 minutes to reduce API calls.
 */
export async function fetchAvailability(): Promise<void> {
  if (!supabase || !outletId) return;
  if (Date.now() - lastFetch < CACHE_TTL && availabilityCache.size > 0) return;

  try {
    const { data, error } = await supabase.rpc('get_public_availability', {
      p_outlet_id: outletId,
    });

    if (error || !data) return;

    availabilityCache = new Map();
    for (const item of data as PublicBookAvailability[]) {
      availabilityCache.set(item.book_id, item);
    }
    lastFetch = Date.now();
  } catch {
    // Silently fail — availability is optional for browse
  }
}

/**
 * Get availability info for a single book.
 * Returns null if not in inventory or cache not loaded.
 */
export function getBookAvailability(bookId: string): PublicBookAvailability | null {
  return availabilityCache.get(bookId) ?? null;
}

/**
 * Check if availability data has been loaded.
 */
export function isAvailabilityLoaded(): boolean {
  return lastFetch > 0;
}

/**
 * Force refresh the availability cache.
 */
export async function refreshAvailability(): Promise<void> {
  lastFetch = 0;
  await fetchAvailability();
}
