import type { Product } from "./catalog-data";

export type ShopState = {
  shopId: string;
  shopName: string;
  email: string;
  role: string;
  isCompanyAdmin: boolean;
  premiumApproved: boolean;
  accessEnabled: boolean;
  upgradeRequestedAt: string | null;
  mode: "basic" | "full";
  catalog: Product[];
  sales: unknown[];
  settings: Record<string, unknown>;
  revision: number;
  isNew?: boolean;
};

export type Snapshot = Pick<ShopState, "catalog" | "sales" | "settings">;
export type LocalShop = {
  userId: string;
  server: ShopState;
  local: Snapshot;
  pending: boolean;
  updatedAt: string;
  photos: Record<string, string>;
};

export function snapshotOf(shop: Snapshot): Snapshot {
  return { catalog: shop.catalog, sales: shop.sales, settings: shop.settings };
}
