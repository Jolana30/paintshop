---
description: PaintFlow inventory, stock movement, and ledger integrity rules
trigger: always_on
---

# PaintFlow Inventory Integrity Rules

## 1. Atomic Stock Deductions
- Inventory deduction, sale creation, and stock movement logging must happen inside a single atomic database transaction (`record_sale_transaction`).
- Under no circumstances may client code directly execute `UPDATE shop_inventory SET quantity = ...`.

## 2. No Negative Stock
- Stock quantities must never drop below zero (`quantity >= 0`).
- Checkout requests with insufficient stock must fail immediately and roll back the entire transaction.

## 3. Auditable Movements
- Every change to stock (Sale, Stock In, Adjustment, Damage, Return) must generate an immutable record in `stock_movements`.
- Each movement record must preserve immutable product identity: product ID, code, name, and size.

## 4. Concurrency Protection
- Transactional RPCs must employ row-level locking (`SELECT ... FOR UPDATE`) on the target inventory rows to prevent race conditions during simultaneous sales of the last available unit.

## 5. Stock In & Custom Product Validation
- Stock In operations must require positive integer quantities (`quantity > 0`).
- Custom product creation must enforce uniqueness of product codes within the active shop.
