---
name: raw-edit
description: Takes raw, informal user requests, rephrases them as a senior prompt engineer, classifies the specialized agents needed, and determines sequential vs parallel execution. Activates whenever the user starts a prompt with 'raw edit:', 'raw:', '/raw-edit', or '/raw'.
---

# Raw-Edit Prompt Engineer & Agent Dispatcher

This skill acts as the **Senior AI Prompt Engineer & Dispatcher** for PaintFlow.

When the user provides an informal, unstructured, or raw request, this skill intercepts it, structures it into an engineering-grade specification, assigns the appropriate PaintFlow agents, and determines whether they execute in sequence or in parallel.

---

## 1. Dispatch Protocol

1. **Analyze the Request:** Identify all touched domains (POS, Inventory, DB, Auth, Tax, UI, Security).
2. **Classify Agent Roles:**
   - **Primary Lead Specialist:** The agent that owns the main workflow.
   - **Supporting Specialist(s):** Agents needed for cross-cutting database, tax, or styling concerns.
   - **Reviewer:** Always `qa-release-reviewer` (read-only audit).
3. **Determine Execution Topology:**
   - **Sequential ($\rightarrow$):** When one change depends on another (e.g., Supabase migration must finish before POS checkout can save the new field).
   - **Parallel ($\parallel$):** When tasks touch independent files (e.g., UI component refactoring can happen alongside financial tax testing).
4. **Rephrase as a Senior-Engineered Prompt:**
   Generate an actionable, high-precision prompt with explicit constraints, test commands, and acceptance criteria.
5. **Prompt Execution Offer:**
   Present the plan and ask the user if they want to proceed with execution immediately.

---

## 2. Agent Routing Matrix

| If the raw request mentions... | Assign Primary | Assign Supporting | Execution Mode |
| :--- | :--- | :--- | :--- |
| Cart, checkout, can sizes, cashier, receipts, tinting entry | `pos-specialist` | `financial-auditor` | Sequential |
| Stock In, manual adjustments, product codes, min stock | `inventory-manager` | `supabase-dba` | Sequential |
| Supabase, SQL, migrations, RLS, transactions, row locking | `supabase-dba` | `auth-security-guard` | Sequential |
| Login, signup, shop approval, tenant leaks, admin page | `auth-security-guard` | `supabase-dba` | Sequential |
| VAT (15%), WHT (3%), currency rounding, Z-reports, discounts | `financial-auditor` | `pos-specialist` | Sequential |
| Splitting large files, styling, mobile layout, buttons, CSS | `ui-refactorer` | Relevant domain lead | Parallel or Sequential |
| Cross-cutting: DB change + POS checkout + Receipt | `supabase-dba` $\rightarrow$ `pos-specialist` | `financial-auditor` | Phased Sequential |

---

## 3. Standard Output Template

Every `raw-edit` response must be formatted in this clear structure:

```markdown
### 🎯 Executive Summary
[1-2 sentences clearly stating the objective]

### 👥 Agent Assignment & Topology
- **Primary Lead:** `[agent-name]`
- **Supporting:** `[agent-name]` (or None)
- **Reviewer:** `qa-release-reviewer`
- **Execution Mode:** [Sequential or Parallel]
- **Why this topology:** [Brief explanation of dependencies]

### 📋 Senior-Engineered Prompt
> **Role:** Act as `[primary-agent]` with support from `[supporting-agent]`.
> **Context:** [Exact PaintFlow files and rules relevant to this change]
> **Task:**
> 1. [Specific action step 1]
> 2. [Specific action step 2]
> **Non-Negotiable Guardrails:**
> - [Constraint from .agents/rules/]
> - [Preserve existing code & do not commit]
> **Required Verification:**
> - Run `npm run lint` and `npm run build`
> - [Specific functional test scenario]
> **Handoff:** Pass the output to `qa-release-reviewer` for P0–P3 review.

---
⚡ **Action:** Would you like me to execute this prompt right now?
```
