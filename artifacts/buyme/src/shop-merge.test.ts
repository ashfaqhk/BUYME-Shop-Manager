import assert from "node:assert/strict";
import test from "node:test";
import { mergeSnapshots, sameData } from "./shop-merge";
import type { Snapshot } from "./shop-types";

const empty = (): Snapshot => ({ catalog: [], sales: [], settings: { shopName: "Test" } });
test("JSON object key order does not cause false conflicts", () => {
  assert.equal(sameData({ a: 1, b: { c: 2 } }, { b: { c: 2 }, a: 1 }), true);
});
test("independent settings edits survive", () => {
  const base = empty();
  const result = mergeSnapshots(base, { ...base, settings: { ...base.settings, phone: "123" } },
    { ...base, settings: { ...base.settings, darkMode: true } });
  assert.equal(result.conflicts.length, 0);
  assert.deepEqual(result.snapshot.settings, { shopName: "Test", phone: "123", darkMode: true });
});
test("concurrent new sales are both kept and not duplicated on retries", () => {
  const base = empty();
  const device = { ...base, sales: [{ id: "local", paid: 10 }] };
  const cloud = { ...base, sales: [{ id: "remote", paid: 20 }] };
  const result = mergeSnapshots(base, device, cloud);
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.snapshot.sales.length, 2);
  assert.equal(mergeSnapshots(base, result.snapshot, cloud).snapshot.sales.length, 2);
});
test("conflicting values require a choice but independent edits remain", () => {
  const base = empty();
  const device = { ...base, settings: { shopName: "Device", phone: "123" } };
  const cloud = { ...base, settings: { shopName: "Cloud", darkMode: true } };
  assert.deepEqual(mergeSnapshots(base, device, cloud).conflicts, ["shop.settings.shopName"]);
  assert.deepEqual(mergeSnapshots(base, device, cloud, "cloud").snapshot.settings, { shopName: "Cloud", phone: "123", darkMode: true });
});
test("a cloud deletion cannot silently remove a locally edited product", () => {
  const product = { id: "p", name: "Item", category: "Grocery", updatedAt: "2026-10-01", variants: [] };
  const base = { ...empty(), catalog: [product] };
  const local = { ...base, catalog: [{ ...product, name: "Edited" }] };
  const cloud = empty();
  assert.deepEqual(mergeSnapshots(base, local, cloud).conflicts, ["shop.catalog[p]"]);
  assert.equal(mergeSnapshots(base, local, cloud, "cloud").snapshot.catalog.length, 0);
  assert.equal(mergeSnapshots(base, local, cloud, "device").snapshot.catalog[0].name, "Edited");
});
test("independent credit collections append and derive their combined total", () => {
  const initial = { method: "Cash", amount: 10, createdAt: "2026-10-01T00:00:00Z" };
  const sale = { id: "credit", paid: 10, total: 100, payments: [initial] };
  const base = { ...empty(), sales: [sale] };
  const device = { ...base, sales: [{ ...sale, paid: 30, payments: [initial, { method: "Cash", amount: 20, createdAt: "2026-10-02T00:00:00Z" }] }] };
  const cloud = { ...base, sales: [{ ...sale, paid: 40, payments: [initial, { method: "Cash", amount: 30, createdAt: "2026-10-03T00:00:00Z" }] }] };
  const result = mergeSnapshots(base, device, cloud);
  assert.equal(result.conflicts.length, 0);
  assert.equal((result.snapshot.sales[0] as typeof sale).paid, 60);
  assert.equal((result.snapshot.sales[0] as typeof sale).payments.length, 3);
  assert.equal(sale.paid, 10);
});
test("unrelated saves do not recalculate legacy paid amounts", () => {
  const base = { ...empty(), sales: [{ id: "legacy", paid: 40, payments: [] }] };
  const result = mergeSnapshots(base, { ...base, settings: { ...base.settings, phone: "123" } }, base);
  assert.equal((result.snapshot.sales[0] as { paid: number }).paid, 40);
});
test("unresolved legacy paid edits are not silently ignored", () => {
  const base = { ...empty(), sales: [{ id: "legacy", paid: 10 }] };
  assert.deepEqual(mergeSnapshots(base, { ...base, sales: [{ id: "legacy", paid: 20 }] },
    { ...base, sales: [{ id: "legacy", paid: 30 }] }).conflicts, ["shop.sales[legacy].paid"]);
});
const stockSnapshot = (stock: number, sales: unknown[] = []): Snapshot => ({
  ...empty(), sales, catalog: [{ id: "p", name: "Item", category: "Grocery", updatedAt: "Today", variants: [{ id: "v", name: "Each", price: 15, stock, unit: "pcs" }] }],
});
const stockSale = (id: string, qty: number) => ({ id, lines: [{ productId: "p", variantId: "v", qty }] });
test("concurrent different sales combine stock decrements", () => {
  const result = mergeSnapshots(stockSnapshot(10), stockSnapshot(9, [stockSale("a", 1)]), stockSnapshot(8, [stockSale("b", 2)]));
  assert.equal(result.snapshot.catalog[0].variants[0].stock, 7);
  assert.equal(result.snapshot.sales.length, 2);
  assert.equal(result.conflicts.length, 0);
});
test("equal stock decrements are still combined for distinct sales", () => {
  const result = mergeSnapshots(stockSnapshot(10), stockSnapshot(9, [stockSale("a", 1)]), stockSnapshot(9, [stockSale("b", 1)]));
  assert.equal(result.snapshot.catalog[0].variants[0].stock, 8);
  assert.equal(result.conflicts.length, 0);
});
test("an already uploaded sale is not counted twice when merging stock", () => {
  const result = mergeSnapshots(stockSnapshot(10), stockSnapshot(9, [stockSale("a", 1)]), stockSnapshot(7, [stockSale("a", 1), stockSale("b", 2)]));
  assert.equal(result.snapshot.catalog[0].variants[0].stock, 7);
  assert.equal(result.snapshot.sales.length, 2);
});
test("manual stock edits still require a choice instead of being treated as sales", () => {
  const result = mergeSnapshots(stockSnapshot(10), stockSnapshot(5, [stockSale("a", 1)]), stockSnapshot(8, [stockSale("b", 2)]));
  assert.ok(result.conflicts.includes("shop.catalog[p].variants[v].stock"));
});
