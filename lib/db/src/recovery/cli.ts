import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { capture, applySnapshot } from "./postgres";
import { makePlan, reconcile, validatePlan, validateSnapshot, type Plan, type Decisions, type Snapshot } from "./model";

let stage = "command validation";
async function load<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8"));
}
async function save(path: string, value: unknown): Promise<void> {
  // Sensitive shop data: never overwrite previous evidence, owner-only permissions.
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
}
async function connection(key: "SUPABASE_DATABASE_URL" | "BUYME_RECOVERY_TARGET_URL") {
  const url = process.env[key];
  if (!url) throw new Error(`Configure ${key} securely before this operation.`);
  const pool = new pg.Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 15000 });
  try {
    const client = await pool.connect();
    return { pool, client };
  } catch {
    await pool.end();
    throw new Error(`Cannot connect using ${key}. Check secure configuration and network access.`);
  }
}
async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === "capture" && args.length === 2 && ["source", "target"].includes(args[0])) {
    stage = "read-only capture (check configuration, schema inventory and output path)";
    const { pool, client } = await connection(args[0] === "source" ? "SUPABASE_DATABASE_URL" : "BUYME_RECOVERY_TARGET_URL");
    try {
      await save(args[1], await capture(client));
      console.info("Snapshot saved. No database writes performed.");
    } finally { client.release(); await pool.end(); }
  } else if (command === "plan" && args.length === 3) {
    stage = "plan validation (check snapshot checksums, columns and references)";
    const plan = makePlan(await load<Snapshot>(args[0]), await load<Snapshot>(args[1]));
    await save(args[2], plan);
    console.info(`Plan saved: ${plan.conflicts.length} explicit decisions required.`);
  } else if (command === "prepare" && args.length === 3) {
    stage = "decision validation (resolve every conflict, unique memberships and scan usage)";
    const plan = await load<Plan>(args[0]);
    const decisions = await load<Decisions>(args[1]);
    const desired = reconcile(plan, decisions);
    const dir = resolve(args[2]);
    await mkdir(dir, { mode: 0o700 }); // Existing directory is refused.
    await save(`${dir}/plan.json`, plan);
    await save(`${dir}/decisions.json`, decisions);
    await save(`${dir}/desired.json`, desired);
    console.info("Recovery bundle ready. Review desired.json before applying; keep originals securely.");
  } else if ((command === "apply" || command === "verify") && args.length >= 1) {
    stage = "bundle validation (check checksums and writer-stop confirmation)";
    if (command === "apply" && (args.length !== 2 || args[1] !== "--confirm-writers-stopped")) {
      throw new Error("Apply requires --confirm-writers-stopped after stopping BOTH production and development writers.");
    }
    if (command === "verify" && args.length !== 1) throw new Error("Verify requires one bundle directory.");
    const dir = resolve(args[0]);
    const plan = await load<Plan>(`${dir}/plan.json`);
    validatePlan(plan);
    const expected = reconcile(plan, await load<Decisions>(`${dir}/decisions.json`));
    const saved = await load<Snapshot>(`${dir}/desired.json`);
    validateSnapshot(saved);
    if (expected.digest !== saved.digest) throw new Error("Prepared result differs from decisions.");
    if (command === "apply") {
      if (process.env.BUYME_RECOVERY_TARGET_URL === process.env.SUPABASE_DATABASE_URL) {
        throw new Error("Source and target must be separate databases.");
      }
      stage = "source freshness check (stop all writers and recapture if source changed)";
      const source = await connection("SUPABASE_DATABASE_URL");
      try {
        if ((await capture(source.client)).digest !== plan.source.digest) {
          throw new Error("Source changed after capture; prepare a new bundle.");
        }
      } finally { source.client.release(); await source.pool.end(); }
    }
    stage = "target connection";
    const { pool, client } = await connection("BUYME_RECOVERY_TARGET_URL");
    try {
      if (command === "verify") {
        stage = "full target verification";
        if ((await capture(client)).digest !== expected.digest) throw new Error("Target does not match the reconciled bundle.");
        console.info("Verified every recovered record and field.");
        return;
      }
      // Backup exists durably before the transaction modifies any target data.
      // A unique file allows safe retry without replacing previous evidence.
      await save(`${dir}/before-apply-${Date.now()}.json`, await capture(client));
      stage = "transactional apply (check target freshness, constraints, permissions and lock availability)";
      await client.query("BEGIN");
      try {
        await client.query("SET LOCAL lock_timeout = '10s'");
        await client.query("SET LOCAL statement_timeout = '120s'");
        await applySnapshot(client, plan.target, expected);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
      console.info("Recovery committed and read-back verified. Run verify before routing traffic.");
    } finally { client.release(); await pool.end(); }
  } else {
    throw new Error("Usage: recovery capture source|target FILE | plan SOURCE TARGET PLAN | prepare PLAN DECISIONS NEW_BUNDLE_DIR | apply BUNDLE_DIR --confirm-writers-stopped | verify BUNDLE_DIR");
  }
}
main().catch(() => {
  // Never print raw pg errors: they can contain connection details or shop data.
  console.error(`Recovery stopped during ${stage}. No routing was changed. A failed apply transaction is rolled back. Raw database errors are withheld to protect credentials and shop data.`);
  process.exitCode = 1;
});
