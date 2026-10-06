import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const dbDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../lib/db",
);
// Keep external dependencies resolvable from the database package itself.
const temporaryDirectory = await mkdtemp(join(dbDirectory, ".routing-tests-"));
after(() => rm(temporaryDirectory, { recursive: true, force: true }));

const entryPoints = [
  { name: "runtime pool", source: "src/index.ts", output: "runtime.cjs" },
  { name: "Drizzle config", source: "drizzle.config.ts", output: "config.cjs" },
];
await Promise.all(
  entryPoints.map(({ source, output }) =>
    build({
      absWorkingDir: dbDirectory,
      entryPoints: [source],
      outfile: join(temporaryDirectory, output),
      bundle: true,
      platform: "node",
      format: "cjs",
      packages: "external",
      logLevel: "silent",
    }),
  ),
);

const supabaseUrl = "postgresql://dummy:dummy@supabase.invalid:5432/app";
const rollbackUrl = "postgresql://dummy:dummy@rollback.invalid:5432/tests";
const cases = [
  {
    name: "production selects Supabase when both URLs exist",
    env: { NODE_ENV: "production", SUPABASE_DATABASE_URL: supabaseUrl, DATABASE_URL: rollbackUrl },
    expected: supabaseUrl,
  },
  {
    name: "production works with only Supabase configured",
    env: { NODE_ENV: "production", SUPABASE_DATABASE_URL: supabaseUrl },
    expected: supabaseUrl,
  },
  {
    name: "production refuses to fall back to the rollback database",
    env: { NODE_ENV: "production", DATABASE_URL: rollbackUrl },
  },
  {
    name: "production rejects an empty Supabase URL even with a rollback URL",
    env: { NODE_ENV: "production", SUPABASE_DATABASE_URL: "", DATABASE_URL: rollbackUrl },
  },
  {
    name: "production fails when neither URL is configured",
    env: { NODE_ENV: "production" },
  },
  {
    name: "tests select DATABASE_URL even when Supabase is configured",
    env: { NODE_ENV: "test", SUPABASE_DATABASE_URL: supabaseUrl, DATABASE_URL: rollbackUrl },
    expected: rollbackUrl,
  },
  {
    name: "tests work with only DATABASE_URL configured",
    env: { NODE_ENV: "test", DATABASE_URL: rollbackUrl },
    expected: rollbackUrl,
  },
  {
    name: "tests never fall back to Supabase",
    env: { NODE_ENV: "test", SUPABASE_DATABASE_URL: supabaseUrl },
  },
  {
    name: "tests reject an empty DATABASE_URL",
    env: { NODE_ENV: "test", DATABASE_URL: "", SUPABASE_DATABASE_URL: supabaseUrl },
  },
  {
    name: "development selects Supabase when both URLs exist",
    env: { NODE_ENV: "development", SUPABASE_DATABASE_URL: supabaseUrl, DATABASE_URL: rollbackUrl },
    expected: supabaseUrl,
  },
  {
    name: "development works with only Supabase configured",
    env: { NODE_ENV: "development", SUPABASE_DATABASE_URL: supabaseUrl },
    expected: supabaseUrl,
  },
  {
    name: "development never silently uses the rollback database",
    env: { NODE_ENV: "development", DATABASE_URL: rollbackUrl },
  },
  {
    name: "an unset NODE_ENV still uses Supabase",
    env: { SUPABASE_DATABASE_URL: supabaseUrl, DATABASE_URL: rollbackUrl },
    expected: supabaseUrl,
  },
  {
    name: "an unset NODE_ENV does not allow a rollback fallback",
    env: { DATABASE_URL: rollbackUrl },
  },
];

for (const entry of entryPoints) {
  for (const scenario of cases) {
    test(`${entry.name}: ${scenario.name}`, () => {
      const script = `
        const module = require(${JSON.stringify(join(temporaryDirectory, entry.output))});
        const url = module.pool
          ? module.pool.options.connectionString
          : module.default.dbCredentials.url;
        process.stdout.write(JSON.stringify(url));
        if (module.pool) module.pool.end();
      `;
      // Each fresh process receives only dummy configuration. Do not inherit
      // workspace secrets or let module caching hide environment changes.
      const result = spawnSync(process.execPath, ["-e", script], {
        env: scenario.env,
        encoding: "utf8",
        timeout: 10_000,
      });
      assert.ifError(result.error);
      assert.equal(result.signal, null);
      if (scenario.expected) {
        assert.equal(result.status, 0, result.stderr);
        assert.equal(JSON.parse(result.stdout), scenario.expected);
      } else {
        assert.notEqual(result.status, 0, "Missing configuration must fail explicitly");
        assert.match(
          result.stderr,
          /Configure SUPABASE_DATABASE_URL for the app, or DATABASE_URL for tests\./,
        );
        assert.equal(result.stdout, "");
      }
    });
  }
}
