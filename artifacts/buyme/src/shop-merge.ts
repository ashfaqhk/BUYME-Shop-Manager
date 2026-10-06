import type { Snapshot } from "./shop-types";
import { roundQuantity } from "./quantity-units";

export function sameData(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => sameData(value, right[index]));
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const a = Object.entries(left).filter(([, value]) => value !== undefined);
    const b = Object.entries(right).filter(([, value]) => value !== undefined);
    const other = right as Record<string, unknown>;
    return a.length === b.length && a.every(([key, value]) => Object.hasOwn(other, key) && sameData(value, other[key]));
  }
  return false;
}

export type ConflictChoice = "device" | "cloud";

// Three-way merge: untouched fields follow the cloud; independent edits survive.
// Conflicting edits/deletions are never silently treated as last-write-wins.
export function mergeSnapshots(base: Snapshot, device: Snapshot, cloud: Snapshot, choice?: ConflictChoice) {
  const conflicts: string[] = [];
  const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  const salesMap = (snapshot: Snapshot) => new Map(snapshot.sales.filter(object).map((sale) => [sale.id, sale]));
  const originals = salesMap(base), locals = salesMap(device), remotes = salesMap(cloud);
  const additions = (sales: Map<unknown, Record<string, unknown>>) => new Map([...sales].filter(([id]) => !originals.has(id)));
  const localAdded = additions(locals), remoteAdded = additions(remotes);
  const unionAdded = new Map([...localAdded, ...remoteAdded]);
  const consistentEvents = [...localAdded].every(([id, sale]) => !remoteAdded.has(id) || sameData(sale.lines, remoteAdded.get(id)!.lines));
  const quantities = (sales: Map<unknown, Record<string, unknown>>) => {
    const result = new Map<string, number>();
    for (const sale of sales.values()) if (Array.isArray(sale.lines)) for (const line of sale.lines) {
      if (!object(line) || typeof line.productId !== "string" || typeof line.variantId !== "string" || typeof line.qty !== "number" || !Number.isFinite(line.qty) || line.qty <= 0) continue;
      const key = JSON.stringify([line.productId, line.variantId]);
      result.set(key, roundQuantity((result.get(key) ?? 0) + line.qty));
    }
    return result;
  };
  const localQuantities = quantities(localAdded), remoteQuantities = quantities(remoteAdded), unionQuantities = quantities(unionAdded);
  const concurrentStock = [...localQuantities.keys()].some((key) => (remoteQuantities.get(key) ?? 0) > 0);
  const keyFor = (value: unknown, path: string): string | null => {
    if (!object(value)) return null;
    if (typeof value.id === "string" || typeof value.id === "number") return String(value.id);
    if (typeof value.lineId === "string") return value.lineId;
    if (path.endsWith(".payments") && typeof value.createdAt === "string") {
      return `${value.createdAt}:${value.method}:${value.amount}`;
    }
    return null;
  };
  const merge = (before: unknown, local: unknown, remote: unknown, path: string): unknown => {
    const stock = path.match(/^shop\.catalog\[([^\]]+)\]\.variants\[([^\]]+)\]\.stock$/);
    if (stock && consistentEvents && typeof before === "number" && typeof local === "number" && typeof remote === "number") {
      const key = JSON.stringify([stock[1], stock[2]]);
      const localSold = localQuantities.get(key) ?? 0, remoteSold = remoteQuantities.get(key) ?? 0;
      if (localSold > 0 && remoteSold > 0 && Math.abs(roundQuantity(before - local) - localSold) < 0.000001 &&
        Math.abs(roundQuantity(before - remote) - remoteSold) < 0.000001) {
        return Math.max(0, roundQuantity(before - (unionQuantities.get(key) ?? 0)));
      }
    }
    // Equal catalog snapshots can still represent distinct sales on two devices.
    // Descend to stock before applying equality shortcuts to those containers.
    const reconcileStock = concurrentStock && path.startsWith("shop.catalog") &&
      ((object(local) && object(remote)) || (Array.isArray(local) && Array.isArray(remote)));
    if (!reconcileStock) {
      if (sameData(local, remote)) return local;
      if (sameData(local, before)) return remote;
      if (sameData(remote, before)) return local;
    }
    if (path.endsWith(".updatedAt") && typeof local === "string" && typeof remote === "string" &&
      Number.isFinite(Date.parse(local)) && Number.isFinite(Date.parse(remote))) {
      return Date.parse(local) >= Date.parse(remote) ? local : remote;
    }
    if (object(local) && object(remote) && (object(before) || before === undefined)) {
      const original = object(before) ? before : {};
      const result: Record<string, unknown> = {};
      for (const key of new Set([...Object.keys(original), ...Object.keys(local), ...Object.keys(remote)])) {
        const value = merge(original[key], local[key], remote[key], `${path}.${key}`);
        if (value !== undefined) result[key] = value;
      }
      return result;
    }
    if (Array.isArray(local) && Array.isArray(remote) && (Array.isArray(before) || before === undefined)) {
      const original = Array.isArray(before) ? before : [];
      const arrays = [original, local, remote];
      const maps = arrays.map((items) => new Map(items.map((item) => [keyFor(item, path), item])));
      if (arrays.every((items, index) => !maps[index].has(null) && maps[index].size === items.length)) {
        const result: unknown[] = [];
        for (const key of new Set([...maps[1].keys(), ...maps[2].keys(), ...maps[0].keys()])) {
          const value = merge(maps[0].get(key), maps[1].get(key), maps[2].get(key), `${path}[${key}]`);
          if (value !== undefined) result.push(value);
        }
        return result;
      }
    }
    conflicts.push(path);
    return choice === "cloud" ? remote : local;
  };
  const snapshot = structuredClone(merge(base, device, cloud, "shop")) as Snapshot;
  const recomputed = new Set<string>();
  // paid is a derived total when two devices independently append collections.
  snapshot.sales = snapshot.sales.map((value) => {
    if (!object(value) || !Array.isArray(value.payments)) return value;
    const original = originals.get(value.id);
    const local = locals.get(value.id);
    const remote = remotes.get(value.id);
    if (!object(local) || !object(remote) || !Array.isArray(local.payments) || !Array.isArray(remote.payments) ||
      sameData(local.payments, remote.payments) || sameData(local.payments, object(original) ? original.payments : undefined) ||
      sameData(remote.payments, object(original) ? original.payments : undefined)) return value;
    recomputed.add(String(value.id));
    return { ...value, paid: Math.round(value.payments.reduce((sum: number, payment: unknown) =>
      object(payment) && typeof payment.amount === "number" ? sum + payment.amount : sum, 0) * 100) / 100 };
  });
  // An independently appended credit payment need not conflict on its derived paid total.
  const meaningful = conflicts.filter((path) => {
    const match = path.match(/^shop\.sales\[([^\]]+)\]\.paid$/);
    return !match || !recomputed.has(match[1]);
  });
  return { snapshot, conflicts: meaningful };
}
