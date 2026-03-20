# Libris Cafe — Coding Standards

Compiled from 6 rounds of production reviews (120+ findings). Every rule here exists because the violation was found in real code and caused or would have caused a production incident.

---

## 1. Financial Operations

### Always Atomic
```
BAD:  await supabase.from('transaction').insert(tx);
      await supabase.from('transaction_item').insert(items);  // if this fails, orphaned tx
      await supabase.from('stock_movement').insert(movements); // if this fails, wrong stock

GOOD: await supabase.rpc('checkout_transaction', { ...params, p_items: JSON.stringify(items) });
      // Single PL/pgSQL function — all-or-nothing
```

### Server-Side Total Verification
```
BAD:  The RPC accepts p_total from the client and inserts it directly
GOOD: The RPC recomputes subtotal from SUM(item.quantity * item.price) and validates
```

### Status Guards on State Machines
```
BAD:  UPDATE purchase_order SET status = 'received' WHERE id = $id;
GOOD: UPDATE purchase_order SET status = 'received' WHERE id = $id AND status = 'ordered';
      -- Check rowCount > 0 to confirm transition happened
```

### Idempotency
```
BAD:  Webhook inserts stock_movement on every call (duplicate webhook = double stock change)
GOOD: Webhook checks webhook_processed flag, skips if already processed for this status
```

---

## 2. Supabase Queries

### Always Check Errors
```
BAD:  const { data } = await supabase.from('table').select().single();
GOOD: const { data, error } = await supabase.from('table').select().single();
      if (error) throw new Error(`Failed: ${error.message}`);
```

### Distinguish Not-Found from Real Errors
```
BAD:  if (error) return null;  // silently hides network errors
GOOD: if (error) {
        if (error.code === 'PGRST116') return null;  // not found
        throw new Error(`DB error: ${error.message}`);  // real problem
      }
```

### Never select('*') on Tables with Sensitive Columns
```
BAD:  supabase.from('staff').select('*')  // includes pin_hash, email
GOOD: supabase.from('staff').select('id, name, role, outlet_id, is_active, created_at')
```

### Add Limits to Unbounded Queries
```
BAD:  supabase.from('stock_movement').select().eq('inventory_id', id)  // could return 10,000 rows
GOOD: supabase.from('stock_movement').select().eq('inventory_id', id).limit(500).order('created_at', { ascending: false })
```

### Parallelize Independent Queries
```
BAD:  const { count: a } = await supabase.from('inventory')...;
      const { count: b } = await supabase.from('transaction')...;
GOOD: const [{ count: a }, { count: b }] = await Promise.all([
        supabase.from('inventory')...,
        supabase.from('transaction')...,
      ]);
```

---

## 3. Svelte 5 Patterns

### Reactive Stores Across Module Boundaries
```
BAD:  // stores.svelte.ts
      export function getCart() { return currentCart; }
      // component.svelte
      let cart = $derived(getCart());  // NOT reactive — function call breaks tracking

GOOD: // stores.svelte.ts
      export const cartStore = { get current() { return currentCart; } };
      // component.svelte
      let cart = $derived(cartStore.current);  // reactive — getter tracked by compiler
```

### Auth State Must Be Derived
```
BAD:  const staff = getCurrentStaff();  // captured once, stale on deep link
GOOD: let staff = $derived(getCurrentStaff());  // updates when auth state changes
```

### Effects vs onMount
```
BAD:  $effect(() => { initPayment(); });  // may re-run if deps change, causing double init
GOOD: onMount(() => { initPayment(); });  // runs exactly once
```

### Page Imports (Svelte 5)
```
BAD:  import { page } from '$app/stores';    // Svelte 4 API
GOOD: import { page } from '$app/state';     // Svelte 5 API
      const id = page.params.id;             // no $ sigil needed
```

### Navigation with Base Path
```
BAD:  goto('/staff/pos');              // breaks on subdirectory deployments
GOOD: goto(`${base}/staff/pos`);       // works everywhere
```

### Event Listener Cleanup
```
BAD:  onMount(() => { Quagga.onDetected(handler); });
      onDestroy(() => { Quagga.stop(); });  // listener leaked!

GOOD: let handler: Function;
      onMount(() => { handler = (r) => {...}; Quagga.onDetected(handler); });
      onDestroy(() => { Quagga.stop(); Quagga.offDetected(handler); });  // cleaned up
```

---

## 4. Security

### Edge Function Auth Pattern
```typescript
// EVERY Edge Function (except webhooks) must start with:
import { getAuthenticatedUser, unauthorizedResponse } from '../_shared/auth.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const user = await getAuthenticatedUser(req);
  if (!user) return unauthorizedResponse(corsHeaders);
  // ... rest of function
});
```

### SECURITY DEFINER RPCs Must Validate Caller
```sql
-- EVERY RPC that accepts p_outlet_id must check:
PERFORM check_outlet_access(p_outlet_id);
-- This verifies auth.uid() is active staff at that outlet, or owner
```

### HTML Sanitization
```typescript
function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
// Apply to ALL user content in HTML templates (receipts, emails)
```

### Input Validation in Edge Functions
```typescript
if (gross_amount <= 0 || !Number.isFinite(gross_amount)) return error(400);
if (report.rows?.length > 10000) return error(400);
if (!pin || pin.length < 6) return error(400);
```

---

## 5. Error Handling in UI

### Every Page Needs 3 States
```svelte
{#if loading}
  <div class="py-8 text-center text-sm text-ink-muted">{t('common.loading')}</div>
{:else if error}
  <div class="py-8 text-center text-sm text-berry">{error}</div>
{:else if items.length === 0}
  <div class="py-8 text-center text-sm text-ink-muted">{t('inventory.empty')}</div>
{:else}
  {#each items as item}...{/each}
{/if}
```

### Never Use Empty Catch Blocks
```
BAD:  try { await markAsRead(id); } catch {}
GOOD: try { await markAsRead(id); } catch { showToast(t('error.generic'), 'error'); }
```

### Logout Must Clear All Stores
```typescript
// In logout() and SIGNED_OUT handler:
setCurrentStaff(null);
clearNotifications();
resetCart();
unsubscribeFromNotifications();
```

---

## 6. i18n

### All User-Facing Strings Must Use t()
```
BAD:  showToast('Book not in inventory', 'error');
GOOD: showToast(t('pos.not_in_inventory'), 'error');
```

### Always Add to Both Language Files
When adding a key to `en.ts`, ALWAYS add the corresponding key to `id.ts` in the same commit.

---

## 7. Design System

### Use Semantic Tokens, Not Raw Colors
```
BAD:  bg-white text-gray-800 text-red-500 bg-sky-500
GOOD: bg-surface text-ink text-berry bg-accent
```

### Never Use DaisyUI Classes
```
BAD:  bg-base-200 text-base-content btn btn-primary text-error
GOOD: bg-surface text-ink px-4 py-2 rounded-xl bg-accent text-cream text-berry
```

---

## 8. Database Conventions

### Reserved Word: "transaction"
Always double-quote: `"transaction"` in all SQL, including indexes, RLS policies, and RPCs.

### Stock Operations
The `stock_movement` trigger uses `SELECT FOR UPDATE` to prevent race conditions.
The `CHECK (stock >= 0)` constraint prevents negative stock.
Handle the exception: `if (error.message.includes('Insufficient stock'))`.

### New Migration Naming
`supabase/migrations/NNNNN_descriptive_name.sql` — sequential numbering.

---

## Pre-Implementation Checklist

Before writing any feature, verify:

- [ ] Financial operations use atomic RPCs (not sequential client calls)
- [ ] All RPCs validate `auth.uid()` and outlet access
- [ ] All Edge Functions have auth checks
- [ ] All Supabase queries check the `error` field
- [ ] All pages have loading, error, and empty states
- [ ] All strings use `t()` with keys in both en.ts and id.ts
- [ ] All navigation uses `${base}` prefix
- [ ] All event listeners cleaned up in `onDestroy`
- [ ] All stores use `$derived(store.getter)` pattern
- [ ] All forms validate inputs (required, numeric, bounds)
- [ ] Design system tokens used (not raw Tailwind colors)
- [ ] Status transitions have guards (check current status before update)
