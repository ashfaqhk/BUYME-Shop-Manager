import { readFile } from "node:fs/promises";

// No credentials are accepted. Each URL is the instance's API base (ending /api).
// The operator must obtain a complete inventory from their runtime, not infer it
// from samples at a load balancer. A success covers only that supplied inventory.
export async function verifyMaintenance(inventory, request = fetch) {
  if (!Array.isArray(inventory) || inventory.length === 0) {
    throw new Error("Provide every running API instance in the inventory.");
  }
  const seen = new Set();
  for (const entry of inventory) {
    const url = new URL(entry.apiBaseUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
        url.search || url.hash || !entry.instanceId || seen.has(entry.instanceId)) {
      throw new Error("Inventory requires unique boot IDs and credential-free API URLs.");
    }
    seen.add(entry.instanceId);
    const base = url.href.replace(/\/$/, "");
    const options = { redirect: "error", signal: AbortSignal.timeout(10_000), cache: "no-store" };
    const status = await request(`${base}/maintenance`, options);
    const state = await status.json();
    if (!status.ok || state.instanceId !== entry.instanceId || state.maintenance !== true ||
        state.databaseReadOnly !== true || state.verified !== true) {
      throw new Error("An inventoried instance is missing, changed, writable or unverified. Stop recovery.");
    }
    // No authentication or user data: these requests must be rejected by the
    // freeze before validation/authentication/storage/AI work can start.
    for (const [method, path] of [
      ["PUT", "/shop"], ["POST", "/shop/upgrade-request"],
      ["PATCH", "/shop/sellers/maintenance-probe"], ["POST", "/shop/invitations"],
      ["POST", "/shop/images"], ["POST", "/shop/images/upload-url"],
      ["POST", "/catalog/scan-product"], ["POST", "/billing/extract-list"],
    ]) {
      const response = await request(`${base}${path}`, {
        ...options, signal: AbortSignal.timeout(10_000), method,
        headers: { "Content-Type": "application/json" }, body: "{}",
      });
      const error = await response.json();
      if (response.status !== 503 || response.headers.get("Retry-After") !== "60" ||
          error.code !== "BUYME_MAINTENANCE") {
        throw new Error("A write probe was not frozen. Stop recovery.");
      }
    }
  }
  return seen.size;
}

if (process.argv[1]?.endsWith("verify-maintenance.mjs")) {
  try {
    const inventory = JSON.parse(await readFile(process.argv[2], "utf8"));
    const count = await verifyMaintenance(inventory);
    console.log(`Verified ${count} inventoried API instances. Confirm inventory completeness and old-writer drain before recovery.`);
  } catch {
    // Do not echo URLs, private inventory files or network errors.
    console.error("Maintenance verification failed. Check the complete instance inventory, read-only connections and write probes; do not begin recovery.");
    process.exitCode = 1;
  }
}
