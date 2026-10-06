---
name: Device data and online access
description: BUYME's offline, reporting and company-admin product requirements
---

The user requires shop data in Supabase and locally on the user's device, with automatic syncing when internet returns. Treat image contents as part of that data, not just their database links. Preserve offline edits until cloud acknowledgement; an error or conflict is not permission to discard them.

**Why:** The user explicitly asked that all data be stored in Supabase and locally, and sync when the user's internet is turned on.

**How to apply:** Preserve independent edits from different devices, require a choice for conflicting values, and keep the unchosen device copy recoverable. Never promise cloud saving while only a device copy exists. Clearing browser/app storage can remove unsynced changes.

The company administrator selling BUYME controls existing users' online access by their verified email, including Full approval and pausing access. A seller's interface preference is not approval for Full.

**Why:** The user asked that the application seller can control users' access online from their mail ID.

**How to apply:** Enforce approval and paused access on the server. Offline use must retain the last confirmed access state; admin revocations cannot instantly reach a disconnected device. Re-check access before syncing on reconnection.

Users can download recent day/week/month/year data PDFs from Settings and Insights. These pages are now Premium-only because the user subsequently asked to hide them in Basic. Recent month/year reports use explicitly labelled rolling 30/365-day windows including today; custom dates are also supported. Current stock and current balances must not be presented as historical period-end values.

**Why:** The user requested recent one-day, one-week, one-month and one-year data. Explicit windows avoid ambiguous “month” and “year” coverage.

**How to apply:** Include dated collections for older bills when their payment dates fall inside the report period. A report PDF is not a restorable database backup or an individual checkout invoice.
