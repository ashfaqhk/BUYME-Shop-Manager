---
name: AI scan spending protection
description: Why billable scan protection uses a shared, durable budget instead of an owner identity gate
---

Billable AI scan attempts should share a persistent, fail-closed budget across billing and catalog rather than relying on IP-specific or process-local controls. Count attempts before contacting the provider, even when a request later fails.

**Why:** BUYME's billing and catalog data live locally in the browser, and there is no verified owner identity to authorize on the server. A browser-supplied owner flag would not protect credits. A durable global budget bounds spending without blocking manual operations or requiring an owner login immediately.

**How to apply:** New billable AI endpoints must join the same budget. If verified owner authentication is introduced later, revisit whether the global cap should remain as a backstop and how legitimate owners regain access when outsiders use the allowance.