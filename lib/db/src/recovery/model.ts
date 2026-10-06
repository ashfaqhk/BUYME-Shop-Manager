import { createHash } from "node:crypto";

// Explicit inventory: fail closed if the database adds columns or BUYME tables.
export const columns = {
  buyme_shops: ["id", "name", "owner_user_id", "premium_approved", "catalog", "sales", "settings", "revision", "created_at", "updated_at"],
  buyme_memberships: ["id", "shop_id", "user_id", "email", "role", "created_at"],
  buyme_images: ["id", "shop_id", "object_path", "content_type", "byte_length", "created_at"],
  scan_budget: ["id", "day", "month", "daily_count", "monthly_count"],
} as const;
export type Table = keyof typeof columns;
export const tables = Object.keys(columns) as Table[];
export type Row = Record<string, unknown> & { id: string | number };
export type Data = Record<Table, Row[]>;
export type Snapshot = { version: 1; capturedAt: string; data: Data; digest: string };
export type Conflict = { key: string; table: Table; source: Row | null; target: Row | null };
export type Plan = {
  version: 1; source: Snapshot; target: Snapshot;
  conflicts: Conflict[]; digest: string;
};
export type Decision = {
  choice: "source" | "target" | "merged";
  reason: string;
  row?: Row;
};
export type Decisions = Record<string, Decision>;

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
export function hash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
function normalized(data: Data): Data {
  return Object.fromEntries(tables.map((table) =>
    [table, [...data[table]].sort((a, b) => String(a.id).localeCompare(String(b.id)))])) as Data;
}
export function snapshot(data: Data): Snapshot {
  validateData(data);
  const sorted = normalized(data);
  return { version: 1, capturedAt: new Date().toISOString(), data: sorted, digest: hash(sorted) };
}
export function validateData(data: Data): void {
  if (!data || canonical(Object.keys(data).sort()) !== canonical([...tables].sort())) {
    throw new Error("Snapshot must contain exactly every recovery table.");
  }
  for (const table of tables) {
    if (!Array.isArray(data[table])) throw new Error(`Invalid table: ${table}`);
    const ids = new Set<string>();
    for (const row of data[table]) {
      if (!row || canonical(Object.keys(row).sort()) !== canonical([...columns[table]].sort())) {
        throw new Error(`Column mismatch: ${table}`);
      }
      if (table === "scan_budget" ? !Number.isSafeInteger(row.id) : typeof row.id !== "string" || !row.id) {
        throw new Error(`Invalid ID: ${table}`);
      }
      if (ids.has(String(row.id))) throw new Error(`Duplicate ID: ${table}`);
      ids.add(String(row.id));
      if (Object.values(row).some((v) => v === null || v === undefined)) throw new Error(`Null value: ${table}`);
      if (table === "scan_budget") {
        if (typeof row.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.day) ||
          typeof row.month !== "string" || !/^\d{4}-\d{2}$/.test(row.month) ||
          !Number.isSafeInteger(row.daily_count) || Number(row.daily_count) < 0 ||
          !Number.isSafeInteger(row.monthly_count) || Number(row.monthly_count) < 0) {
          throw new Error("Invalid scan periods or counts.");
        }
      }
    }
  }
  const shopIds = new Set(data.buyme_shops.map((r) => r.id));
  const memberships = new Set<string>();
  for (const table of ["buyme_memberships", "buyme_images"] as const) {
    for (const row of data[table]) {
      if (!shopIds.has(row.shop_id as string)) throw new Error(`Orphan row: ${table}`);
      if (table === "buyme_memberships") {
        const key = canonical([row.user_id, row.shop_id]);
        if (memberships.has(key)) throw new Error("Conflicting membership uniqueness; resolve both records explicitly.");
        memberships.add(key);
      }
    }
  }
}
export function validateSnapshot(value: Snapshot): void {
  if (value.version !== 1) throw new Error("Unsupported snapshot version.");
  validateData(value.data);
  if (value.digest !== hash(normalized(value.data))) throw new Error("Snapshot checksum mismatch.");
}
export function makePlan(source: Snapshot, target: Snapshot): Plan {
  validateSnapshot(source);
  validateSnapshot(target);
  const conflicts: Conflict[] = [];
  for (const table of tables) {
    const left = new Map(source.data[table].map((r) => [String(r.id), r]));
    const right = new Map(target.data[table].map((r) => [String(r.id), r]));
    for (const id of [...new Set([...left.keys(), ...right.keys()])].sort()) {
      const s = left.get(id) ?? null;
      const t = right.get(id) ?? null;
      if (canonical(s) === canonical(t)) continue;
      // Source-only rows also need a decision: without a cutover baseline they
      // might have been deliberately deleted on the rollback target.
      conflicts.push({ key: `${table}:${id}`, table, source: s, target: t });
    }
  }
  const body = { version: 1 as const, source, target, conflicts };
  return { ...body, digest: hash(body) };
}
export function validatePlan(plan: Plan): void {
  const rebuilt = makePlan(plan.source, plan.target);
  if (plan.version !== 1 || canonical(plan) !== canonical(rebuilt)) throw new Error("Plan mismatch; regenerate from snapshots.");
}
export function reconcile(plan: Plan, decisions: Decisions): Snapshot {
  validatePlan(plan);
  if (canonical(Object.keys(decisions).sort()) !== canonical(plan.conflicts.map((c) => c.key).sort())) {
    throw new Error("Every conflict needs exactly one explicit decision.");
  }
  const data: Data = structuredClone(plan.target.data);
  for (const conflict of plan.conflicts) {
    const decision = decisions[conflict.key];
    if (!decision || typeof decision.reason !== "string" || !decision.reason.trim()) {
      throw new Error(`Decision reason required: ${conflict.key}`);
    }
    let row: Row | null;
    if (decision.choice === "source") row = conflict.source;
    else if (decision.choice === "target") row = conflict.target;
    else if (decision.choice === "merged" && decision.row) row = decision.row;
    else throw new Error(`Invalid decision: ${conflict.key}`);
    const original = conflict.source ?? conflict.target!;
    if (row && row.id !== original.id) throw new Error(`Cannot change record ID: ${conflict.key}`);
    data[conflict.table] = data[conflict.table].filter((r) => r.id !== original.id);
    if (row) data[conflict.table].push(structuredClone(row));
  }
  // Invalidate all cached shop revisions, including retained target versions.
  // An old browser must reload instead of replacing reconciled bills/catalog.
  for (const row of data.buyme_shops) {
    const revisions = [row, ...plan.source.data.buyme_shops, ...plan.target.data.buyme_shops]
      .filter((r) => r.id === row.id).map((r) => Number(r.revision));
    const revision = Math.max(...revisions);
    if (!Number.isSafeInteger(revision) || revision < 1 || revision >= 2147483647) {
      throw new Error("Invalid or exhausted shop revision.");
    }
    row.revision = revision + 1;
  }
  // Never restore an earlier scan period or reduce usage within either period.
  for (const previous of [...plan.source.data.scan_budget, ...plan.target.data.scan_budget]) {
    const row = data.scan_budget.find((r) => r.id === previous.id);
    if (!row) throw new Error("Scan usage may not be deleted during recovery.");
    for (const [period, count] of [["day", "daily_count"], ["month", "monthly_count"]] as const) {
      if (typeof row[period] !== "string" || typeof previous[period] !== "string" ||
        !Number.isSafeInteger(row[count]) || Number(row[count]) < 0 ||
        row[period] < previous[period] ||
        (row[period] === previous[period] && Number(row[count]) < Number(previous[count]))) {
        throw new Error("Recovery may not reset scan usage; merge the newest periods and highest same-period counts.");
      }
    }
  }
  return snapshot(data);
}
