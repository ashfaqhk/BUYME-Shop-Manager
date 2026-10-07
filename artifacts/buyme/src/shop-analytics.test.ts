import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeMoney, inventoryRows, inventoryAdditions, recordStockAdditions, matchesInventoryStatus, type LedgerSale } from "./shop-analytics";
import type { Product } from "./catalog-data";
const today = "2026-10-08T10:00:00Z";
const sale = (patch: Partial<LedgerSale>): LedgerSale => ({
  id: "s", createdAt: today, total: 100, paid: 0, paymentMethod: "Credit", lines: [], ...patch,
});
test("Revenue ring includes unpaid credit; today's receipts include older collections without double counting billed revenue", () => {
  const stats = summarizeMoney([
    sale({ id: "cash", paid: 100, paymentMethod: "Cash" }),
    sale({ id: "credit", total: 200 }),
    sale({ id: "old", createdAt: "2026-09-01T10:00:00Z", paid: 60, payments: [{ method: "Cash", amount: 60, createdAt: today }] }),
  ], new Date("2026-10-08T00:00:00Z"), new Date("2026-10-09T00:00:00Z"));
  assert.equal(stats.totalBilled, 300);
  assert.equal(stats.cashReceived, 160);
  assert.equal(stats.creditDue, 200);
  assert.equal(stats.billedCash + stats.billedUpi + stats.creditDue, stats.totalBilled);
});
test("UPI, partial collections and legacy records have accurate balances", () => {
  const stats = summarizeMoney([sale({ payments: [{ method: "UPI", amount: 25, createdAt: today }] })],
    new Date("2026-10-08"), new Date("2026-10-09"));
  assert.equal(stats.upiReceived, 25); assert.equal(stats.creditDue, 75);
  assert.equal(stats.totalBilled, 100);
});
const product: Product = { id: "p", name: "Test", category: "Grocery", updatedAt: "Today",
  variants: [{ id: "v", name: "Pack", stock: 2, threshold: 5, price: 10, unit: "pack" }] };
test("Stock suggestions use matching product/type and 30-day quantities, not money or unrelated sales", () => {
  const rows = inventoryRows([product], [sale({ lines: [{ productId: "p", variantId: "v", qty: 30 }] }),
    sale({ id: "older", createdAt: "2026-01-01", lines: [{ productId: "p", variantId: "v", qty: 1000 }] })], new Date(today));
  assert.equal(rows[0].sold30, 30); assert.equal(rows[0].reorder, 12); assert.equal(rows[0].low, true);
});
test("Recent additions record initial stock and increases only; edits retain the true creation date", () => {
  const now = new Date(today);
  const created = recordStockAdditions(undefined, product, "manual", now);
  const changed = recordStockAdditions(created, { ...created, variants: [{ ...created.variants[0], stock: 7 }] }, "manual", now);
  assert.equal(changed.createdAt, created.createdAt);
  assert.deepEqual(inventoryAdditions([changed], now).map((e) => e.qty).sort(), [2, 5]);
  const sold = recordStockAdditions(changed, { ...changed, variants: [{ ...changed.variants[0], stock: 1 }] }, "manual", now);
  assert.equal(sold.stockEvents?.length, 2);
  assert.equal(inventoryRows([{ ...product, variants: [{ ...product.variants[0], stock: undefined }] }], [], now)[0].stock, null);
});
test("Compatible unit changes normalize demand and preserve original arrival units", () => {
  const grams = { ...product, variants: [{ ...product.variants[0], unit: "g", stock: 2000 }] };
  const created = recordStockAdditions(undefined, grams, "manual", new Date(today));
  const kg = recordStockAdditions(created, { ...created, variants: [{ ...created.variants[0], unit: "kg", stock: 2 }] }, "manual", new Date(today));
  assert.equal(kg.stockEvents?.length, 1);
  assert.equal(inventoryAdditions([kg], new Date(today))[0].unit, "g");
  assert.equal(inventoryRows([kg], [sale({ lines: [{ productId: "p", variantId: "v", qty: 500, unit: "g" }] })], new Date(today))[0].sold30, 0.5);
});
test("Low, out-of-stock and unknown filters remain distinct", () => {
  assert.equal(matchesInventoryStatus({ stock: 0, low: true }, "low"), false);
  assert.equal(matchesInventoryStatus({ stock: 0, low: true }, "out"), true);
  assert.equal(matchesInventoryStatus({ stock: 2, low: true }, "low"), true);
  assert.equal(matchesInventoryStatus({ stock: 2, low: true }, "out"), false);
  assert.equal(matchesInventoryStatus({ stock: null, low: false }, "low"), false);
  assert.equal(matchesInventoryStatus({ stock: null, low: false }, "unknown"), true);
});
