import type { PoolClient } from "pg";
import { canonical, columns, snapshot, tables, validateSnapshot, type Data, type Snapshot } from "./model";

// Only public for real recovery; pg_temp is reserved for isolated test fixtures.
type Schema = "public" | "pg_temp";
function relation(schema: Schema, table: string): string {
  if (!tables.includes(table as typeof tables[number])) throw new Error("Unknown table.");
  return `"${schema}"."${table}"`;
}
export async function readSnapshot(client: PoolClient, schema: Schema = "public"): Promise<Snapshot> {
  if (schema === "public") {
    const result = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
       AND table_type = 'BASE TABLE' AND (left(table_name, 6) = 'buyme_' OR table_name = 'scan_budget')`);
    if (canonical(result.rows.map((r) => r.table_name).sort()) !== canonical([...tables].sort())) {
      throw new Error("Recovery table inventory differs from database; update the tool before proceeding.");
    }
  }
  const data = {} as Data;
  for (const table of tables) {
    const metadata = await client.query<{ name: string }>(
      `SELECT attname AS name FROM pg_attribute
       WHERE attrelid = $1::regclass AND attnum > 0 AND NOT attisdropped`, [relation(schema, table)]);
    if (canonical(metadata.rows.map((r) => r.name).sort()) !== canonical([...columns[table]].sort())) {
      throw new Error(`Recovery columns differ from database: ${table}`);
    }
    const result = await client.query(`SELECT row_to_json(t) AS row FROM ${relation(schema, table)} t`);
    data[table] = result.rows.map((r) => r.row);
  }
  return snapshot(data);
}
export async function capture(client: PoolClient): Promise<Snapshot> {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    const result = await readSnapshot(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

/** Caller owns transaction; locks remain held through verification and commit. */
export async function applySnapshot(
  client: PoolClient, expected: Snapshot, desired: Snapshot, schema: Schema = "public",
): Promise<void> {
  validateSnapshot(expected);
  validateSnapshot(desired);
  await client.query("SET LOCAL TIME ZONE 'UTC'");
  await client.query(`LOCK TABLE ${tables.map((t) => relation(schema, t)).join(", ")} IN ACCESS EXCLUSIVE MODE`);
  const current = await readSnapshot(client, schema);
  // Safe replay of an already committed recovery.
  if (current.digest === desired.digest) return;
  if (current.digest !== expected.digest) throw new Error("Target changed after capture. Capture again and regenerate the plan.");
  // Delete only changed children first (handles swaps of unique membership keys).
  for (const table of ["buyme_memberships", "buyme_images", "scan_budget"] as const) {
    for (const row of current.data[table]) {
      const next = desired.data[table].find((r) => r.id === row.id);
      if (canonical(row) !== canonical(next)) {
        await client.query(`DELETE FROM ${relation(schema, table)} WHERE id = $1`, [row.id]);
      }
    }
  }
  // Remove parents only after dependents. Desired data has already passed FK validation.
  for (const row of current.data.buyme_shops) {
    if (!desired.data.buyme_shops.some((r) => r.id === row.id)) {
      await client.query(`DELETE FROM ${relation(schema, "buyme_shops")} WHERE id = $1`, [row.id]);
    }
  }
  for (const table of tables) {
    for (const row of desired.data[table]) {
      const old = current.data[table].find((r) => r.id === row.id);
      if (canonical(old) === canonical(row)) continue;
      const names = columns[table];
      const params = names.map((name) => {
        // node-postgres treats JS arrays as PG arrays, not JSONB.
        return ["catalog", "sales", "settings"].includes(name) ? JSON.stringify(row[name]) : row[name];
      });
      const placeholders = names.map((_, i) => `$${i + 1}`).join(", ");
      const quoted = names.map((name) => `"${name}"`).join(", ");
      const update = names.filter((n) => n !== "id").map((n) => `"${n}" = EXCLUDED."${n}"`).join(", ");
      await client.query(`INSERT INTO ${relation(schema, table)} (${quoted}) VALUES (${placeholders})
        ON CONFLICT (id) DO UPDATE SET ${update}`, params);
    }
  }
  if ((await readSnapshot(client, schema)).digest !== desired.digest) {
    throw new Error("Read-back verification failed; transaction must roll back.");
  }
}
