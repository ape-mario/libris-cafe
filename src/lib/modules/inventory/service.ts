import { getSupabase } from '$lib/supabase/client';
import type { Inventory, NewInventoryItem, StockMovement, StockMovementType } from './types';

export async function addInventoryItem(item: NewInventoryItem): Promise<Inventory> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('inventory')
    .insert(item)
    .select()
    .single();

  if (error) throw new Error(`Failed to add inventory: ${error.message}`);
  return data as Inventory;
}

export async function getInventoryByBookId(bookId: string, outletId: string): Promise<Inventory | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('inventory')
    .select()
    .eq('book_id', bookId)
    .eq('outlet_id', outletId)
    .single();

  if (error) return null;
  return data as Inventory;
}

export async function getInventoryByOutlet(outletId: string): Promise<Inventory[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('inventory')
    .select()
    .eq('outlet_id', outletId)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch inventory: ${error.message}`);
  return (data ?? []) as Inventory[];
}

export async function updateInventoryItem(id: string, updates: Partial<Inventory>): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('inventory')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(`Failed to update inventory: ${error.message}`);
}

export async function adjustStock(
  inventoryId: string,
  quantity: number,
  type: StockMovementType,
  staffId: string,
  reason?: string,
  referenceId?: string
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('stock_movement')
    .insert({
      inventory_id: inventoryId,
      type,
      quantity,
      staff_id: staffId,
      reason: reason ?? null,
      reference_id: referenceId ?? null,
    });

  if (error) throw new Error(`Failed to record stock movement: ${error.message}`);
  // Note: inventory.stock is auto-updated by the DB trigger (trg_stock_movement_update)
}

export async function getStockMovements(inventoryId: string): Promise<StockMovement[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('stock_movement')
    .select()
    .eq('inventory_id', inventoryId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch movements: ${error.message}`);
  return data ?? [];
}
