# PaintFlow security and reliability review

**Review date:** 2026-09-07  
**Scope:** current React client, Supabase REST/RPC client, and `supabase/schema.sql`  
**Method:** static code review, production build, ESLint, and `npm audit --omit=dev`. No live Supabase project was configured for runtime/RLS testing.

## Executive summary

The prior sale/stock consistency issues have been materially improved: the application now uses transactional RPCs with row locks, and the client now surfaces failed HTTP requests. However, the most important authorization boundary is still broken: any caller that can invoke the public RPC endpoint can approve any shop. Direct table-write policies also allow an active shop to bypass the transactional/audit workflow.

**Release recommendation:** do not deploy the database schema to production until findings S-01 and S-02 are resolved and RLS is tested against real anonymous, pending, active, suspended, and cross-tenant accounts.

## Verified findings

### S-01 — Critical: any API caller can activate any shop

**Evidence:** `supabase/schema.sql`, lines 579–595, defines `admin_approve_shop(target_shop_id uuid)` as `SECURITY DEFINER`, updates a shop to `active`, and contains no caller identity or admin-role check. PostgreSQL grants `EXECUTE` to `PUBLIC` for new functions unless it is explicitly revoked. The client calls this RPC from the pending-shop page.

**Impact:** a pending shop can invoke `POST /rest/v1/rpc/admin_approve_shop` with its own UUID, or another shop UUID, and gain active access. This defeats the approval workflow and permits cross-tenant denial of service/unauthorized activation.

**Required remediation:**

1. Do not expose approval as a browser-callable privileged database function.
2. Prefer a server-side admin endpoint / Supabase Edge Function using a service credential kept off the client.
3. If an RPC is retained, authorize against a server-controlled admin allow-list or `app_metadata` claim, and revoke execution from `PUBLIC`, `anon`, and `authenticated`; grant it only to a dedicated server role.
4. Add an immutable audit entry recording approver ID, target shop ID, timestamp, and prior/new status.

### S-02 — High: direct table policies bypass the transactional workflow and audit trail

**Evidence:** lines 163–181 use `FOR ALL` policies for `shop_inventory`, `sales`, `sale_items`, and `stock_movements`. An active authenticated shop can therefore directly insert, update, or delete its rows through PostgREST. The intended trusted paths are the transactional RPCs at lines 255–577, but RLS does not require those paths.

**Impact:** an active user can alter stock without a stock movement, delete sales, rewrite amounts, insert a fabricated sale, or create inconsistent records. This undermines accounting, auditability, and the row-lock protections.

**Required remediation:**

1. Make application tables read-only to ordinary users: use `SELECT` policies only for `authenticated` users with tenant and active-status checks.
2. Remove ordinary `INSERT`, `UPDATE`, and `DELETE` policies from financial/inventory/audit tables.
3. Implement every permitted mutation as a narrowly scoped RPC or server endpoint; include custom-product creation and WHT-voucher updates.
4. Keep `stock_movements` append-only: no direct user update/delete policy.

### S-03 — High: sale prices, totals, and WHT figures are trusted from the browser

**Evidence:** `record_sale_transaction` inserts `p_sale->>'total'`, tax values, and item `unit_price`, `price_before_vat`, and `subtotal` directly (lines 307–315 and 363–388). It does not verify that the sale total equals item subtotals, that WHT matches the taxable total, or that official catalogue items use their authoritative prices. It also accepts an empty `p_items` array after inserting a sale.

**Impact:** an authenticated active shop can create zero-value or inflated transactions and manipulate WHT/financial reporting by calling the RPC directly. This is a business-integrity flaw even when tenant isolation works.

**Required remediation:**

1. Reject empty carts and require all numeric values to be non-negative and internally consistent.
2. Derive official-item prices from `master_products` in the database, not request JSON.
3. For custom items, derive the price from the shop inventory row or introduce an explicitly authorized price-override workflow with audit logs.
4. Calculate `total`, `total_items`, WHT, and `net_payable` in the RPC from validated lines; do not accept client-calculated financial fields as authoritative.
5. Add database checks for non-negative monetary fields and sensible WHT constraints.

### S-04 — High: privileged functions lack hardened execution configuration

**Evidence:** `is_active_shop`, both provisioning triggers, all transaction RPCs, and the approval RPC are `SECURITY DEFINER` functions (for example lines 131–140, 189–215, 255–422, and 579–595). They do not set a fixed `search_path`, and the schema does not revoke default `PUBLIC` execute permissions or grant the smallest needed roles.

**Impact:** `SECURITY DEFINER` executes with owner privileges and bypasses RLS. Without hardened search paths and explicit execution grants, future schema changes or unsafe object resolution can become privilege-escalation paths. The approval function is already directly exploitable as S-01.

**Required remediation:**

1. Use `SECURITY INVOKER` unless bypassing RLS is strictly necessary.
2. For required definer functions, declare a safe `search_path` (for example `SET search_path = public, pg_temp`) and schema-qualify database objects where practical.
3. `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated;` then grant only the minimum required role.
4. Maintain an allow-list of client-callable RPCs and test each function as `anon`, pending, active, suspended, and a different tenant.

### S-05 — High: cloud data is never loaded into application state

**Evidence:** `supabaseApi.getShopInventory`, `getSales`, and `getMovements` exist in `src/lib/supabaseClient.js` but have no call sites. `StockContext` initializes and reloads products/sales/movements only from `localStorage` or hard-coded `initial*` data (lines 92–140).

**Impact:** a logged-in active shop sees browser-local/demo inventory and reports instead of authoritative cloud data. A fresh shop’s server inventory starts at zero but the client has seeded initial stock, so sales can fail at the database. Multiple devices will show divergent stock and sales history.

**Required remediation:**

1. After authenticated profile loading, fetch the tenant’s inventory, sales, and movements from Supabase and map them to the UI model.
2. Make server data authoritative when Supabase is configured; use local storage only as a clearly labelled cache/offline queue.
3. Refresh after writes or subscribe to carefully authorized realtime updates.
4. Do not show `connected` merely because environment variables exist; confirm a successful authenticated request.

### S-06 — Medium: development demo access is active even when cloud mode is configured

**Evidence:** `StockContext` always defaults `currentShop` to the active Bole demo shop (lines 69–76); `AuthPage` exposes demo-login buttons. The comment says the default is for offline mode, but the code does not check `isSupabaseConfigured`.

**Impact:** a production visitor can enter an apparently active POS without authentication, using browser-local state. Even if RLS blocks cloud writes, this is confusing, can lead to unsaved work, and can conceal authentication failures.

**Required remediation:** default to `null` in configured/production mode. Compile demo data and demo-login controls only in an explicit development/demo build flag. Visibly label all demo data and prevent it from calling production resources.

### S-07 — Medium: schema file destroys every application table

**Evidence:** `supabase/schema.sql`, lines 7–23, drops triggers, functions, and all application tables with `CASCADE` before recreating them.

**Impact:** applying this file to a live project permanently deletes shops, sales, inventory, and audit history. This is an operational security and availability risk.

**Required remediation:** treat this only as a local-development reset script. Move production changes into ordered, versioned Supabase migrations that preserve existing data. Require a tested backup and restore point before any destructive migration.

### S-08 — Medium: access and refresh tokens are stored in `localStorage`

**Evidence:** `src/lib/supabaseClient.js`, lines 26 and 134–136.

**Impact:** any successful XSS can read and exfiltrate both tokens, enabling account takeover until expiry/revocation.

**Required remediation:** prefer an SDK/session design using secure `HttpOnly`, `Secure`, `SameSite` cookies where feasible. Independently reduce XSS risk with a restrictive Content Security Policy, output encoding/sanitization, and no unsafe HTML rendering.

### S-09 — Medium: missing production security headers

**Evidence:** `vercel.json` and `netlify.toml` contain only SPA routing. No Content Security Policy, HSTS, clickjacking restriction, MIME-sniffing protection, or referrer policy is defined in this repository.

**Impact:** browser-level defenses against XSS exploitation, framing/clickjacking, and accidental information leakage are absent unless configured externally.

**Required remediation:** configure headers on the selected hosting platform and test them in staging. Start with CSP, HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and `frame-ancestors`/`X-Frame-Options` consistent with the app’s embedding requirements.

## Positive changes verified

- The sale, stock-in, and adjustment routes now use single database RPC calls and row locks.
- HTTP failures now throw to callers instead of silently returning error objects.
- Sale IDs now use UUIDs client-side.
- The active-status condition is included in current tenant data policies.
- `npm audit --omit=dev` reported no known production dependency vulnerabilities.
- `npm run build` succeeds.

## Verification gaps

- No live Supabase project credentials were available, so policy and RPC tests could not be executed.
- `npm run lint` currently fails with 32 errors and one warning; these are primarily unused imports and React purity/effect violations, but they should be corrected so CI can enforce quality gates.
- No automated authorization test suite, migration test, backup-restore test, or browser security-header test was found.

## Minimum pre-production test matrix

1. Anonymous user: cannot read tenant data or call mutations.
2. Pending shop: can read only its profile; cannot approve itself or mutate operational data.
3. Suspended shop: cannot read or mutate operational data.
4. Active Shop A: cannot view or mutate Shop B data, including through changed IDs in REST and RPC requests.
5. Active shop: cannot call `admin_approve_shop` or directly edit/delete sales, inventory, or audit movements.
6. Sale RPC: rejects empty carts, forged totals, manipulated WHT, duplicate sale IDs, unknown products, and insufficient stock; it rolls back completely on each failure.
7. Two simultaneous sales for the final unit: exactly one succeeds.
8. Fresh login on a second device: shows authoritative cloud inventory, sales, and movements.

---

## Follow-up recheck — 2026-09-07

### Improvements confirmed

- The clean schema now uses SELECT-only tenant policies for inventory, sales, sale items, and stock movements. The supported mutation paths are hardened RPCs.
- Sale recording now rejects empty carts and derives item pricing, totals, WHT, and net payable from inventory/catalogue values in the database.
- Security-definer transaction functions now set `search_path = public, pg_temp`; public and anonymous function execution is revoked; authenticated users receive only the necessary operational RPC grants.
- The approval RPC is granted to `service_role` only, and it now records an approval audit row. The public pending-registration UI no longer presents the approval action in cloud mode.
- Cloud hydration now loads inventory, sales, and movements after an active shop signs in. Cloud mode now starts with no selected demo shop.
- `npm run lint` and `npm run build` pass. `npm audit --omit=dev` still reports zero known production dependency vulnerabilities.

### S-10 — Critical for existing deployments: migration leaves the former permissive shop policy in place

**Evidence:** `supabase/migrations/20260907000000_security_hardening.sql` removes former inventory/sales policies (lines 45–52) but does not remove the former `shop_isolation_profile` policy on `shops`. That policy existed in the earlier schema as `FOR ALL USING (id = auth.uid()) WITH CHECK (id = auth.uid())`.

**Impact:** PostgreSQL RLS policies are additive (permissive by default). On a database upgraded from the earlier schema, the old `shop_isolation_profile` policy remains alongside the new restricted contact-details policy. A tenant can therefore still update its own `status` to `active`, defeating approval. The clean-reset `schema.sql` does not show this issue because it drops and recreates the table, but a production migration does.

**Required remediation:** add this before creating the replacement shops policies in the hardening migration:

```sql
DROP POLICY IF EXISTS "shop_isolation_profile" ON shops;
```

Also inspect the live project with `pg_policies` (or Supabase Database Advisors) after migration and verify that no legacy `public_*` or `shop_isolation_*` write policy remains on any exposed application table.

### Remaining advisory items

- The admin approval RPC is intentionally not browser-callable. A separate server-side/Edge Function admin workflow, using a service credential that never reaches the browser, is still required for real approvals.
- Access and refresh tokens remain in `localStorage`; protect against XSS and consider secure `HttpOnly` cookie sessions.
- The provisioning trigger functions should also receive explicit fixed `search_path` settings for consistency with the other privileged functions.
- Deployment security headers are still not defined in `vercel.json` or `netlify.toml`.
