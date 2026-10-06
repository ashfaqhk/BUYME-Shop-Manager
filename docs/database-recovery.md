# Recover BUYME to the retained Replit PostgreSQL database

This is an **operator-run, data-first recovery**, not a code/checkpoint rollback.
Restoring old code or pointing the app at the old database first can lose every
Supabase change made since cutover. Do not resume traffic until the final gates pass.
The recovery tool never changes database routing or performs schema migrations.

## Coverage and prerequisites

All current server-persisted application data is covered:

- `buyme_shops`: complete catalogs, stock, sales/bills, settings/payment references,
  names, owner IDs, premium flags, timestamps and revisions.
- `buyme_memberships`: owners/staff, email and roles.
- `buyme_images`: object-storage metadata and paths.
- `scan_budget`: daily/monthly usage.

Replit App Storage still holds the image bytes; preserve its bucket, permissions and
configuration. Clerk users and invitation metadata are external, not in these tables;
preserve the Clerk tenant and configuration. Browser-only/offline edits are not yet
server records: ask shopkeepers to stop editing and sync their pending changes to
Supabase **before** the freeze. Do not clear browser storage.

There is no trustworthy row-level cutover baseline. Timestamps and shop revisions
cannot establish which side is authoritative (premium changes may not update the
timestamp). Consequently **every different or missing record requires a decision**,
including apparently new records. Missing source rows may be deletions; missing target
rows may be target-side deletions. Nothing is selected merely because it is newer.

The intended Replit target must already have all four tables and the current columns,
constraints, primary keys, membership uniqueness, and child foreign keys. Capture
refuses missing/extra BUYME tables or columns, even when tables are empty. If the
retained production source predates shop tables, do not invent a direct production
DDL script. Under maintenance, use the supported development-schema/Publish flow
for Replit-managed schema changes and retain a database backup first. Never use
Publish's overwrite-production-data option for this recovery. Schema readiness is
an explicit prerequisite, not something `apply` fixes.

## 1. Identify targets and freeze all writers

1. Obtain approval for the recovery and expected downtime.
2. Confirm the **actual Replit production** database intended for rollback. The
   workspace `DATABASE_URL` is development and is **not** an automatic substitute.
3. Configure `BUYME_RECOVERY_TARGET_URL` through secure secret configuration with
   that target's connection string. Do not put URLs/passwords in shell arguments,
   logs, Git, documentation, or chat. `SUPABASE_DATABASE_URL` remains the source.
   Run from an authorized environment able to reach both databases; if the retained
   production target is unreachable, stop rather than use another database.
4. Stop production, development previews, background jobs, manual integrations and
   any other writers to **both** databases. Development and production currently
   share Supabase, so stopping only production is insufficient. Drain in-flight
   requests/connections and keep maintenance in effect through routing verification.
   Restrict direct database writers too. A CLI confirmation is not a maintenance switch.
5. Retain a separately secured full database backup of both databases. The tool
   also saves application snapshots and an extra before-apply target snapshot.

Nothing in this task deploys, pauses services, sets credentials or changes live data.

## 2. Capture consistent read-only snapshots and make a plan

Run from the repository root:

```sh
mkdir -m 700 recovery-private
pnpm --filter @workspace/scripts recovery capture source recovery-private/source.json
pnpm --filter @workspace/scripts recovery capture target recovery-private/target.json
pnpm --filter @workspace/scripts recovery plan \
  recovery-private/source.json recovery-private/target.json recovery-private/plan.json
```

Each capture uses a read-only, repeatable-read transaction in UTC. Files are
owner-readable/writable only, never overwritten, and contain no connection strings.
They **do** contain private shop/customer data. This directory is Git-ignored; keep
encrypted copies outside the workspace with access restricted to recovery operators.
Keep backups and plans under your normal data-retention policy, not in the asset Library.

`plan.json` retains complete source and target snapshots, hashes, and every conflict.
Identical records are retained without decisions. No database write has occurred.
File hashes detect accidental changes, not a malicious operator; access control and
independent approval remain necessary.

## 3. Resolve conflicts explicitly

Create `recovery-private/decisions.json` as a JSON object keyed by each conflict's
`key`. Each needs a non-empty review reason and exactly one choice:

```json
{
  "buyme_shops:example-shop-id": {
    "choice": "source",
    "reason": "Owner confirmed production inventory and all bills."
  },
  "buyme_images:example-image-id": {
    "choice": "target",
    "reason": "Keep the archived target reference; its object still exists."
  },
  "scan_budget:1": {
    "choice": "merged",
    "reason": "Keep latest periods and highest usage for those periods.",
    "row": {
      "id": 1,
      "day": "2026-10-06",
      "month": "2026-10",
      "daily_count": 4,
      "monthly_count": 18
    }
  }
}
```

These are illustrative IDs, not an auto-approval template. All actual conflicts
must be included, with no extra keys. Protect the decisions file with `chmod 600`.

- `source` selects the full Supabase row; `target` keeps the full Replit row.
- If the selected side is `null`, that is an **explicit deletion**. Review dependent
  memberships/images too; orphaned records are refused.
- `merged` requires a complete `row` with the same primary key and exact columns.
  Merge conflicting catalogs, bills and settings deliberately. Preserve every
  legitimate bill using its existing ID; do not blindly concatenate arrays,
  double-count bills, sum stock, or fabricate changes. Review item-level differences
  with the shop owner. Both original branches remain in the plan regardless of choice.
- Different membership IDs can share `(user_id, shop_id)`. Select one explicitly
  and delete the duplicate using its missing-side decision; uniqueness conflicts
  are refused, not silently skipped.
- Scan usage cannot be deleted, moved to an earlier day/month, or reduced within
  the same period. Merge the latest day/month and maximum observed counts for those
  respective periods. Newer periods may legitimately have lower counts.
- Every surviving shop gets a revision greater than **both** originals. Existing
  browser sessions must reload instead of overwriting reconciled data with stale
  catalogs/bills. Recovery does not change primary IDs or object paths.

An operator and a second reviewer should approve the final decisions and all
discarded/deleted branches before proceeding.

```sh
pnpm --filter @workspace/scripts recovery prepare \
  recovery-private/plan.json recovery-private/decisions.json recovery-private/bundle
```

The new bundle directory contains the originals, decisions, and `desired.json`.
Review `desired.json` in full (counts and actual records, not only totals).
The command refuses incomplete decisions, orphan references, duplicate memberships,
scan usage reductions, and invalid revisions. If it fails, correct the decisions and
prepare a **new** directory. Failed/partial bundles never modify either database.

## 4. Apply and verify while still in maintenance

```sh
pnpm --filter @workspace/scripts recovery apply \
  recovery-private/bundle --confirm-writers-stopped
pnpm --filter @workspace/scripts recovery verify recovery-private/bundle
```

Before writing, `apply` checks the source still matches its capture and stores another
target backup. It locks all target application tables, checks that target data still
matches the plan, applies changes in a single transaction, and hashes every field of
the read-back result **before commit**. Changed child rows are replaced to support
membership-key swaps; unchanged children remain intact. Parent updates preserve IDs.
Database constraints remain active. Failed application/read-back rolls back the
entire transaction, not just the last record.

If source or target changed, stop, capture both again into new files, regenerate
the plan and re-review decisions. Do not edit hashes to bypass the guard.
The source check assumes writers really remain stopped; it is not a cross-database
atomic lock. Never resume source writes between capture, apply and routing.

Retrying the exact same bundle after a successful commit is safe: an already matching
target is recognized without modifying records or incrementing revisions again.
If a network interruption makes commit status uncertain, run `verify` first.
Verification failure means **do not switch traffic**. Capture the target into a new
file and investigate. CLI failure output identifies the failed stage and deliberately
withholds raw database errors to avoid disclosing secrets/private row values.

## 5. Only then route production back

1. Require a successful full `verify`, retained originals/decisions, and reviewer
   approval. Keep maintenance active.
2. This build's application still reads `SUPABASE_DATABASE_URL` outside tests.
   Merely changing `DATABASE_URL` or setting `BUYME_RECOVERY_TARGET_URL` **does not**
   reroute it. Through the secure production configuration workflow, point the
   app's active connection setting to the **verified Replit production target**,
   or publish an approved recovery build with an explicit database selector.
   Preserve the Supabase source connection securely for subsequent reconciliation.
   Do not set `NODE_ENV=test` in production to force routing.
3. Publish/restart only with explicit operator approval. Confirm the effective
   connection targets the recovered database before enabling public writes.
   Do not overwrite recovered rows with development data during Publish.
4. In maintenance, sign in as a shop owner and staff member, verify catalog/stock,
   bill history, settings, premium mode and image loading, and check scan usage.
   Reload old browser sessions; a stale save should return the existing revision
   conflict rather than replace recovered data. Check company-admin access too.
5. Reopen traffic only after those checks pass. Keep development writers stopped
   until their intended database is also explicitly configured.
6. Keep the Supabase data unchanged until recovery is accepted and backups meet
   retention policy. If new writes occur after reopening, another reversal requires
   another reconciliation; never restore the old snapshot over newer writes.

## Safe rehearsal and validation

```sh
pnpm --filter @workspace/scripts test:recovery
pnpm run typecheck:libs
```

The PostgreSQL rehearsal requires the workspace development `DATABASE_URL`.
It never uses Supabase or the recovery target secret. It creates **session-temporary**
fixture tables, exercises the same reconciliation/apply code, and rolls back
everything before disconnecting. No persistent schema/data is changed.

Tests cover new shops/members/images, changed stock/bills/settings/premium, explicit
branch merging/deletion, uniqueness and orphan conflicts, immutable originals,
checksums/schema drift, revision invalidation, scan-period protections, real SQL
read-back equality, stale-target refusal, safe replay, and transaction rollback
after a constraint failure. A production recovery still requires the operator
freeze, correct target selection, approvals and routing checks above.
