# Dependency security fixes

Eight of the nine reported dependency findings are addressed with patched upstream versions: proxy-addr 2.0.8, source-map-js 1.2.2, brace-expansion 5.0.12, uuid 11.1.1, fast-uri 3.1.8 and postcss-selector-parser 7.1.6. Brace-expansion resolves three separate findings.

The remaining braces advisory, GHSA-vfj7-8cjw-p6xm, has **no upstream patched release**. A pnpm source patch bounds parser nesting and validates the public compile, expand and stringify AST walkers iteratively, rejecting deep or cyclic input before recursion. Regression tests cover malicious strings, hand-built ASTs, cycles and ordinary expansion.

`pnpm audit` still reports braces 3.0.3 because it checks release versions rather than the backported source. This finding has not been hidden or renamed. Keep the patch until upstream supplies a verified fix; do not describe the version-based audit as completely clean.
