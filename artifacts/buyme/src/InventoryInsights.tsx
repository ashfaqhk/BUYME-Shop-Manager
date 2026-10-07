import { useMemo, useState } from 'react';
import { AlertTriangle, PackageX, Search } from 'lucide-react';
import type { Product } from './catalog-data';
import { inventoryAdditions, inventoryRows, matchesInventoryStatus, type LedgerSale } from './shop-analytics';

type Status = 'all' | 'low' | 'out' | 'unknown';
type Sort = 'name' | 'stock' | 'seller' | 'priority' | 'newest';
const dateFmt = (v: string | null) => v && !Number.isNaN(new Date(v).getTime()) ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Date not recorded';

export default function InventoryInsights({ catalog, sales }: { catalog: Product[]; sales: LedgerSale[] }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState<Status>('all');
  const [sort, setSort] = useState<Sort>('priority');
  const [days, setDays] = useState<7 | 30>(7);
  const rows = useMemo(() => inventoryRows(catalog, sales), [catalog, sales]);
  const additions = useMemo(() => inventoryAdditions(catalog), [catalog]);
  const cats = useMemo(() => Array.from(new Set(rows.map((r) => r.category))).sort(), [rows]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => (category === 'all' || r.category === category)
      && matchesInventoryStatus(r, status)
      && `${r.name} ${r.variant} ${r.category}`.toLowerCase().includes(q));
    const cmp: Record<Sort, (a: typeof rows[number], b: typeof rows[number]) => number> = {
      name: (a, b) => a.name.localeCompare(b.name),
      stock: (a, b) => (a.stock ?? Infinity) - (b.stock ?? Infinity),
      seller: (a, b) => b.sold30 - a.sold30,
      priority: (a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity) || Number(b.low) - Number(a.low) || b.reorder - a.reorder,
      newest: (a, b) => (b.createdAt ? Date.parse(b.createdAt) : -Infinity) - (a.createdAt ? Date.parse(a.createdAt) : -Infinity),
    };
    return [...list].sort(cmp[sort]);
  }, [rows, query, category, status, sort]);
  const cutoff = Date.now() - days * 86400000;
  const recent = additions.filter((a) => Date.parse(a.createdAt) >= cutoff);
  const lowCount = rows.filter((r) => r.low).length;
  const recentProducts = useMemo(() => {
    const end = Date.now(), start = end - days * 86_400_000;
    return catalog.filter((p) => p.createdAt && +new Date(p.createdAt) >= start && +new Date(p.createdAt) <= end
      && !(p.stockEvents ?? []).some((e) => e.source === "initial"))
      .sort((a, b) => +new Date(b.createdAt!) - +new Date(a.createdAt!));
  }, [catalog, days]);
  const chip = (on: boolean) => `whitespace-nowrap rounded-full border px-3.5 py-2 text-xs font-bold ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground'}`;

  return <div className="space-y-5" data-testid="section-inventory-insights">
    <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-[var(--shadow-sm)] sm:p-6">
      <p className="text-xs font-bold text-muted-foreground">Inventory</p>
      <h3 className="mt-1 text-lg font-extrabold">Every type, one table</h3>
      <p className="mt-1 text-xs text-muted-foreground">{rows.length} types · {lowCount} at or below threshold. Restock figures are estimates from the last 30 days of sales, aiming for 14 days of supply. They are not guarantees.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <label className="relative block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-primary" size={16} /><span className="sr-only">Search inventory</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search product or type..." className="field pl-9" data-testid="input-search-inventory" /></label>
        <label className="block"><span className="sr-only">Category</span><select value={category} onChange={(e) => setCategory(e.target.value)} className="field" data-testid="select-inventory-category"><option value="all">All categories</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        <label className="block"><span className="sr-only">Sort by</span><select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="field" data-testid="select-inventory-sort"><option value="priority">Restock priority</option><option value="stock">Lowest stock</option><option value="seller">Best seller</option><option value="name">Name</option><option value="newest">Newest</option></select></label>
      </div>
      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">{(['all', 'low', 'out', 'unknown'] as Status[]).map((s) => <button key={s} onClick={() => setStatus(s)} aria-pressed={status === s} className={chip(status === s)} data-testid={`button-status-${s}`}>{{ all: 'All', low: 'Low stock', out: 'Out of stock', unknown: 'Not tracked' }[s]}</button>)}</div>
      {shown.length === 0 ? <p className="mt-5 rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground" data-testid="inventory-empty">No inventory matches these filters.</p> : <div className="mt-4 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="bg-muted/50 text-[11px] text-muted-foreground"><tr><th className="p-3">Product / type</th><th className="p-3">Stock</th><th className="p-3">Sold 30d</th><th className="p-3">Cover (est.)</th><th className="p-3">Suggested order (est.)</th></tr></thead>
          <tbody className="divide-y divide-border">{shown.map((r) => {
            const out = r.stock !== null && r.stock <= 0;
            return <tr key={`${r.productId}-${r.variantId}`} className={r.low ? 'bg-destructive/5' : ''} data-testid={`row-inventory-${r.productId}-${r.variantId}`}>
              <td className="p-3"><span className="block font-extrabold">{r.name}</span><span className="text-[11px] text-muted-foreground">{r.variant} · {r.category}</span></td>
              <td className="p-3">{r.stock === null ? <span className="text-muted-foreground">Not tracked</span> : <span className={`inline-flex items-center gap-1.5 font-extrabold ${r.low ? 'text-destructive' : ''}`}>{r.low && (out ? <PackageX size={14} aria-hidden /> : <AlertTriangle size={14} aria-hidden />)}{r.stock} {r.unit}{r.low && <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px]">{out ? 'Out of stock' : `Low (at ${r.threshold})`}</span>}</span>}</td>
              <td className="p-3 font-mono-app">{r.sold30}</td>
              <td className="p-3">{r.daysLeft === null ? <span className="text-muted-foreground">No recent sales</span> : `about ${Math.round(r.daysLeft)} days`}</td>
              <td className="p-3">{r.stock === null ? <span className="text-muted-foreground">-</span> : r.reorder > 0 ? <span className="font-extrabold text-primary">about {r.reorder} {r.unit}</span> : <span className="text-muted-foreground">Enough for now</span>}</td>
            </tr>; })}</tbody>
        </table>
      </div>}
    </section>
    <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-[var(--shadow-sm)] sm:p-6" data-testid="section-stock-additions">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold text-muted-foreground">Recent stock additions</p><h3 className="mt-1 text-lg font-extrabold">What came in</h3></div>
        <div className="flex gap-2">{([7, 30] as const).map((d) => <button key={d} onClick={() => setDays(d)} aria-pressed={days === d} className={chip(days === d)} data-testid={`button-additions-${d}`}>Last {d} days</button>)}</div></div>
      {recentProducts.map((p) => <div key={p.id} className="mt-3 flex items-center justify-between gap-3 border-t border-border py-3 text-xs"><div><p className="font-extrabold">{p.name}</p><p className="mt-1 text-muted-foreground">{dateFmt(p.createdAt!)} · Added to catalog</p></div><span className="text-muted-foreground">No initial stock recorded</span></div>)}
      {recent.length === 0 && recentProducts.length === 0 ? <p className="mt-4 text-xs text-muted-foreground">No recorded additions in the last {days} days. Older stock may have no saved date.</p> : <ul className="mt-4 divide-y divide-border border-t border-border">{recent.map((a) => <li key={a.id} className="flex items-start justify-between gap-3 py-3" data-testid={`row-addition-${a.id}`}>
        <span className="min-w-0"><span className="block truncate text-xs font-extrabold">{a.name} · {a.variant}</span><span className="text-[11px] text-muted-foreground">{dateFmt(a.createdAt)} · {a.source === 'scan' ? 'Scan' : a.source === 'initial' ? 'Initial stock' : 'Manual'}</span></span>
        <span className="shrink-0 text-xs font-extrabold text-chart-3">+{a.qty} {a.unit}</span></li>)}</ul>}
    </section>
  </div>;
}
