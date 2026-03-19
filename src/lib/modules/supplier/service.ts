import { getSupabase } from '$lib/supabase/client';
import type {
  Supplier, NewSupplier, PurchaseOrder, PurchaseOrderItem,
  NewPurchaseOrder, PurchaseOrderStatus,
} from './types';

// --- Supplier CRUD ---

export async function createSupplier(input: NewSupplier): Promise<Supplier> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('supplier')
    .insert({
      name: input.name,
      contact_name: input.contact_name ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      api_endpoint: input.api_endpoint ?? null,
      lead_time_days: input.lead_time_days ?? 7,
      notes: input.notes ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create supplier: ${error.message}`);
  return data as Supplier;
}

export async function getSuppliers(activeOnly = true): Promise<Supplier[]> {
  const supabase = getSupabase();
  let query = supabase.from('supplier').select();
  if (activeOnly) query = query.eq('is_active', true);
  const { data, error } = await query.order('name');

  if (error) throw new Error(`Failed to fetch suppliers: ${error.message}`);
  return (data ?? []) as Supplier[];
}

export async function getSupplierById(id: string): Promise<Supplier | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('supplier')
    .select()
    .eq('id', id)
    .single();

  if (error) return null;
  return data as Supplier;
}

export async function updateSupplier(id: string, updates: Partial<NewSupplier>): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('supplier')
    .update(updates)
    .eq('id', id);

  if (error) throw new Error(`Failed to update supplier: ${error.message}`);
}

export async function deactivateSupplier(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('supplier')
    .update({ is_active: false })
    .eq('id', id);

  if (error) throw new Error(`Failed to deactivate supplier: ${error.message}`);
}

// --- Purchase Order CRUD ---

export async function createPurchaseOrder(input: NewPurchaseOrder): Promise<PurchaseOrder> {
  const supabase = getSupabase();

  // Create PO header
  const { data: po, error: poError } = await supabase
    .from('purchase_order')
    .insert({
      supplier_id: input.supplier_id,
      outlet_id: input.outlet_id,
      status: 'draft',
      notes: input.notes ?? null,
      created_by: input.created_by,
    })
    .select()
    .single();

  if (poError) throw new Error(`Failed to create PO: ${poError.message}`);

  // Create PO items
  const items = input.items.map(item => ({
    purchase_order_id: po.id,
    book_id: item.book_id ?? null,
    isbn: item.isbn ?? null,
    title: item.title,
    quantity: item.quantity,
    unit_price: item.unit_price,
  }));

  const { error: itemsError } = await supabase
    .from('purchase_order_item')
    .insert(items);

  if (itemsError) {
    // Rollback: delete the orphaned PO header
    await supabase.from('purchase_order').delete().eq('id', po.id);
    throw new Error(`Failed to create PO items: ${itemsError.message}`);
  }

  return po as PurchaseOrder;
}

export async function getPurchaseOrders(
  outletId: string,
  status?: PurchaseOrderStatus
): Promise<PurchaseOrder[]> {
  const supabase = getSupabase();
  let query = supabase
    .from('purchase_order')
    .select('*, supplier(name, contact_name, phone)')
    .eq('outlet_id', outletId);

  if (status) query = query.eq('status', status);

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch POs: ${error.message}`);
  return (data ?? []) as PurchaseOrder[];
}

export async function getPurchaseOrderById(id: string): Promise<PurchaseOrder | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('purchase_order')
    .select('*, supplier(*), purchase_order_item(*)')
    .eq('id', id)
    .single();

  if (error) return null;

  const po = data as any;
  return {
    ...po,
    supplier: po.supplier,
    items: po.purchase_order_item ?? [],
  } as PurchaseOrder;
}

export async function updatePOStatus(
  id: string,
  status: PurchaseOrderStatus
): Promise<void> {
  const supabase = getSupabase();
  const updates: Record<string, any> = { status };

  if (status === 'ordered') updates.ordered_at = new Date().toISOString();
  if (status === 'received') updates.received_at = new Date().toISOString();

  const { error } = await supabase
    .from('purchase_order')
    .update(updates)
    .eq('id', id);

  if (error) throw new Error(`Failed to update PO status: ${error.message}`);
}

export async function receivePOItem(
  itemId: string,
  receivedQty: number
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('purchase_order_item')
    .update({ received_quantity: receivedQty })
    .eq('id', itemId);

  if (error) throw new Error(`Failed to update received quantity: ${error.message}`);
}

/**
 * Receive a complete PO: update all item received quantities,
 * create stock movements, and set PO status to 'received'.
 *
 * ATOMICITY LIMITATION: This function is NOT atomic. Each item is processed
 * sequentially via individual Supabase calls. If a stock_movement insert fails
 * mid-loop, earlier items will already be committed. Manual intervention may be
 * needed to reconcile partial receives.
 */
export async function receivePurchaseOrder(
  poId: string,
  receivedItems: Array<{ itemId: string; inventoryId: string; receivedQty: number }>,
  staffId: string
): Promise<void> {
  const supabase = getSupabase();
  const succeededItems: string[] = [];

  for (const item of receivedItems) {
    // Update received quantity on PO item
    await receivePOItem(item.itemId, item.receivedQty);

    // Create stock movement for each received item
    if (item.receivedQty > 0) {
      const { error } = await supabase
        .from('stock_movement')
        .insert({
          inventory_id: item.inventoryId,
          type: 'purchase_in',
          quantity: item.receivedQty,
          reference_id: poId,
          staff_id: staffId,
          reason: `PO received: ${item.receivedQty} units`,
        });

      if (error) {
        const failedId = item.itemId;
        const msg = `Failed to record stock movement for item ${failedId}. ` +
          `Succeeded items: [${succeededItems.join(', ')}]. ` +
          `Failed at item: ${failedId}. Error: ${error.message}`;
        throw new Error(msg);
      }
    }

    succeededItems.push(item.itemId);
  }

  // Mark PO as received
  await updatePOStatus(poId, 'received');
}

export async function getSupplierPOs(supplierId: string): Promise<PurchaseOrder[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('purchase_order')
    .select('*')
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch supplier POs: ${error.message}`);
  return (data ?? []) as PurchaseOrder[];
}
