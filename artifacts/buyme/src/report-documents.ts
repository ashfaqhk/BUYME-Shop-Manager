import { jsPDF } from "jspdf";
import type { Product } from "./catalog-data";
import { reportData, type ReportRange, type ReportSale } from "./report-data";

type ReportSettings = { shopName: string; phone?: string; gstin?: string };
const money = (amount: number) => `Rs. ${amount.toFixed(2)}`;
export function createShopReportPdf({ sales, catalog, settings, range, syncStatus }: {
  sales: ReportSale[]; catalog: Product[]; settings: ReportSettings; range: ReportRange; syncStatus?: string;
}): Blob {
  const data = reportData(sales, range);
  const pdf = new jsPDF();
  let y = 18;
  const text = (content: string, bold = false, size = 10) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal"); pdf.setFontSize(size);
    // jsPDF's built-in font is Latin; keep monetary values and symbols portable.
    const lines = pdf.splitTextToSize(content.replace(/₹/g, "Rs. ").replace(/[·–—]/g, "-"), 174) as string[];
    for (const line of lines) {
      if (y > 275) { pdf.addPage(); y = 18; }
      pdf.text(line, 18, y); y += size >= 14 ? 7 : 5;
    }
  };
  const heading = (title: string) => { y += 5; if (y > 264) { pdf.addPage(); y = 18; } text(title, true, 13); y += 2; };
  const lastDay = new Date(range.end); lastDay.setDate(lastDay.getDate() - 1);
  const date = (value: Date) => value.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  text(settings.shopName || "My shop", true, 18);
  text("BUYME - Shop data report", true, 12);
  text(`${range.label}: ${date(range.start)} to ${date(lastDay)} (device local dates)`);
  text(`Generated: ${new Date().toLocaleString("en-IN")}`);
  if (settings.phone) text(`Shop phone: ${settings.phone}`);
  if (settings.gstin) text(`GSTIN: ${settings.gstin}`);
  text(`Source: this device's latest shop data. Sync: ${syncStatus || "Device copy"}`);
  text("This is a data report, not a tax invoice or a complete restorable database backup.");
  heading("Period summary");
  text(`Bills / sales: ${data.bills.length}     Sales value: ${money(data.totalSales)}`);
  text(`Payments received during period: ${money(data.totalCollected)}`);
  text(`Cash: ${money(data.cashCollected)}     UPI: ${money(data.upiCollected)}`);
  text(`GST on period sales: ${money(data.gst)}     Discounts: ${money(data.discounts)}`);
  text(`Current outstanding across all saved bills: ${money(data.currentOutstanding)}`);
  text("Outstanding and inventory below are current snapshots, not historical end-of-period balances.");
  heading("Sales and items within the selected period");
  if (!data.bills.length) text("No sales were recorded during this period.");
  for (const sale of data.bills) {
    y += 3;
    text(`${sale.id} - ${new Date(sale.createdAt).toLocaleString("en-IN")}`, true);
    if (sale.customerName || sale.customer) text(`Customer: ${sale.customerName || "-"}${sale.customer ? ` | Contact: ${sale.customer}` : ""}`);
    for (const line of sale.lines) text(`${line.name} / ${line.variant}: ${line.qty} ${line.unit || "pcs"} x ${money(line.price)} = ${money(Math.round(line.qty * line.price * 100) / 100)}`);
    text(`Total ${money(sale.total)} | Current paid ${money(sale.paid)} | Current due ${money(Math.max(0, sale.total - sale.paid))}`);
    if (sale.gst || sale.discount) text(`GST ${money(sale.gst ?? 0)} | Discount ${money(sale.discount ?? 0)}`);
  }
  heading("Payments received within the selected period");
  text("Includes collections for older bills when the payment date is in this period.");
  if (!data.payments.length) text("No payments were recorded during this period.");
  for (const payment of data.payments) text(`${new Date(payment.createdAt).toLocaleString("en-IN")} | ${payment.saleId} | ${payment.method} | ${money(payment.amount)}${payment.customerName ? ` | ${payment.customerName}` : ""}`);
  heading("Current catalog and stock snapshot");
  if (!catalog.length) text("The current catalog is empty.");
  for (const product of catalog) {
    text(`${product.name} - ${product.category}`, true);
    for (const variant of product.variants) text(`${variant.name} | Price ${money(variant.price)} | Stock ${typeof variant.stock === "number" ? variant.stock : "not tracked"} | Low-stock threshold ${variant.threshold ?? "not set"}`);
  }
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page); pdf.setFont("helvetica", "normal"); pdf.setFontSize(8);
    pdf.text(`BUYME report | Page ${page} of ${pages}`, 18, 289);
  }
  return pdf.output("blob");
}
