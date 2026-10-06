import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { scenario, chooseSource } from "./fixtures.test-helper";
import type { Plan } from "./model";

test("CLI creates a private review bundle, refuses overwrite, and rejects tampered results before connecting", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buyme-recovery-"));
  const tsx = resolve("../scripts/node_modules/.bin/tsx");
  // Script commands are launched from the scripts workspace.
  const cli = resolve("../lib/db/src/recovery/cli.ts");
  const run = (...args: string[]) => execFileSync(tsx, [cli, ...args], { encoding: "utf8" });
  try {
    const { source, target } = scenario();
    const sourceFile = join(dir, "source.json");
    const targetFile = join(dir, "target.json");
    const planFile = join(dir, "plan.json");
    const decisionsFile = join(dir, "decisions.json");
    const bundle = join(dir, "bundle");
    await writeFile(sourceFile, JSON.stringify(source), { mode: 0o600 });
    await writeFile(targetFile, JSON.stringify(target), { mode: 0o600 });
    assert.match(run("plan", sourceFile, targetFile, planFile), /decisions required/);
    const plan: Plan = JSON.parse(await readFile(planFile, "utf8"));
    await writeFile(decisionsFile, JSON.stringify(chooseSource(plan)), { mode: 0o600 });
    assert.match(run("prepare", planFile, decisionsFile, bundle), /bundle ready/);
    assert.equal((await stat(planFile)).mode & 0o777, 0o600);
    assert.equal((await stat(bundle)).mode & 0o777, 0o700);
    assert.equal((await stat(join(bundle, "desired.json"))).mode & 0o777, 0o600);
    const duplicate = spawnSync(tsx, [cli, "plan", sourceFile, targetFile, planFile], { encoding: "utf8" });
    assert.equal(duplicate.status, 1);
    assert.deepEqual(JSON.parse(await readFile(planFile, "utf8")), plan);
    const saved = JSON.parse(await readFile(join(bundle, "desired.json"), "utf8"));
    saved.data.buyme_shops[0].name = "Unreviewed edit";
    await writeFile(join(bundle, "desired.json"), JSON.stringify(saved));
    const invalid = spawnSync(tsx, [cli, "verify", bundle], {
      encoding: "utf8", env: { ...process.env, BUYME_RECOVERY_TARGET_URL: "" },
    });
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /bundle validation/);
    assert.doesNotMatch(invalid.stderr, /Unreviewed edit/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
