#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm install --frozen-lockfile
pnpm run typecheck:libs
# Development and production share Supabase. Review schema changes explicitly
# rather than pushing to the live database automatically after every merge.
