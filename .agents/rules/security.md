---
description: PaintFlow security, tenant isolation, and authorization rules
trigger: always_on
---

# PaintFlow Security Rules

## 1. Tenant Isolation
- Tenant identity must always be resolved server-side from `auth.uid()`.
- Never trust client-provided `shop_id` headers, query parameters, or body payloads for authorization.
- Cross-tenant queries must be blocked at the database level via Row-Level Security (RLS).
- S-06 Demo Mode Isolation: Demo shops (`shop-demo-*`) must operate strictly on local state and never read or write live customer/tenant data.

## 2. Row Level Security (RLS)
- RLS must be enabled on all tenant tables (`shops`, `shop_inventory`, `sales`, `sale_items`, `stock_movements`).
- Default policy is DENY ALL. Explicit policies must check `auth.uid() = shop_id`.
- Clients are forbidden from performing direct `INSERT`, `UPDATE`, or `DELETE` on financial or inventory tables; all mutations must flow through vetted SECURITY DEFINER RPCs.

## 3. Server-Side Administrative Authorization
- No administrative action (such as shop approval, suspension, or system config) may rely on a client-side PIN, local storage flag, hidden button, or client-side route guard.
- All admin actions must be verified by backend policy (e.g. `supabase/functions/approve-shop/` or admin RPC with verified privileges).

## 4. Credential & Environment Protection
- Never expose Supabase service-role keys in client bundles, public environments, or git.
- Restrict client access to the public anonymous key with strict RLS enforcement.
- Keep CORS headers and CSP restrictive in `vercel.json` and `netlify.toml`.

## 5. Failure Handling
- Failed cloud login, signup, or API transactions must fail explicitly with user feedback; never silently fall back to a local success.
