export type ReportPeriod = "day" | "week" | "month" | "year";
export type ReportRange = { start: Date; end: Date; label: string };
export type ReportPayment = { method: "Cash" | "UPI"; amount: number; createdAt: string };
export type ReportSale = {
  id: string; createdAt: string; total: number; paid: number; subtotal?: number; gst?: number; discount?: number;
  paymentMethod: "Cash" | "UPI" | "Credit"; payments?: ReportPayment[]; customerName?: string; customer?: string;
  lines: { name: string; variant: string; unit?: string; qty: number; price: number }[];
};
export const reportPeriodLabels: Record<ReportPeriod, string> = {
  day: "One day · today", week: "One week · last 7 days", month: "One month · last 30 days", year: "One year · last 365 days",
};
export function recentReportRange(period: ReportPeriod, now = new Date()): ReportRange {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - ({ day: 1, week: 7, month: 30, year: 365 }[period] - 1));
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { start, end, label: reportPeriodLabels[period] };
}
export function paymentsForReport(sale: ReportSale): ReportPayment[] {
  if (sale.payments) return sale.payments;
  if (sale.paid > 0 && sale.paymentMethod !== "Credit") return [{ method: sale.paymentMethod, amount: sale.paid, createdAt: sale.createdAt }];
  return [];
}
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export function reportData(sales: ReportSale[], range: ReportRange) {
  if (!Number.isFinite(range.start.getTime()) || !Number.isFinite(range.end.getTime()) || range.end <= range.start) throw new Error("Choose a valid report date range.");
  const within = (date: string) => { const time = new Date(date).getTime(); return time >= range.start.getTime() && time < range.end.getTime(); };
  const bills = sales.filter((sale) => within(sale.createdAt)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const payments = sales.flatMap((sale) => paymentsForReport(sale).filter((payment) => within(payment.createdAt)).map((payment) => ({ ...payment, saleId: sale.id, customerName: sale.customerName }))).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return {
    bills, payments,
    totalSales: round(bills.reduce((sum, sale) => sum + sale.total, 0)),
    totalCollected: round(payments.reduce((sum, payment) => sum + payment.amount, 0)),
    cashCollected: round(payments.filter((payment) => payment.method === "Cash").reduce((sum, payment) => sum + payment.amount, 0)),
    upiCollected: round(payments.filter((payment) => payment.method === "UPI").reduce((sum, payment) => sum + payment.amount, 0)),
    gst: round(bills.reduce((sum, sale) => sum + (sale.gst ?? 0), 0)),
    discounts: round(bills.reduce((sum, sale) => sum + (sale.discount ?? 0), 0)),
    currentOutstanding: round(sales.reduce((sum, sale) => sum + Math.max(0, sale.total - sale.paid), 0)),
  };
}
