---
name: Dependency security backports
description: Handling an upstream advisory with no patched release without hiding audit findings
---
Keep the braces nesting-depth security backport until an upstream release actually fixes deep parser and public AST-walker recursion. Do not remove it merely to clear an audit warning, rename the package/version or suppress the advisory to claim a clean audit.

**Why:** The registry listed no patched release for the stack-exhaustion advisory. A local source fix prevents the attack, but version-based npm audits still flag the original release number.

**How to apply:** Review upstream fixes and run nested-input, independently constructed AST and cycle regressions when updating this dependency. Report any remaining version-based finding transparently.
