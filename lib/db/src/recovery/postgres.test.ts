import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { applySnapshot, readSnapshot } from "./postgres";
import { makePlan, reconcile, snapshot } from "./model";
import { chooseSource, scenario } from "./fixtures.test-helper";

test("isolated PostgreSQL rehearsal: atomic writes, stale guard, read-back, idempotence and rollback", async () => {
  // Only local/dev Replit credentials, never Supabase. All writes are session
  // temporary tables; no persistent schema or shop row is touched.
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for the safe PostgreSQL rehearsal.");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    await client.query(`
      CREATE TEMP TABLE buyme_shops (
        id text PRIMARY KEY, name text NOT NULL, owner_user_id text NOT NULL,
        premium_approved boolean NOT NULL, catalog jsonb NOT NULL, sales jsonb NOT NULL,
        settings jsonb NOT NULL, revision integer NOT NULL CHECK (revision > 0),
        created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL);
      CREATE TEMP TABLE buyme_memberships (
        id text PRIMARY KEY, shop_id text NOT NULL REFERENCES pg_temp.buyme_shops(id) ON DELETE CASCADE,
        user_id text NOT NULL, email text NOT NULL, role text NOT NULL, created_at timestamptz NOT NULL,
        UNIQUE (user_id, shop_id));
      CREATE TEMP TABLE buyme_images (
        id text PRIMARY KEY, shop_id text NOT NULL REFERENCES pg_temp.buyme_shops(id) ON DELETE CASCADE,
        object_path text NOT NULL, content_type text NOT NULL, byte_length integer NOT NULL CHECK (byte_length >= 0),
        created_at timestamptz NOT NULL);
      CREATE TEMP TABLE scan_budget (
        id integer PRIMARY KEY, day text NOT NULL, month text NOT NULL,
        daily_count integer NOT NULL, monthly_count integer NOT NULL);
    `);
    const empty = await readSnapshot(client, "pg_temp");
    const { source, target } = scenario();
    await applySnapshot(client, empty, target, "pg_temp");
    const actualTarget = await readSnapshot(client, "pg_temp");
    assert.equal(actualTarget.digest, target.digest);
    const plan = makePlan(source, actualTarget);
    const desired = reconcile(plan, chooseSource(plan));
    await applySnapshot(client, actualTarget, desired, "pg_temp");
    assert.equal((await readSnapshot(client, "pg_temp")).digest, desired.digest);
    await applySnapshot(client, actualTarget, desired, "pg_temp");
    assert.equal((await readSnapshot(client, "pg_temp")).digest, desired.digest);

    await client.query("SAVEPOINT stale");
    await client.query("UPDATE pg_temp.buyme_shops SET name = 'Concurrent fixture change' WHERE id = 'shop-a'");
    await assert.rejects(() => applySnapshot(client, actualTarget, desired, "pg_temp"), /Target changed/);
    await client.query("ROLLBACK TO SAVEPOINT stale");
    assert.equal((await readSnapshot(client, "pg_temp")).digest, desired.digest);

    // Fail after a valid parent update and verify PostgreSQL rolls it all back.
    const invalid = structuredClone(desired);
    invalid.data.buyme_shops[0].name = "Should not survive rollback";
    invalid.data.buyme_images[0].byte_length = -1;
    await client.query("SAVEPOINT failure");
    await assert.rejects(() => applySnapshot(client, desired, snapshot(invalid.data), "pg_temp"));
    await client.query("ROLLBACK TO SAVEPOINT failure");
    assert.equal((await readSnapshot(client, "pg_temp")).digest, desired.digest);
    await client.query("ROLLBACK"); // Also discards all fixture tables.
  } finally {
    client.release();
    await pool.end();
  }
});
