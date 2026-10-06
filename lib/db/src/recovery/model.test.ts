import { test } from "node:test";
import assert from "node:assert/strict";
import { makePlan, reconcile, snapshot, validateSnapshot, type Decision } from "./model";
import { chooseSource, fixtureData, scenario } from "./fixtures.test-helper";

test("retains originals and recovers new shops, bills, inventory, settings, premium, members, images and usage", () => {
  const { source, target } = scenario();
  const plan = makePlan(source, target);
  const original = JSON.stringify(plan);
  const result = reconcile(plan, chooseSource(plan));
  assert.equal(JSON.stringify(plan), original);
  assert.equal(result.data.buyme_shops.length, 2);
  assert.equal(result.data.buyme_shops[0].revision, 4);
  assert.deepEqual(result.data.buyme_shops[0].sales, source.data.buyme_shops[0].sales);
  assert.deepEqual(result.data.buyme_shops[0].catalog, source.data.buyme_shops[0].catalog);
  assert.deepEqual(result.data.buyme_shops[0].settings, source.data.buyme_shops[0].settings);
  assert.equal(result.data.buyme_shops[0].premium_approved, true);
  assert.deepEqual(result.data.buyme_memberships, source.data.buyme_memberships);
  assert.deepEqual(result.data.buyme_images, source.data.buyme_images);
  assert.deepEqual(result.data.scan_budget, source.data.scan_budget);
});

test("no overwrite, partial approval, unknown approval or malformed plan", () => {
  const { source, target } = scenario();
  const plan = makePlan(source, target);
  assert.throws(() => reconcile(plan, {}), /Every conflict/);
  const decisions = chooseSource(plan);
  assert.throws(() => reconcile(plan, { ...decisions, unknown: decisions[plan.conflicts[0].key] }), /Every conflict/);
  assert.throws(() => reconcile(plan, { ...decisions, [plan.conflicts[0].key]: { choice: "source", reason: "" } }), /reason/);
  const tampered = structuredClone(plan);
  tampered.conflicts.pop();
  assert.throws(() => reconcile(tampered, decisions), /Plan mismatch/);
});

test("merged nested catalog and sales retain both branches; restored revision exceeds both", () => {
  const { source, target } = scenario();
  target.data.buyme_shops[0].revision = 9;
  target.data.buyme_shops[0].sales = [{ id: "target-bill" }];
  const plan = makePlan(source, snapshot(target.data));
  const decisions = chooseSource(plan);
  decisions["buyme_shops:shop-a"] = {
    choice: "merged", reason: "Keep both bills; reviewed product quantities.",
    row: { ...source.data.buyme_shops[0], sales: [{ id: "target-bill" }, { id: "bill-new", total: 30 }] },
  };
  const result = reconcile(plan, decisions);
  assert.equal(result.data.buyme_shops[0].revision, 10);
  assert.equal((result.data.buyme_shops[0].sales as unknown[]).length, 2);
  assert.equal((plan.target.data.buyme_shops[0].sales as unknown[]).length, 1);
});

test("missing rows need explicit keep/delete decisions; orphan selection fails", () => {
  const target = snapshot(fixtureData());
  const data = fixtureData();
  data.buyme_images = [];
  const plan = makePlan(snapshot(data), target);
  assert.equal(plan.conflicts[0].source, null);
  const keep = { [plan.conflicts[0].key]: { choice: "target", reason: "Keep archived image." } as Decision };
  assert.equal(reconcile(plan, keep).data.buyme_images.length, 1);
  assert.equal(reconcile(plan, chooseSource(plan)).data.buyme_images.length, 0);
  const empty = snapshot({ buyme_shops: [], buyme_memberships: [], buyme_images: [], scan_budget: data.scan_budget });
  const deleted = makePlan(empty, target);
  const decisions = chooseSource(deleted);
  decisions["buyme_memberships:member-a"] = { choice: "target", reason: "Unsafe fixture." };
  assert.throws(() => reconcile(deleted, decisions), /Orphan/);
});

test("membership uniqueness across differing primary IDs cannot be silently resolved", () => {
  const { source, target } = scenario();
  source.data.buyme_memberships[0].id = "alternate-member";
  const plan = makePlan(snapshot(source.data), target);
  const decisions = chooseSource(plan);
  decisions["buyme_memberships:member-a"] = { choice: "target", reason: "Keep both (invalid)." };
  assert.throws(() => reconcile(plan, decisions), /uniqueness/);
});

test("scan budget cannot be reduced, removed, or moved to an older period", () => {
  const { source, target } = scenario();
  const plan = makePlan(source, target);
  const decisions = chooseSource(plan);
  decisions["scan_budget:1"] = { choice: "target", reason: "Invalid usage reset." };
  assert.throws(() => reconcile(plan, decisions), /reset scan usage/);
  const newer = fixtureData();
  newer.scan_budget[0] = { id: 1, day: "2026-10-02", month: "2026-10", daily_count: 0, monthly_count: 8 };
  const advanced = makePlan(snapshot(newer), source);
  assert.equal(reconcile(advanced, chooseSource(advanced)).data.scan_budget[0].daily_count, 0);
  const removed = fixtureData();
  removed.scan_budget = [];
  const removal = makePlan(snapshot(removed), target);
  assert.throws(() => reconcile(removal, chooseSource(removal)), /may not be deleted/);
});

test("checksums, schema and duplicate IDs fail closed", () => {
  const data = fixtureData();
  const saved = snapshot(data);
  saved.data.buyme_shops[0].name = "Tampered";
  assert.throws(() => validateSnapshot(saved), /checksum/);
  data.buyme_shops[0].unknown_field = true;
  assert.throws(() => snapshot(data), /Column mismatch/);
  const duplicated = fixtureData();
  duplicated.buyme_images.push(duplicated.buyme_images[0]);
  assert.throws(() => snapshot(duplicated), /Duplicate/);
});
