---
name: Shared Supabase database
description: Shared Supabase choice and safety constraints for the retained Replit sources.
---

Development and production should use one shared Supabase database, as the user selected. Keep the old Replit databases intact for recovery; do not silently fall back to them when Supabase configuration is missing.

**Why:** The user selected a shared database and authorized the migration. Production access was subsequently restored; its public schema contained only the global scan-budget record, not shop tables. Mixing database targets would create divergent data.

**How to apply:** Use the securely configured Supabase connection in both app environments, retaining Replit DATABASE_URL only for tests. Preserve newer scan-budget periods and never reduce same-period usage when retrying imports. Original App Storage files are retained; do not delete them merely because a Supabase copy exists.

Recovery was designed without a separately verified cutover ancestor snapshot; do not assume the retained database is an authoritative baseline for classifying deletions or choosing the winning branch.

**Why:** No trusted three-way comparison baseline was established during cutover, so automatic timestamp-based reconciliation would risk discarding legitimate shop changes.

**How to apply:** Require explicit operator choices for differing or missing records unless a future recovery establishes and verifies an actual common-ancestor snapshot first.
