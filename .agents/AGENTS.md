# PaintFlow Project Rules

Every agent operating on the PaintFlow codebase must follow these foundational rules:

- **Preserve existing user changes:** Never reset, discard, or overwrite unrelated work.
- **Do not commit unless explicitly asked:** Only stage or review code; leave git commit actions to explicit user instructions.
- **Client state is not authoritative:** Do not treat browser state as authoritative for stock, sales, money, approval, or authorization.
- **Server-derived tenant identity:** The database must derive tenant identity from authenticated server identity (`auth.uid()`), never from a client-provided shop ID.
- **Atomic transactions:** Stock, sales, and audit records must be modified strictly through atomic database transactions (PostgreSQL RPCs).
- **Explicit monetary semantics:** Monetary values must have explicit VAT-inclusive/exclusive semantics and deterministic rounding.
- **No invented domain data:** Do not invent Jotun prices, product sizes, tax rules, or tinting formulas.
- **Forward-only migrations:** Any schema change requires a safe forward-only migration, plus a fresh-install and upgrade-path review.
- **Verification required:** Any financial, stock, or auth change requires appropriate tests and a final verification report.

---

## Agent Collaboration Workflow

To ensure quality control and avoid isolation blindspots, follow this handoff pipeline:

1. **Assign One Primary Specialist:** Every task starts with a single domain expert.
2. **Narrow Goal:** Implement only the requested scope while strictly preserving unrelated code.
3. **Pre-Review Checks:** Run build (`npm run build`), lint (`npm run lint`), and targeted verification.
4. **Handoff to QA Reviewer:** Send the finished work to `qa-release-reviewer`.
5. **Categorized Findings:** QA returns confirmed findings ranked **P0–P3**.
6. **Remediation:** Send P0/P1 findings back to the primary specialist or cross-functional specialist.
7. **Re-Verification:** QA rechecks the actual fix before completion.
8. **Final Decision:** Commit only after review is clean and approved by the user.

### Priority Severity Definitions:
- **P0:** Security breach, unauthorized cross-tenant access, data loss, incorrect sale/stock/tax records.
- **P1:** Major feature failure, inconsistent cloud/local data, broken cashier/checkout workflow.
- **P2:** Meaningful UX, accessibility, maintainability, or error-handling problem.
- **P3:** Visual polish, wording, minor styling inconsistency, low-risk cleanup.
