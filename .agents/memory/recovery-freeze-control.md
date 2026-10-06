---
name: Recovery freeze control
description: Why maintenance control is independent of the database being recovered
---

Keep operator maintenance control independent of the database being recovered.

**Why:** Recovery must remain possible when Supabase is unreachable or being
reconciled. Storing the only maintenance switch there would make freezing depend
on the failing service. Per-process control alone is not evidence that every
writer stopped.

**How to apply:** Any future shared-control replacement must be independently
available and fail closed. Require a complete runtime inventory and proof that
old writers drained; repeated load-balancer samples cannot establish completeness.
