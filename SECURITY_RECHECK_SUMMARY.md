# PaintFlow Security Recheck — Delivery Summary

**Date:** 2026-09-07  
**Status:** improved substantially, but **not ready for production deployment** until the critical migration policy issue is fixed and verified against a live Supabase project.

## What was rechecked

- React application state, login/registration flow, demo-mode behavior, and cloud hydration.
- Supabase RLS policies, database triggers, privileged (`SECURITY DEFINER`) functions, RPC grants, sale/stock transactions, and migration behavior.
- Production build, lint checks, and production dependency vulnerabilities.

## Confirmed fixed

| Area | Previous risk | Current state |
|---|---|---|
| Sale and inventory consistency | Separate browser REST writes could partially succeed and leave stock inconsistent. | Fixed in the clean schema: sales, stock-in, and adjustment operations use transactional RPCs with row locks. |
| Cloud-write failures | API errors could be reported as success. | Fixed: failed HTTP calls throw errors and the UI does not apply the local change after a failed RPC. |
| Browser-controlled sale totals | A user could submit manipulated prices, totals, and WHT amounts. | Fixed in the new sale RPC: authoritative price, subtotal, total, tax, and net payable are derived in PostgreSQL. |
| Empty sales | A sale could be created without line items. | Fixed: the sale RPC rejects an empty cart. |
| Direct financial/inventory mutation | Tenant `FOR ALL` RLS policies allowed users to bypass transactions and audit logs. | Fixed in the clean schema: tenant tables are SELECT-only and mutations are routed through dedicated RPCs. |
| Public privileged RPC execution | Privileged functions were executable by default. | Improved: execution is revoked from `PUBLIC` and `anon`; only required RPCs are granted to `authenticated`. |
| Approval audit trail | Activations had no protected record of who approved whom. | Fixed in the clean schema: approval events are written to `shop_approval_audit`. |
| Cloud data loading | Active users saw browser-local/demo stock and reports instead of cloud records. | Fixed: active shops now hydrate inventory, sales, and movements from Supabase after sign-in. |
| Demo-mode production entry | Cloud-mode users were initially placed into an active demo shop. | Fixed: cloud mode starts with no current shop; demo login controls are hidden when Supabase is configured. |
| Code quality gate | Lint previously failed. | Fixed: `npm run lint` passes. |
| Build and dependency scan | Needed verification. | `npm run build` passes; `npm audit --omit=dev` reports zero known production dependency vulnerabilities. |

## What remains

### 1. Critical — existing production databases may still allow self-approval

**Problem**

The versioned hardening migration removes old write policies for inventory, sales, sale items, and stock movements. However, it does not remove the old `shop_isolation_profile` policy on `shops`.

The old policy allowed a shop to update its own entire row, including `status`. PostgreSQL RLS policies are additive, so adding a safer update policy does not cancel the old permissive policy.

**Risk**

On a project created with the old schema and then upgraded by the migration, a pending shop may still be able to set itself to `active` and bypass the administrator approval workflow.

**Required fix**

Add this before creating the replacement `shops` policies in `supabase/migrations/20260907000000_security_hardening.sql`:

```sql
DROP POLICY IF EXISTS "shop_isolation_profile" ON shops;
```

Then inspect the deployed project’s `pg_policies` to ensure no legacy `shop_isolation_*` or `public_*` mutation policy remains.

**Priority:** P0 / must fix before deployment.

### 2. High — a real admin approval service is still required

**Current state**

The approval RPC is now correctly restricted to `service_role` and cannot be invoked from an ordinary browser session. This closes the self-approval vulnerability.

**What is missing**

There is no implemented server-side administrative tool, Edge Function, or protected backend endpoint that safely uses the service credential to approve a shop.

**Required fix**

Create an admin-only server endpoint or Supabase Edge Function that:

1. Validates the caller as an administrator.
2. Calls `admin_approve_shop` with a server-only service credential.
3. Returns only the required approval result.
4. Never exposes the service-role key to the frontend.
5. Preserves the audit log already added to the database.

**Priority:** P1 / required before real administrators can approve shops.

### 3. Medium — session tokens are stored in browser local storage

**Problem**

The app stores access and refresh tokens in `localStorage`.

**Risk**

If an XSS vulnerability is introduced, malicious JavaScript could steal tokens and impersonate a user.

**Required fix**

Adopt a secure server/session design using `HttpOnly`, `Secure`, and appropriate `SameSite` cookies where possible. Also deploy a strict Content Security Policy and keep unsafe HTML rendering out of the app.

**Priority:** P2 / important hardening before handling sensitive production data.

### 4. Medium — security headers are not defined in the repository

**Problem**

`vercel.json` and `netlify.toml` define SPA routing but not browser security headers.

**Required fix**

Configure and validate these headers on the actual hosting platform:

- `Content-Security-Policy`
- `Strict-Transport-Security`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy`
- `frame-ancestors` in CSP (or `X-Frame-Options` where necessary)

**Priority:** P2.

### 5. Low — privileged trigger functions should also pin `search_path`

**Problem**

The transaction RPCs pin `search_path`, but the two provisioning trigger functions should be hardened the same way for consistency.

**Required fix**

Define those `SECURITY DEFINER` functions with:

```sql
SET search_path = public, pg_temp;
```

**Priority:** P3.

## Required live verification before production

Static review cannot prove runtime RLS behavior. After applying the corrected migration, perform these tests against a non-production Supabase project first:

1. Anonymous user cannot read tenant records or call mutation RPCs.
2. Pending user cannot mutate operational data or activate itself.
3. Suspended user cannot read or mutate operational data.
4. Active Shop A cannot access Shop B’s profile, inventory, sales, movements, or voucher updates.
5. Active user cannot directly insert, update, or delete financial/inventory/audit rows through PostgREST.
6. Sale RPC rejects manipulated item prices, totals, WHT values, empty carts, unknown products, negative quantities, and insufficient stock.
7. Two simultaneous sales of the final item result in exactly one success.
8. A second device signs in and receives the correct cloud inventory, sales, and movement history.
9. Only the secure admin endpoint can approve a shop, and every approval produces an audit record.
10. A migration backup and restoration process is tested before applying changes to production.

## Recommended release order

1. Add and apply the missing `DROP POLICY` migration fix in a test project.
2. Verify all RLS policies and RPC grants with the live test matrix.
3. Implement a server-side admin approval endpoint.
4. Add security headers and decide on safer token/session storage.
5. Back up production and test restoration.
6. Apply reviewed migrations to production.
7. Monitor authentication failures, denied RPC calls, approval actions, and database errors after release.

## Bottom line

The application is much safer than at the first review: its core sales and stock operations are now transactional, server-calculated, and protected from direct tenant writes. The remaining production blocker is migration safety: make sure the old permissive `shops` policy is actually removed in existing databases. Then add a real server-side administrator approval path and complete live RLS tests.

---

## Latest recheck — 2026-09-07

### Confirmed closed

- The hardening migration now drops `shop_isolation_profile` and related legacy `shops` policies before installing the replacement policies. This closes the previously reported migration self-approval bypass.
- The clean schema and migration both retain SELECT-only tenant policies for stock, sales, sale items, and movements. An active tenant cannot directly PATCH its stock through PostgREST; it must use the approved RPC path.
- Every current `SECURITY DEFINER` function, including provisioning triggers, now fixes `search_path` to `public, pg_temp`.
- Hosting configuration now includes CSP, HSTS, MIME-sniffing, referrer, frame, and permissions-policy headers for both Netlify and Vercel.
- A server-side `approve-shop` Edge Function has been added. It uses the service-role credential kept in Edge Function environment variables and validates an `app_metadata.is_admin` JWT claim.
- Lint, production build, and production dependency audit all pass.

### Remaining hardening items

#### P1 — Avoid browser-supplied static administrator keys

The Edge Function supports `x-admin-key` as an alternative to an administrator JWT, and its CORS policy allows every origin. The current frontend helper also accepts an `adminKey` argument and sends it from a browser. A static approval secret used in a browser can be exposed through browser storage, source code, extensions, logs, or XSS; broad CORS makes it usable from any origin once exposed.

**Recommendation:** remove the `x-admin-key` option and its frontend parameter. Use only a validated administrator JWT whose `app_metadata.is_admin` claim is set server-side. Restrict `Access-Control-Allow-Origin` to the known production and staging origins.

#### P2 — Preserve the true approver in database audit data

The Edge Function validates an admin user then invokes the SQL RPC using a service-role client. Inside the SQL RPC, `auth.uid()` represents the service context rather than the validated administrator, so the database audit row can record a null/service approver instead of the real administrator.

**Recommendation:** have the Edge Function write the audit entry itself after successful approval, or pass a validated approver UUID into a server-only function and validate that UUID before inserting it. Do not accept an approver ID from ordinary browser input.

#### P2 — Live RLS verification is still required

This recheck verified code and configuration statically. It cannot prove the deployed Supabase project has received the migration or that its live grants/policies have no manual drift. Run the existing live test matrix against a staging project before production deployment.
