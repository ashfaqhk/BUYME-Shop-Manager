---
name: Basic and Full versions
description: Why BUYME uses one set of shop data across its simplified and full interfaces
---

Basic and Full are two views of the same shop, not separate accounts or datasets. Basic's checkout shows the amount due and records a confirmed payment, but must not generate an individual bill, receipt PDF, or in-app QR. Account data-report PDFs from Settings and Insights are allowed in both versions. Keep saved Full-mode data and existing payment profiles when switching.

**Why:** Basic is meant for a tutorial and quick counter use. Separating the data would make a version switch appear to lose work. The user subsequently asked for recent data PDFs from both Settings and Insights, distinct from checkout invoices.

**How to apply:** When adding features to either version, preserve shared sales/catalog history and decide explicitly whether the feature should be shown in Basic. Basic catalog entry should be possible without a product photo; show low stock there. Full retains the complete bill/PDF flow.