---
name: Orval schema naming
description: Avoiding duplicate TypeScript exports when regenerating the OpenAPI client and Zod schemas
---

Use descriptive component-schema names that differ from the operation-derived Zod schema export names (for example, a document payload name instead of the operation's `Body` name). Define request bodies as named component schemas rather than anonymous inline objects, which can generate the same conflicting `Body` identifier.

**Why:** The generator re-exports generated TypeScript interfaces and generated Zod values from the same package index. When both use the same identifier, type checking fails with an ambiguous re-export. Editing the package index only helps until the next code-generation run.

**How to apply:** Before adding an OpenAPI operation, keep component names distinct from its generated operation body/response names. Run the normal code-generation script and confirm library type checking succeeds without post-generation index edits.