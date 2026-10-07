import { test } from "node:test";
import assert from "node:assert/strict";
import { historyStart, historyVisible, mergeHistory, hydrateHistory, canonicalHistory } from "../../lib/api-zod/src/history-policy";
const now = new Date("2026-10-08T10:00:00Z");
const old = { id: "old", createdAt: "2020-01-01", total: 10, paid: 10, paymentMethod: "Cash" };
test("Basic downloads 2 calendar months and Premium 24; month-end dates clamp", () => {
  assert.equal(historyStart(false, now), "2026-08-08T10:00:00.000Z");
  assert.equal(historyStart(true, now), "2024-10-08T10:00:00.000Z");
  assert.equal(historyStart(false, new Date("2026-04-30T00:00:00Z")), "2026-02-28T00:00:00.000Z");
});
test("Older unpaid bills and recent collections remain downloadable", () => {
  const start = historyStart(false, now);
  assert.equal(historyVisible(old, start), false);
  assert.equal(historyVisible({ ...old, paid: 0 }, start), true);
  assert.equal(historyVisible({ ...old, payments: [{ method: "Cash", amount: 10, createdAt: now.toISOString() }] }, start), true);
  assert.equal(historyVisible({ ...old, createdAt: "invalid" }, start), true);
});
test("Limited downloads do not delete cloud or previously saved device history", () => {
  const recent = { ...old, id: "recent", createdAt: now.toISOString() };
  assert.equal(mergeHistory([old], [recent]).length, 2);
  assert.equal(hydrateHistory({ sales: [recent], historyStart: historyStart(false, now) }, { sales: [old] }).sales.length, 2);
  const changed = { ...old, total: 20, paid: 20 };
  assert.deepEqual(mergeHistory([old], [changed]), [changed]);
  assert.equal(canonicalHistory({ b: 2, a: { z: 3 } }), canonicalHistory({ a: { z: 3 }, b: 2 }));
});
