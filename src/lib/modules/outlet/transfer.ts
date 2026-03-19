import { getSupabase } from '$lib/supabase/client';
import type {
  OutletTransfer,
  OutletTransferItem,
  CreateTransferRequest,
  TransferStatus,
} from './types';

// -- State Machine ----------------------------------------------------

const VALID_TRANSITIONS: Record<TransferStatus, TransferStatus[]> = {
  requested: ['approved', 'cancelled'],
  approved: ['shipped', 'cancelled'],
  shipped: ['received', 'cancelled'],
  received: [],
  cancelled: [],
};

export function canTransition(from: TransferStatus, to: TransferStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getNextStatuses(current: TransferStatus): TransferStatus[] {
  return VALID_TRANSITIONS[current] ?? [];
}

// -- Transfer CRUD ----------------------------------------------------

export async function createTransfer(request: CreateTransferRequest, staffId: string): Promise<OutletTransfer> {
  const supabase = getSupabase();

  // Validate: items must not be empty
  if (!request.items.length) {
    throw new Error('Transfer must include at least one item');
  }

  // Create transfer
  const { data: transfer, error: txError } = await supabase
    .from('outlet_transfer')
    .insert({
      from_outlet_id: request.from_outlet_id,
      to_outlet_id: request.to_outlet_id,
      requested_by: staffId,
      notes: request.notes ?? null,
    })
    .select()
    .single();

  if (txError) throw new Error(`Failed to create transfer: ${txError.message}`);

  // Create transfer items
  const items = request.items.map(item => ({
    transfer_id: transfer.id,
    inventory_id: item.inventory_id,
    book_id: item.book_id,
    title: item.title,
    quantity_requested: item.quantity_requested,
  }));

  const { error: itemError } = await supabase
    .from('outlet_transfer_item')
    .insert(items);

  if (itemError) throw new Error(`Failed to create transfer items: ${itemError.message}`);

  return transfer;
}

export async function fetchTransfers(options?: {
  outletId?: string;
  status?: TransferStatus;
}): Promise<OutletTransfer[]> {
  const supabase = getSupabase();
  let query = supabase
    .from('outlet_transfer')
    .select(`
      *,
      from_outlet:from_outlet_id(id, name),
      to_outlet:to_outlet_id(id, name),
      requested_by_staff:requested_by(id, name),
      items:outlet_transfer_item(*)
    `)
    .order('created_at', { ascending: false });

  if (options?.outletId) {
    query = query.or(`from_outlet_id.eq.${options.outletId},to_outlet_id.eq.${options.outletId}`);
  }

  if (options?.status) {
    query = query.eq('status', options.status);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch transfers: ${error.message}`);
  return data ?? [];
}

export async function fetchTransfer(id: string): Promise<OutletTransfer | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('outlet_transfer')
    .select(`
      *,
      from_outlet:from_outlet_id(id, name),
      to_outlet:to_outlet_id(id, name),
      requested_by_staff:requested_by(id, name),
      items:outlet_transfer_item(*)
    `)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to fetch transfer: ${error.message}`);
  }
  return data;
}

// -- Status Transitions -----------------------------------------------

export async function approveTransfer(transferId: string, staffId: string): Promise<void> {
  await transitionTransfer(transferId, 'approved', {
    approved_by: staffId,
    approved_at: new Date().toISOString(),
  });
}

export async function shipTransfer(
  transferId: string,
  staffId: string,
  shippedQuantities: { itemId: string; quantity: number }[]
): Promise<void> {
  const supabase = getSupabase();

  // Pre-fetch transfer to validate stock availability before any mutations
  const preTransfer = await fetchTransfer(transferId);
  if (!preTransfer?.items) throw new Error('Transfer not found');

  // Validate stock availability for all items BEFORE shipping
  for (const sq of shippedQuantities) {
    if (sq.quantity <= 0) continue;
    const transferItem = preTransfer.items.find((i: any) => i.id === sq.itemId);
    if (!transferItem) throw new Error(`Transfer item ${sq.itemId} not found`);

    // Check current stock
    const { data: inv } = await supabase
      .from('inventory')
      .select('stock')
      .eq('id', transferItem.inventory_id)
      .single();

    if (!inv || inv.stock < sq.quantity) {
      throw new Error(
        `Insufficient stock for "${transferItem.title ?? transferItem.book_id}": ` +
        `available=${inv?.stock ?? 0}, requested=${sq.quantity}`
      );
    }
  }

  // Update shipped quantities on items
  for (const sq of shippedQuantities) {
    const { error } = await supabase
      .from('outlet_transfer_item')
      .update({ quantity_shipped: sq.quantity })
      .eq('id', sq.itemId);

    if (error) throw new Error(`Failed to update shipped quantity: ${error.message}`);
  }

  // Transition status
  await transitionTransfer(transferId, 'shipped', {
    shipped_by: staffId,
    shipped_at: new Date().toISOString(),
  });

  // Create stock_movement entries (transfer_out from source outlet)
  // Stock trigger uses SELECT FOR UPDATE, so concurrent decrements are safe
  const transfer = await fetchTransfer(transferId);
  if (!transfer?.items) return;

  for (const item of transfer.items) {
    if (item.quantity_shipped > 0) {
      const { error } = await supabase
        .from('stock_movement')
        .insert({
          inventory_id: item.inventory_id,
          type: 'transfer_out',
          quantity: -item.quantity_shipped,
          reference_id: transferId,
          reason: `Transfer to ${transfer.to_outlet?.name ?? transfer.to_outlet_id}`,
          staff_id: staffId,
        });

      if (error) throw new Error(`Failed to create transfer_out movement: ${error.message}`);
    }
  }
}

export async function receiveTransfer(
  transferId: string,
  staffId: string,
  receivedQuantities: { itemId: string; inventoryId: string; quantity: number }[]
): Promise<void> {
  const supabase = getSupabase();

  // Update received quantities on items
  for (const rq of receivedQuantities) {
    const { error } = await supabase
      .from('outlet_transfer_item')
      .update({ quantity_received: rq.quantity })
      .eq('id', rq.itemId);

    if (error) throw new Error(`Failed to update received quantity: ${error.message}`);
  }

  // Transition status
  await transitionTransfer(transferId, 'received', {
    received_by: staffId,
    received_at: new Date().toISOString(),
  });

  // Create stock_movement entries (transfer_in to destination outlet)
  // We need to find or create inventory records at the destination outlet
  const transfer = await fetchTransfer(transferId);
  if (!transfer?.items) return;

  for (const rq of receivedQuantities) {
    if (rq.quantity > 0) {
      // Find matching item from transfer
      const item = transfer.items.find(i => i.id === rq.itemId);
      if (!item) continue;

      // Find or create inventory at destination outlet
      let destInventoryId = await findOrCreateDestinationInventory(
        item.book_id,
        item.inventory_id,
        transfer.to_outlet_id
      );

      const { error } = await supabase
        .from('stock_movement')
        .insert({
          inventory_id: destInventoryId,
          type: 'transfer_in',
          quantity: rq.quantity,
          reference_id: transferId,
          reason: `Transfer from ${transfer.from_outlet?.name ?? transfer.from_outlet_id}`,
          staff_id: staffId,
        });

      if (error) throw new Error(`Failed to create transfer_in movement: ${error.message}`);
    }
  }
}

export async function cancelTransfer(
  transferId: string,
  staffId: string,
  reason: string
): Promise<void> {
  const transfer = await fetchTransfer(transferId);
  if (!transfer) throw new Error('Transfer not found');

  // If already shipped, we need to reverse the stock_movement entries
  if (transfer.status === 'shipped' && transfer.items) {
    const supabase = getSupabase();
    for (const item of transfer.items) {
      if (item.quantity_shipped > 0) {
        // Restore stock at source outlet
        const { error } = await supabase
          .from('stock_movement')
          .insert({
            inventory_id: item.inventory_id,
            type: 'transfer_in',
            quantity: item.quantity_shipped,
            reference_id: transferId,
            reason: `Transfer cancelled: ${reason}`,
            staff_id: staffId,
          });

        if (error) throw new Error(`Failed to restore stock on cancel: ${error.message}`);
      }
    }
  }

  await transitionTransfer(transferId, 'cancelled', {
    cancelled_at: new Date().toISOString(),
    cancel_reason: reason,
  });
}

// -- Helpers ----------------------------------------------------------

async function transitionTransfer(
  transferId: string,
  newStatus: TransferStatus,
  extraFields: Record<string, any>
): Promise<void> {
  const supabase = getSupabase();

  // Fetch current status
  const { data: current, error: fetchErr } = await supabase
    .from('outlet_transfer')
    .select('status')
    .eq('id', transferId)
    .single();

  if (fetchErr) throw new Error(`Transfer not found: ${fetchErr.message}`);

  if (!canTransition(current.status as TransferStatus, newStatus)) {
    throw new Error(
      `Invalid transition: cannot move from "${current.status}" to "${newStatus}"`
    );
  }

  const { error } = await supabase
    .from('outlet_transfer')
    .update({ status: newStatus, ...extraFields })
    .eq('id', transferId);

  if (error) throw new Error(`Failed to update transfer status: ${error.message}`);
}

async function findOrCreateDestinationInventory(
  bookId: string,
  sourceInventoryId: string,
  destOutletId: string
): Promise<string> {
  const supabase = getSupabase();

  // Check if inventory already exists at destination for this book
  const { data: existing } = await supabase
    .from('inventory')
    .select('id')
    .eq('book_id', bookId)
    .eq('outlet_id', destOutletId)
    .limit(1)
    .single();

  if (existing) return existing.id;

  // Copy inventory record from source (minus stock, which will be set by movement)
  const { data: source } = await supabase
    .from('inventory')
    .select('*')
    .eq('id', sourceInventoryId)
    .single();

  if (!source) throw new Error(`Source inventory not found: ${sourceInventoryId}`);

  const { data: newInv, error } = await supabase
    .from('inventory')
    .insert({
      book_id: source.book_id,
      outlet_id: destOutletId,
      type: source.type,
      source: source.source,
      is_preloved: source.is_preloved,
      price: source.price,
      cost_price: source.cost_price,
      stock: 0,  // Will be updated by stock_movement trigger
      min_stock: source.min_stock,
      location: null,  // Location will differ at destination
      condition: source.condition,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create destination inventory: ${error.message}`);
  return newInv.id;
}
