export * from "../../../../lib/db/src/maintenance";
export const metrics = { writes: 0, reservations: 0, auth: 0, storage: 0, invitations: 0 };
export const shop = {
  id: "shop-1", revision: 3, name: "Existing shop", catalog: [{ id: "product" }],
  sales: [{ id: "bill" }], settings: {}, accessEnabled: true, premiumApproved: false,
};
export const buymeShopsTable = { id: "shops.id", revision: "revision", accessEnabled: "accessEnabled" };
export const buymeMembershipsTable = { userId: "members.userId", shopId: "members.shopId" };
export const buymeImagesTable = { id: "images.id", shopId: "images.shopId" };

function conditions(value: any): any[] {
  return value?.conditions?.flatMap(conditions) ?? [value];
}
export const db = {
  select() {
    let table: any;
    let filter: any;
    const query: any = {
      from(value: any) { table = value; return query; },
      innerJoin() { return query; },
      where(value: any) { filter = value; return query; },
      limit() { return query; },
      orderBy() { return query; },
      then(resolve: any, reject: any) {
        let rows: any[] = [shop];
        if (table === buymeMembershipsTable) {
          const userId = conditions(filter).find((item) => item?.left === "members.userId")?.right;
          rows = userId === "owner" || userId === "invited-existing"
            ? [{ shop, role: "owner", memberEmail: "owner@example.com" }] : [];
        } else if (table === buymeImagesTable) {
          rows = [{ id: "image-1", shopId: shop.id, objectPath: "/objects/legacy",
            contentType: "image/png", imageBase64: null }];
        }
        return Promise.resolve(rows).then(resolve, reject);
      },
    };
    return query;
  },
  insert() { metrics.writes++; throw new Error("Unexpected insert"); },
  update() { metrics.writes++; throw new Error("Unexpected update"); },
};

export const pool = {
  async query(sql: string) {
    if (sql.startsWith("SHOW")) {
      return { rows: [{ default_transaction_read_only: process.env.TEST_DB_READ_ONLY ?? "on" }] };
    }
    metrics.reservations++;
    return { rowCount: 1 };
  },
};
