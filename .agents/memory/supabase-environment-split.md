---
name: Supabase environment split
description: Development has moved to Supabase while production remains on Replit PostgreSQL.
---

Use Supabase for development only until the Replit production database is accessible and its records have been copied and validated. Keep production routed to Replit meanwhile.

**Why:** Replit's account restriction prevented reading the production database, so switching production would expose only the development dataset.

**How to apply:** Preserve the `NODE_ENV=production` Replit `DATABASE_URL` branch. Migrate and verify production data before changing production to Supabase.
