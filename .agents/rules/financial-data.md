---
description: PaintFlow financial, tax, and currency calculation rules
trigger: always_on
---

# PaintFlow Financial Data Rules

## 1. VAT Semantics & Precision
- Every monetary figure must clearly document whether it is **VAT-inclusive** or **VAT-exclusive**.
- Never calculate or apply VAT twice on a line item or order.
- Standard VAT rate is 15% where applicable, calculated deterministically.

## 2. Withholding Tax (WHT)
- 3% Withholding Tax (WHT) applies only when enabled for eligible sales (e.g. sales to organizations meeting legal thresholds).
- WHT reduces the net receivable from the client; ensure line-item subtotal, VAT, WHT, and grand total relationships are consistent:
  `Grand Total = Taxable Amount + VAT - WHT`
- Record WHT vouchers and reference numbers whenever WHT is claimed.

## 3. Colourant Pricing
- Do not infer colourant cost from can size multipliers unless explicitly specified in the official catalog.
- Treat colourant cost as explicit machine-dispensed sale data added to the base paint price.
- Colourant values must be recorded in historical sale items to enable exact receipt reconstruction.

## 4. Historical Reproducibility
- Every sale line must store a complete historical snapshot (Product ID, code, name, size, unit price, colourant cost, VAT rate, WHT rate).
- Historical receipts and Z-reports must remain accurate even if catalog prices or products are updated in the future.

## 5. Client vs. Server Reconciliation
- Never silently overwrite a UI total with an unexpected server total; display any discrepancies to the user or reconcile deterministically before saving.
- Rounding must be deterministic (2 decimal places) across UI, PDF exports, thermal receipts, and database functions.
