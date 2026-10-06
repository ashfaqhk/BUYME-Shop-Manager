import type { Product } from "./catalog-data";
import { initialQuantity } from "./quantity-units";

export type WorkspaceMode = "basic" | "full";

export function resolveWorkspaceMode(premiumApproved: boolean, preference: unknown): WorkspaceMode {
  return premiumApproved && preference !== "basic" ? "full" : "basic";
}

export function canChooseWorkspace(premiumApproved: boolean, mode: WorkspaceMode): boolean {
  return mode === "basic" || premiumApproved;
}

export function quickAddQuantity(product: Pick<Product, "variants">, enabled: boolean): number | null {
  return enabled && product.variants.length === 1 ? initialQuantity(product.variants[0].unit) : null;
}
