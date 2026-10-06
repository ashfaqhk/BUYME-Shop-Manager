import assert from "node:assert/strict";
import test from "node:test";
import { canChooseWorkspace, quickAddQuantity, resolveWorkspaceMode } from "./counter-policy";

test("Basic-only accounts cannot enter Premium regardless of a saved preference", () => {
  for (const preference of ["full", "basic", undefined, "premium"]) {
    assert.equal(resolveWorkspaceMode(false, preference), "basic");
  }
  assert.equal(canChooseWorkspace(false, "full"), false);
  assert.equal(canChooseWorkspace(false, "basic"), true);
});

test("approved accounts can use either view without changing their entitlement", () => {
  assert.equal(resolveWorkspaceMode(true, "basic"), "basic");
  assert.equal(resolveWorkspaceMode(true, "full"), "full");
  assert.equal(resolveWorkspaceMode(true, undefined), "full");
  assert.equal(canChooseWorkspace(true, "basic"), true);
  assert.equal(canChooseWorkspace(true, "full"), true);
});

const variant = (id: string, unit = "pcs") => ({ id, name: id, unit, price: 10, stock: 20 });
test("Quick Add immediately adds the default quantity for single-type products", () => {
  assert.equal(quickAddQuantity({ variants: [variant("only")] }, true), 1);
  assert.equal(quickAddQuantity({ variants: [variant("weight", "kg")] }, true), 1);
  assert.equal(quickAddQuantity({ variants: [variant("grams", "g")] }, true), 500);
});

test("multiple types require selection, even if only one type is in stock", () => {
  assert.equal(quickAddQuantity({ variants: [variant("a"), { ...variant("b"), stock: 0 }] }, true), null);
  assert.equal(quickAddQuantity({ variants: [] }, true), null);
  assert.equal(quickAddQuantity({ variants: [variant("only")] }, false), null);
});
