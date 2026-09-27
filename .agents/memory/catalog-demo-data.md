---
name: Catalog demo data
description: Why saved shop catalogs must remain separate from demo products
---

Treat a saved catalog, including an empty one, as authoritative. Offer additional sample products only to new/demo shops or through explicit opt-in.

**Why:** An earlier gallery migration automatically appended sample products with preset prices and stock to saved catalogs. Inventory reporting then presented those invented quantities as the shopkeeper's own data.

**How to apply:** When evolving catalog defaults or images, hydrate safe metadata on existing records without adding products or stock to persisted catalogs. Be aware that catalogs saved during the old migration may already contain added sample products; do not delete possible user-edited products by guessing their origin.