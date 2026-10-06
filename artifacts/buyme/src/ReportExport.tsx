import { useEffect, useState } from "react";
import { Download, ExternalLink } from "lucide-react";
import { createShopReportPdf } from "./report-documents";
import { recentReportRange, reportPeriodLabels, type ReportPeriod, type ReportRange, type ReportSale } from "./report-data";
import type { Product } from "./catalog-data";
import { useSellerShop } from "./SellerAccess";

type Props = { sales: ReportSale[]; catalog: Product[]; settings: { shopName: string; phone?: string; gstin?: string }; range?: ReportRange };
export function ReportDownload({ sales, catalog, settings, range }: Props & { range: ReportRange }) {
  const { saveStatus } = useSellerShop();
  const rangeKey = `${range.start.getTime()}:${range.end.getTime()}`;
  const [prepared, setPrepared] = useState<{ url: string; name: string; rangeKey: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => () => { if (prepared) URL.revokeObjectURL(prepared.url); }, [prepared]);
  const prepare = async () => {
    setBusy(true); setError(""); setPrepared(null);
    try {
      // Yield so the button can show progress before a multi-page yearly report.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const blob = createShopReportPdf({ sales, catalog, settings, range, syncStatus: saveStatus });
      const day = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      const end = new Date(range.end); end.setDate(end.getDate() - 1);
      const result = { url: URL.createObjectURL(blob), name: `BUYME-report-${day(range.start)}-to-${day(end)}.pdf`, rangeKey };
      setPrepared(result);
      const link = document.createElement("a"); link.href = result.url; link.download = result.name; link.click();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create the PDF report. Your shop data is unchanged."); }
    finally { setBusy(false); }
  };
  return <div className="flex flex-wrap items-center gap-2">
    <button type="button" disabled={busy} onClick={() => void prepare()} className="flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-xs font-extrabold text-primary-foreground disabled:opacity-60" data-testid="button-download-report"><Download size={15} />{busy ? "Preparing PDF…" : "Download PDF"}</button>
    {prepared?.rangeKey === rangeKey && <><a href={prepared.url} download={prepared.name} title={prepared.name} className="text-xs font-bold text-primary underline" data-testid="link-save-report">Save PDF</a><a href={prepared.url} target="_blank" rel="noopener noreferrer" title={prepared.name} className="flex items-center gap-1 text-xs font-bold text-primary underline" data-testid="link-open-report"><ExternalLink size={13} />Open PDF</a></>}
    {error && <p role="alert" className="w-full text-xs text-destructive">{error}</p>}
  </div>;
}

export default function ReportExport(props: Props) {
  const [period, setPeriod] = useState<ReportPeriod>("day");
  return <section className="rounded-2xl border border-border bg-card p-5 sm:p-7" data-testid="settings-data-export">
    <h3 className="font-extrabold">Download your shop data</h3>
    <p className="mt-2 text-xs leading-5 text-muted-foreground">PDF reports include sales, item details, dated payments and current stock. They work offline from this device’s latest copy. Periods include today; month means 30 days and year means 365 days.</p>
    <label className="mt-4 block text-xs font-bold" htmlFor="settings-report-period">Report period</label>
    <select id="settings-report-period" className="field mb-4 mt-2" value={period} onChange={(event) => setPeriod(event.target.value as ReportPeriod)} data-testid="select-settings-report-period">
      {(Object.keys(reportPeriodLabels) as ReportPeriod[]).map((value) => <option key={value} value={value}>{reportPeriodLabels[value]}</option>)}
    </select>
    <ReportDownload {...props} range={recentReportRange(period)} />
    <p className="mt-3 text-[11px] text-muted-foreground">If your phone does not start the download, use Open PDF, then Save or Share from the viewer.</p>
  </section>;
}
