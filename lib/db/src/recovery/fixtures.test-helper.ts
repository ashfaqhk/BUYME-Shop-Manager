import { snapshot, type Data, type Row, type Decisions, type Plan } from "./model";

export const time = "2026-10-01T00:00:00+00:00";
export function shop(id: string, fields: Partial<Row> = {}): Row {
  return {
    id, name: "Fixture shop", owner_user_id: "fixture-owner", premium_approved: false,
    catalog: [{ id: "product-a", stock: 8 }], sales: [], settings: { shopName: "Fixture shop" },
    revision: 1, created_at: time, updated_at: time, ...fields,
  };
}
export function fixtureData(): Data {
  return {
    buyme_shops: [shop("shop-a")],
    buyme_memberships: [{ id: "member-a", shop_id: "shop-a", user_id: "fixture-owner",
      email: "fixture@example.invalid", role: "owner", created_at: time }],
    buyme_images: [{ id: "image-a", shop_id: "shop-a", object_path: "/objects/fixture-a",
      content_type: "image/png", byte_length: 100, created_at: time }],
    scan_budget: [{ id: 1, day: "2026-10-01", month: "2026-10", daily_count: 2, monthly_count: 5 }],
  };
}
export function scenario() {
  const target = snapshot(fixtureData());
  const data = fixtureData();
  data.buyme_shops[0] = shop("shop-a", { revision: 3, premium_approved: true,
    catalog: [{ id: "product-a", stock: 5 }], sales: [{ id: "bill-new", total: 30 }],
    settings: { shopName: "Updated fixture", upiId: "fixture" }, name: "Updated fixture" });
  data.buyme_shops.push(shop("shop-new"));
  data.buyme_memberships.push({ ...data.buyme_memberships[0], id: "member-new",
    shop_id: "shop-new", user_id: "fixture-new" });
  data.buyme_images.push({ ...data.buyme_images[0], id: "image-new", shop_id: "shop-new" });
  data.scan_budget[0] = { ...data.scan_budget[0], daily_count: 4, monthly_count: 8 };
  return { source: snapshot(data), target };
}
export function chooseSource(plan: Plan): Decisions {
  return Object.fromEntries(plan.conflicts.map((c) => [c.key, {
    choice: "source", reason: "Fixture review confirms the production record.",
  }]));
}
