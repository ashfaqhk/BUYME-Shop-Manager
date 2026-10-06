import assert from "node:assert/strict";
import test from "node:test";
import { recentReportRange, reportData, type ReportSale } from "./report-data";
import { createShopReportPdf } from "./report-documents";

const sale = (id: string, at: Date, amount = 10): ReportSale => ({
  id, createdAt: at.toISOString(), total: amount, paid: amount, paymentMethod: "Cash",
  lines: [{ name: "Test item", variant: "Single", qty: 1, price: amount }],
});
test("day, week, month and year use full inclusive local days", () => {
  const now = new Date(2026, 9, 6, 13, 40);
  for (const [period, days] of [["day", 1], ["week", 7], ["month", 30], ["year", 365]] as const) {
    const range = recentReportRange(period, now);
    let count = 0;
    for (const cursor = new Date(range.start); cursor < range.end; cursor.setDate(cursor.getDate() + 1)) count++;
    assert.equal(count, days);
    assert.equal(range.start.getHours(), 0);
    assert.equal(range.end.getDate(), 7);
  }
});
test("filters sales at boundaries and includes today's collections for older bills", () => {
  const now = new Date(2026, 9, 6);
  const range = recentReportRange("day", now);
  const prior = sale("old", new Date(2026, 8, 1), 100);
  prior.payments = [{ method: "UPI", amount: 100, createdAt: new Date(2026, 9, 6, 14).toISOString() }];
  const data = reportData([prior, sale("start", range.start), sale("end", range.end), sale("before", new Date(range.start.getTime() - 1))], range);
  assert.deepEqual(data.bills.map((item) => item.id), ["start"]);
  assert.equal(data.totalSales, 10);
  assert.equal(data.totalCollected, 110);
  assert.equal(data.upiCollected, 100);
});
test("empty periods still produce a valid zero-activity PDF", async () => {
  const blob = createShopReportPdf({ sales: [], catalog: [], settings: { shopName: "Test shop" }, range: recentReportRange("day") });
  assert.equal(blob.type, "application/pdf");
  const content = new TextDecoder().decode(await blob.arrayBuffer());
  assert.ok(content.startsWith("%PDF-"));
  assert.ok(content.includes("No sales were recorded"));
});
test("yearly PDFs include the final record and paginate rather than truncate at 31 days", async () => {
  const range = recentReportRange("year", new Date(2026, 9, 6));
  const sales = Array.from({ length: 100 }, (_, index) => {
    const at = new Date(range.start); at.setDate(at.getDate() + index * 3);
    return sale(`REPORT-BILL-${index}`, at);
  });
  assert.equal(reportData(sales, range).bills.length, 100);
  const content = new TextDecoder().decode(await createShopReportPdf({ sales, catalog: [], settings: { shopName: "Test shop" }, range }).arrayBuffer());
  assert.ok(content.includes("REPORT-BILL-99"));
  assert.ok((content.match(/\/Type \/Page\b/g) ?? []).length > 1);
});
test("invalid ranges fail explicitly", () => {
  assert.throws(() => reportData([], { start: new Date("invalid"), end: new Date(), label: "Invalid" }), /valid report date/);
});
