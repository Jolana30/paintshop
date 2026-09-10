---
description: PaintFlow change safety, migration, and git discipline rules
trigger: always_on
---

# PaintFlow Change Safety Rules

## 1. Preserve User Work
- Never run destructive git commands (`git reset --hard`, `git clean -fd`, `git checkout .`) unless explicitly requested.
- If uncommitted user modifications exist in unrelated files, preserve them intact.

## 2. No Unauthorized Commits
- Agents must never execute `git commit` or `git push` on their own initiative.
- Stage changes or present diffs, and wait for explicit user instruction before committing.

## 3. Database Migration Safety
- Never run destructive reset scripts (`DROP TABLE ... CASCADE`) against shared, staging, or production databases.
- All schema modifications must be forward-only migrations saved under `supabase/migrations/` with upgrade and rollback analysis.
- Every migration must be checked for backward compatibility with existing client builds.

## 4. Controlled Refactoring
- Structural refactors (e.g. splitting components or reorganizing stylesheets) must preserve existing functionality without stealth feature or API modifications.
- Coordinate with the relevant domain specialist when refactoring sensitive logic (POS, tax, auth, or inventory).
