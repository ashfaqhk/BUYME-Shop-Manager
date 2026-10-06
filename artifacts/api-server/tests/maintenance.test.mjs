import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { verifyMaintenance } from "../../../scripts/src/verify-maintenance.mjs";

const directory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await mkdtemp(join(directory, ".maintenance-tests-"));
after(() => rm(temporary, { recursive: true, force: true }));
const bundle = join(temporary, "app.cjs");
await build({
  absWorkingDir: directory, entryPoints: ["tests/fixtures/maintenance-app.ts"],
  outfile: bundle, bundle: true, platform: "node", format: "cjs", packages: "external",
  logLevel: "silent",
  plugins: [{
    name: "side-effect-fixtures",
    setup(build) {
      build.onResolve({ filter: /maintenance-db\.ts$/, namespace: "fixtures" }, ({ path }) => ({
        path, namespace: "file",
      }));
      build.onResolve({ filter: /^@workspace\/db$/ }, () => ({
        path: join(directory, "tests/fixtures/maintenance-db.ts"),
      }));
      build.onResolve({ filter: /^@workspace\/api-zod$/ }, () => ({
        path: resolve(directory, "../../lib/api-zod/src/index.ts"),
      }));
      build.onResolve({ filter: /^(drizzle-orm|@clerk\/express)$/ }, ({ path }) => ({
        path, namespace: "fixtures",
      }));
      build.onResolve({ filter: /\/objectStorage$/ }, () => ({
        path: "storage", namespace: "fixtures",
      }));
      build.onLoad({ filter: /.*/, namespace: "fixtures" }, ({ path }) => {
        const prefix = `import { metrics } from ${JSON.stringify(join(directory, "tests/fixtures/maintenance-db.ts"))};`;
        const contents = path === "drizzle-orm"
          ? `export const eq=(left,right)=>({left,right}); export const and=(...conditions)=>({conditions}); export const sql=()=>null;`
          : path === "storage"
            ? `${prefix}
              export class ObjectNotFoundError extends Error {}
              export class ObjectStorageService {
                async createUpload() { metrics.storage++; throw new Error("Unexpected upload"); }
                async getObjectEntityFile() { metrics.storage++; return {}; }
                async downloadObject() { return new Response(new Uint8Array([137,80,78,71])); }
              }`
            : `${prefix}
              export const getAuth=req=>({userId:req.headers["x-test-user"]});
              export const clerkClient={
                users:{async getUser(userId) {
                  metrics.auth++;
                  return {primaryEmailAddressId:"email",emailAddresses:[{id:"email",
                    emailAddress:"owner@example.com",verification:{status:"verified"}}],
                    publicMetadata:userId.startsWith("invited")?{buymeShopId:"shop-1"}:{}};
                }},
                invitations:{async createInvitation() { metrics.invitations++; throw new Error("Unexpected invite"); }}
              };`;
        return { contents, loader: "js" };
      });
    },
  }],
});

function run(source, env = { BUYME_MAINTENANCE_MODE: "true" }) {
  const result = spawnSync(process.execPath, ["-e", `
    const assert = require("node:assert/strict");
    const {app,metrics,reserveScan}=require(${JSON.stringify(bundle)});
    (async()=>{
      const server=app.listen(0,"127.0.0.1");
      await new Promise(resolve=>server.once("listening",resolve));
      const base="http://127.0.0.1:"+server.address().port+"/api";
      try { ${source} } finally { await new Promise(resolve=>server.close(resolve)); }
    })().catch(error=>{console.error(error);process.exitCode=1});
  `], { env, encoding: "utf8", timeout: 20_000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test("all write paths freeze before auth, validation, storage, budget or AI side effects", () => {
  run(`
    for (const [method,path] of [
      ["PUT","/shop"],["POST","/shop/upgrade-request"],
      ["PATCH","/shop/sellers/shop-1"],["POST","/shop/invitations"],
      ["POST","/shop/images"],["POST","/shop/images/upload-url"],
      ["POST","/catalog/scan-product"],["POST","/billing/extract-list"],
      ["DELETE","/future-write-route"]
    ]) {
      const response=await fetch(base+path,{method,headers:{
        "Content-Type":"application/json","x-test-user":"owner",
        "x-maintenance-mode":"false"
      },body:JSON.stringify({BUYME_MAINTENANCE_MODE:false})});
      assert.equal(response.status,503,path);
      assert.equal(response.headers.get("retry-after"),"60");
      assert.equal(response.headers.get("cache-control"),"no-store");
      const error=await response.json();
      assert.equal(error.code,"BUYME_MAINTENANCE");
      assert.match(error.error,/device copy is preserved/);
    }
    assert.deepEqual(metrics,{writes:0,reservations:0,auth:0,storage:0,invitations:0});
    await assert.rejects(reserveScan(),{code:"BUYME_MAINTENANCE"});
    assert.equal(metrics.reservations,0);
  `);
});

test("hidden GET provisioning freezes; existing owner/staff reads and legacy images remain read-only", () => {
  run(`
    for (const user of ["new-user","invited-new"]) {
      for (const method of ["GET","HEAD"]) {
        const response=await fetch(base+"/shop",{method,headers:{"x-test-user":user}});
        assert.equal(response.status,503,user);
        assert.equal(response.headers.get("retry-after"),"60");
      }
    }
    for (const user of ["owner","invited-existing"]) {
      const response=await fetch(base+"/shop",{headers:{"x-test-user":user}});
      assert.equal(response.status,200);
      const shop=await response.json();
      assert.equal(shop.revision,3);
      assert.equal(shop.catalog.length,1);
      assert.equal(shop.sales.length,1);
    }
    const image=await fetch(base+"/shop/images/image-1",{headers:{"x-test-user":"owner"}});
    assert.equal(image.status,200);
    assert.equal((await image.arrayBuffer()).byteLength,4);
    assert.equal(metrics.storage,1);
    assert.equal(metrics.writes,0);
  `);
});

test("different boot instances report independently verified database state", () => {
  const source = `
    const response=await fetch(base+"/maintenance");
    assert.equal(response.status,200);
    assert.equal(response.headers.get("cache-control"),"no-store");
    const state=await response.json();
    assert.equal(state.maintenance,true);
    assert.equal(state.databaseReadOnly,true);
    assert.equal(state.verified,true);
    process.stdout.write(state.instanceId);
  `;
  assert.notEqual(run(source), run(source));
});

test("status refuses a writable database even if the flag says maintenance", () => {
  run(`
    const response=await fetch(base+"/maintenance");
    assert.equal(response.status,503);
    const state=await response.json();
    assert.equal(state.verified,false);
    assert.equal(state.databaseReadOnly,false);
  `, { BUYME_MAINTENANCE_MODE: "true", TEST_DB_READ_ONLY: "off" });
});

test("off mode restores the normal route and reservation behavior", () => {
  run(`
    const response=await fetch(base+"/shop",{method:"PUT",headers:{"Content-Type":"application/json"},body:"{}"});
    assert.equal(response.status,401);
    assert.equal(await reserveScan(),true);
    assert.equal(metrics.reservations,1);
    const state=await (await fetch(base+"/maintenance")).json();
    assert.equal(state.maintenance,false);
    assert.equal(state.verified,false);
  `, { BUYME_MAINTENANCE_MODE: "false", TEST_DB_READ_ONLY: "off" });
});

test("invalid configuration fails startup rather than silently allowing writes", () => {
  for (const flag of ["TRUE", "1", "", "yes"]) {
    const result = spawnSync(process.execPath, ["-e", `require(${JSON.stringify(bundle)})`], {
      env: { BUYME_MAINTENANCE_MODE: flag }, encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /BUYME_MAINTENANCE_MODE must be exactly/);
  }
});

test("operator verifier refuses incomplete/duplicate inventories, changed boots and writable replicas", async () => {
  await assert.rejects(verifyMaintenance([]));
  const entries = [
    { apiBaseUrl: "https://instance1.example/api", instanceId: "boot1" },
    { apiBaseUrl: "https://instance2.example/api", instanceId: "boot2" },
  ];
  const fake = async (url) => url.endsWith("/maintenance")
    ? Response.json({ instanceId: url.includes("instance1") ? "boot1" : "boot2",
        maintenance: true, databaseReadOnly: true, verified: true })
    : Response.json({ code: "BUYME_MAINTENANCE" }, { status: 503, headers: { "Retry-After": "60" } });
  assert.equal(await verifyMaintenance(entries, fake), 2);
  await assert.rejects(verifyMaintenance([entries[0], entries[0]], fake));
  await assert.rejects(verifyMaintenance(entries, async () => Response.json({
    instanceId: "boot1", maintenance: true, databaseReadOnly: false, verified: false,
  })));
  await assert.rejects(verifyMaintenance(entries, async () => Response.json({
    instanceId: "new-boot", maintenance: true, databaseReadOnly: true, verified: true,
  })));
  await assert.rejects(verifyMaintenance(entries, async (url) => url.endsWith("/maintenance")
    ? fake(url) : Response.json({ error: "Not frozen" }, { status: 401 })));
});
