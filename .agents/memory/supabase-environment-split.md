---
name: Shared Supabase database
description: Shared Supabase choice and safety constraints for the retained Replit sources.
---

Development and production should use one shared Supabase database, as the user selected. Keep the old Replit databases intact for recovery; do not silently fall back to them when Supabase configuration is missing.

**Why:** The user selected a shared database and authorized the migration. Production access was subsequently restored; its public schema contained only the global scan-budget record, not shop tables. Mixing database targets would create divergent data.

**How to apply:** Use the securely configured Supabase connection in both app environments, retaining Replit DATABASE_URL only for tests. Preserve newer scan-budget periods and never reduce same-period usage when retrying imports. App Storage files remain in Replit; moving their database metadata does not move the bytes.
