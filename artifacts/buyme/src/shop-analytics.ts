import type { Product } from "./catalog-data";
import { roundMoney, roundQuantity } from "./quantity-units";
export type LedgerSale = {
  id: string; createdAt: string; total: number; paid: number; paymentMethod: "Cash" | "UPI" | "Credit";
  payments?: { method: "Cash" | "UPI"; amount: number; createdAt: string }[];
  lines: { productId: string; variantId: string; qty: number; name?: string; variant?: string; unit?: string }[];
};
const positive = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;
function convertQuantity(qty: number, from: string | undefined, to: string) {
  if (!from || from.toLowerCase() === to.toLowerCase()) return qty;
  const measures: Record<string, [string, number]> = { g: ["mass", 1], kg: ["mass", 1000], ml: ["volume", 1], l: ["volume", 1000] };
  const a = measures[from.toLowerCase()], b = measures[to.toLowerCase()];
  return a && b && a[0] === b[0] ? qty * a[1] / b[1] : null;
}
const paymentsOf = (sale: LedgerSale) => Array.isArray(sale.payments) ? sale.payments.filter((p) =>
  (p.method === "Cash" || p.method === "UPI") && positive(p.amount)) :
  sale.paymentMethod !== "Credit" && positive(sale.paid) ?
    [{ method: sale.paymentMethod, amount: sale.paid, createdAt: sale.createdAt }] : [];
export function summarizeMoney(sales: LedgerSale[], start: Date, end: Date) {
  const inRange = (date: string) => Date.parse(date) >= +start && Date.parse(date) < +end;
  let totalBilled = 0, cashReceived = 0, upiReceived = 0, billedCash = 0, billedUpi = 0, creditDue = 0, creditIssued = 0;
  for (const sale of sales) {
    const payments = paymentsOf(sale);
    for (const p of payments) if (inRange(p.createdAt)) {
      if (p.method === "Cash") cashReceived += positive(p.amount); else upiReceived += positive(p.amount);
    }
    if (!inRange(sale.createdAt)) continue;
    const total = positive(sale.total);
    totalBilled += total;
    const cash = payments.filter((p) => p.method === "Cash").reduce((sum, p) => sum + positive(p.amount), 0);
    const upi = payments.filter((p) => p.method === "UPI").reduce((sum, p) => sum + positive(p.amount), 0);
    const ratio = cash + upi > total ? total / (cash + upi) : 1;
    billedCash += cash * ratio; billedUpi += upi * ratio;
    creditDue += Math.max(0, total - cash - upi);
    // Original credit, before later collections, is not counted as cash.
    const atIssue = payments.filter((p) => p.createdAt === sale.createdAt).reduce((sum, p) => sum + positive(p.amount), 0);
    creditIssued += Math.max(0, total - atIssue);
  }
  return { totalBilled: roundMoney(totalBilled), cashReceived: roundMoney(cashReceived), upiReceived: roundMoney(upiReceived),
    received: roundMoney(cashReceived + upiReceived), billedCash: roundMoney(billedCash),
    billedUpi: roundMoney(billedUpi), creditDue: roundMoney(creditDue), creditIssued: roundMoney(creditIssued) };
}
export function inventoryRows(catalog: Product[], sales: LedgerSale[], now = new Date()) {
  const since = +now - 30 * 86400_000;
  const sold = new Map<string, number>();
  const units = new Map(catalog.flatMap((p) => p.variants.map((v) => [JSON.stringify([p.id, v.id]), v.unit] as const)));
  for (const sale of sales) if (Date.parse(sale.createdAt) >= since && Date.parse(sale.createdAt) <= +now) {
    for (const line of sale.lines ?? []) {
      const key = JSON.stringify([line.productId, line.variantId]);
      const unit = units.get(key);
      const qty = unit ? convertQuantity(positive(line.qty), line.unit, unit) : null;
      if (qty !== null) sold.set(key, (sold.get(key) ?? 0) + qty);
    }
  }
  return catalog.flatMap((p) => p.variants.map((v) => {
    const stock = typeof v.stock === "number" && Number.isFinite(v.stock) ? Math.max(0, v.stock) : null;
    const threshold = typeof v.threshold === "number" && Number.isFinite(v.threshold) ? Math.max(0, v.threshold) : 5;
    const sold30 = roundQuantity(sold.get(JSON.stringify([p.id, v.id])) ?? 0);
    const dailyRate = sold30 / 30;
    const target = Math.max(threshold + 1, Math.ceil(dailyRate * 14));
    return { productId: p.id, variantId: v.id, name: p.name, variant: v.name, category: p.category, unit: v.unit,
      stock, threshold, low: stock !== null && stock <= threshold, sold30, dailyRate,
      reorder: stock === null ? 0 : Math.max(0, Math.ceil(target - stock)),
      daysLeft: stock !== null && dailyRate > 0 ? stock / dailyRate : null,
      createdAt: p.createdAt ?? null };
  }));
}
export function inventoryAdditions(catalog: Product[], now = new Date()) {
  return catalog.flatMap((p) => (p.stockEvents ?? []).filter((e) =>
    positive(e.qty) && Date.parse(e.createdAt) >= +now - 30 * 86400_000 && Date.parse(e.createdAt) <= +now)
    .map((e) => ({ ...e, productId: p.id, name: p.name,
      variant: e.variantName ?? p.variants.find((v) => v.id === e.variantId)?.name ?? "Removed type",
      unit: e.unit ?? p.variants.find((v) => v.id === e.variantId)?.unit ?? "" })))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
export function matchesInventoryStatus(row: { stock: number | null; low: boolean }, status: "all" | "low" | "out" | "unknown") {
  if (status === "all") return true;
  if (status === "unknown") return row.stock === null;
  if (status === "out") return row.stock !== null && row.stock <= 0;
  return row.low && row.stock !== null && row.stock > 0;
}
export function recordStockAdditions(previous: Product | undefined, product: Product, source: "manual" | "scan", now = new Date()): Product {
  const createdAt = now.toISOString();
  const additions = product.variants.flatMap((v) => {
    const old = previous?.variants.find((item) => item.id === v.id);
    const before = convertQuantity(old?.stock ?? 0, old?.unit, v.unit);
    if (before === null) return [];
    const qty = roundQuantity((v.stock ?? 0) - before);
    return qty > 0 ? [{ id: crypto.randomUUID(), variantId: v.id, qty, createdAt, unit: v.unit, variantName: v.name,
      source: previous ? source : "initial" as const }] : [];
  });
  return { ...product, createdAt: previous?.createdAt ?? product.createdAt ?? (!previous ? createdAt : undefined),
    updatedAt: createdAt, stockEvents: [...(previous?.stockEvents ?? []), ...additions] };
}
