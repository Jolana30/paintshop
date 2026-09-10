---
description: PaintFlow testing, verification, and QA gate rules
trigger: always_on
---

# PaintFlow Testing Rules

## 1. Obligatory Pre-Verification
Before declaring any task complete or passing work to `qa-release-reviewer`, the implementing specialist must run:
1. `npm run lint` — Must pass without new errors or unhandled warnings.
2. `npm run build` — Must produce a clean Vite production bundle without syntax or type failures.
3. Relevant feature-level tests or manual verification scenarios.

## 2. Core Verification Scenarios by Domain
- **POS / Sales:**
  - Add, remove, and modify cart quantities across actual catalog sizes (2.7L, 3L, 9L, 10L, 13.5L, 15L, and 1 pc).
  - Out-of-stock and low-stock behavior during search and add-to-cart.
  - Zero-colourant warning when selecting a tintable base paint.
  - Cart state preservation when checkout fails (e.g. network disconnect or stock race).
  - Both mobile viewport and desktop viewport responsiveness.
- **Inventory:**
  - Positive integer Stock In flow across actual catalog sizes (2.7L, 3L, 9L, 10L, 13.5L, 15L, and 1 pc).
  - Up and down inventory adjustments with movement logs.
  - Zero stock transition.
  - Reload persistence for both cloud and local mock modes.
- **Supabase / DBA:**
  - Cross-tenant access rejection (Shop A attempting to read/write Shop B data).
  - Anonymous/unauthenticated access rejection.
  - Insufficient stock atomic rollback.
  - Simultaneous race condition test on final available unit.
- **Financial / Tax:**
  - Calculation check: Subtotal, 15% VAT, 3% WHT, discounts, and rounding boundaries.
  - Historical receipt reprinting matches stored sale figures.

## 3. QA Reviewer Gate
- No agent may approve their own changes.
- The `qa-release-reviewer` must independently inspect and run the code, reporting all findings ranked P0 through P3 before user sign-off.
