# Libris Cafe — Development Rules

## Project
Book cafe management PWA: SvelteKit 5 + Svelte 5 runes + Yjs CRDTs + Supabase + Midtrans.
Handles REAL MONEY (POS transactions, payments, consignment payouts).

## Critical Rules (violating these causes production incidents)

### Financial Integrity
- **NEVER trust client-supplied financial values.** All totals, prices, tax must be verified or computed server-side (in Supabase RPCs).
- **All multi-table writes MUST be atomic.** Use Supabase RPCs (PL/pgSQL functions) for any operation that inserts/updates multiple tables. NEVER use sequential client-side Supabase calls for financial operations.
- **Status transitions MUST have guards.** Before changing status (PO, settlement, transfer), ALWAYS check current status first. Use `WHERE status = 'expected'` in the UPDATE.
- **Idempotency on all webhooks and retryable operations.** Check "already processed" before acting.

### Security
- **ALL Edge Functions require authentication** (except midtrans-webhook which uses HMAC signature verification).
- **ALL SECURITY DEFINER RPCs must validate `auth.uid()`** — check caller belongs to the outlet.
- **NEVER store secrets in localStorage.** Only env vars for Supabase credentials.
- **Sanitize ALL user content** before rendering as HTML (receipt templates, emails).
- **CORS: set `ALLOWED_ORIGIN` in production.** Never deploy with wildcard.

### Svelte 5 Patterns
- **Stores:** Use `$derived(store.getter)` pattern for reactivity across module boundaries — NOT `$derived(getterFunction())`.
- **Auth:** Always use `let staff = $derived(getCurrentStaff())` — NEVER `const staff = getCurrentStaff()` at module level.
- **Navigation:** Always use `${base}/path` — NEVER hardcode paths without `base` prefix.
- **Effects:** Use `onMount` for one-time init — NEVER `$effect` for things that should run once.
- **Event listeners:** Always clean up in `onDestroy` (Quagga, Supabase Realtime, scroll, etc).
- **Page imports:** Use `import { page } from '$app/state'` (Svelte 5) — NOT `$app/stores`.

### Error Handling
- **Every Supabase query must destructure and check `error`.** NEVER ignore the error field.
- **Every page must have 3 states:** loading, error, content (or empty). NEVER show empty state for errors.
- **Every try/catch in UI must show feedback** (toast or error display). NEVER use empty `catch {}`.
- **Distinguish "not found" from "real error"** in `.single()` calls (check `error.code === 'PGRST116'`).

### Data Consistency
- **Yjs owns book metadata. Supabase owns business data.** Never duplicate ownership.
- **Bridge via `book_id` UUID.** Always handle the case where a Yjs book was deleted but Supabase inventory still references it.
- **Logout must clear ALL session-scoped stores** (notifications, cart, realtime subscriptions).
- **Outlet-scoped data must refresh when outlet switches.**

### i18n
- **ALL user-facing strings must use `t()`.** No hardcoded English or Indonesian in Svelte templates.
- **Add keys to BOTH `en.ts` and `id.ts`** simultaneously.

### Design System
- Use `bg-surface` (not `bg-white`), `text-ink` (not `text-gray-800`), `text-berry` (not `text-red-500`).
- NEVER use DaisyUI classes (bg-base-*, btn, text-error, etc).
- All interactive elements: minimum 48px touch target.

### Database
- Use `"transaction"` (double-quoted) — it's a PostgreSQL reserved word.
- Inventory: `UNIQUE(book_id, outlet_id)` constraint exists — use upsert for idempotent inserts.
- Stock trigger uses `SELECT FOR UPDATE` — concurrent-safe but be aware of lock contention.
- `stock >= 0` CHECK constraint exists — handle the exception gracefully.

## Commands
```
npm run dev          # Dev server
npm run build        # Production build
npm run test         # 150 tests (Vitest)
npm run check        # Type-check
```

## Reference
- [Coding Standards](docs/coding-standards.md) — Full patterns, anti-patterns, checklists
- [Design Spec](docs/superpowers/specs/2026-03-19-libris-cafe-design.md)
