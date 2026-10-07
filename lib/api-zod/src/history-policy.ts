const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
export function historyStart(premium: boolean, now = new Date()) {
  const start = new Date(now);
  const day = start.getUTCDate();
  start.setUTCDate(1);
  start.setUTCMonth(start.getUTCMonth() - (premium ? 24 : 2));
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  start.setUTCDate(Math.min(day, lastDay));
  return start.toISOString();
}
export function historyVisible(value: unknown, start: string) {
  if (!record(value)) return true;
  const created = typeof value.createdAt === "string" ? Date.parse(value.createdAt) : NaN;
  // Invalid legacy dates must not disappear silently.
  if (!Number.isFinite(created) || created >= Date.parse(start)) return true;
  const payments = Array.isArray(value.payments) ? value.payments.filter(record) : null;
  const paid = payments ? payments.reduce((sum, p) =>
    sum + ((p.method === "Cash" || p.method === "UPI") && typeof p.amount === "number" && p.amount > 0 ? p.amount : 0), 0)
    : typeof value.paid === "number" ? value.paid : 0;
  if (typeof value.total === "number" && value.total > paid + 0.005) return true;
  return payments?.some((p) => typeof p.createdAt === "string" && Date.parse(p.createdAt) >= Date.parse(start)) ?? false;
}
export function mergeHistory(existing: unknown[], incoming: unknown[]) {
  const supplied = new Set(incoming.filter(record).map((row) => row.id));
  return [...incoming, ...existing.filter((row) => !record(row) || !supplied.has(row.id))];
}
export function canonicalHistory(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalHistory).join(",")}]`;
  if (record(value)) return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalHistory(value[k])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function hydrateHistory<T extends { sales: unknown[]; historyStart?: string }>(cloud: T, previous: { sales: unknown[] }): T {
  if (!cloud.historyStart) return cloud;
  const archived = previous.sales.filter((row) => !historyVisible(row, cloud.historyStart!));
  return { ...cloud, sales: mergeHistory(archived, cloud.sales) };
}
