import { useEffect, useMemo, useState } from 'react';
import { summarizeMoney, type LedgerSale } from './shop-analytics';

const fmt = (v: number) => `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export function MoneyOverview({ sales, start, end, label }: { sales: LedgerSale[]; start: Date; end: Date; label: string }) {
  const s = useMemo(() => summarizeMoney(sales, start, end), [sales, start, end]);
  const total = s.totalBilled;
  const parts = [
    { key: 'cash', name: 'Cash bills', value: s.billedCash, color: 'hsl(var(--primary))', dot: 'bg-primary' },
    { key: 'upi', name: 'UPI bills', value: s.billedUpi, color: 'hsl(var(--chart-3))', dot: 'bg-chart-3' },
    { key: 'credit', name: 'On credit', value: s.creditDue, color: 'hsl(var(--accent))', dot: 'bg-accent' },
  ];
  let acc = 0;
  const stops = parts.map((p) => { const from = acc; acc += total > 0 ? (p.value / total) * 100 : 0; return `${p.color} ${from}% ${acc}%`; }).join(', ');
  const ring = total > 0 ? `conic-gradient(${stops})` : 'conic-gradient(hsl(var(--muted)) 0 100%)';
  const stat = (id: string, title: string, value: number, hint: string, tone = 'text-foreground') => (
    <div className="rounded-xl border border-border bg-card p-3.5" data-testid={`stat-${id}`}>
      <p className="text-[11px] font-bold text-muted-foreground">{title}</p>
      <p className={`mt-1 text-xl font-extrabold tracking-tight ${tone}`}>{fmt(value)}</p>
      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{hint}</p>
    </div>
  );
  return <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-[var(--shadow-sm)] sm:p-6" data-testid="section-money-overview">
    <p className="text-xs font-bold text-muted-foreground">{label}</p>
    <h3 className="mt-1 text-lg font-extrabold">Billed vs. received</h3>
    <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stat('billed', 'Total billed', total, 'All bills made, including credit', 'text-primary')}
      {stat('cash', 'Cash received', s.cashReceived, 'Cash actually taken in')}
      {stat('upi', 'UPI received', s.upiReceived, 'UPI actually taken in')}
      {stat('received', 'Total received', s.received, 'Cash + UPI in hand', 'text-chart-3')}
    </div>
    <div className="mt-4 rounded-xl bg-accent/10 p-3 text-xs font-bold text-accent" data-testid="text-credit-due">Outstanding credit on these bills: {fmt(s.creditDue)}{s.creditIssued > 0 && s.creditIssued !== s.creditDue ? ` (of ${fmt(s.creditIssued)} issued)` : ''}</div>
    <p className="mt-2 text-[11px] leading-5 text-muted-foreground">Received can differ from billed: it counts money collected in this period, including payments on older credit bills, and excludes credit not yet paid.</p>
    <div className="mt-5 flex items-center gap-5">
      <div role="img" aria-label={total > 0 ? `Bills split: ${parts.map((p) => `${p.name} ${fmt(p.value)}`).join(', ')}; total ${fmt(total)}` : 'No bills yet'} className="flex h-32 w-32 shrink-0 items-center justify-center rounded-full" style={{ background: ring }} data-testid="chart-revenue-donut">
        <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-card text-center"><span className="text-[9px] font-bold text-muted-foreground">Billed</span><span className="text-sm font-extrabold">{fmt(total)}</span></div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2.5 text-xs">
        {parts.map((p) => <li key={p.key} className="flex items-center gap-2 font-bold"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${p.dot}`} /><span className="flex-1">{p.name}</span><span className="font-mono-app text-muted-foreground">{fmt(p.value)}</span></li>)}
        {total === 0 && <li className="text-[11px] text-muted-foreground">No bills in this period.</li>}
      </ul>
    </div>
  </section>;
}

export default function TodaySummary({ sales }: { sales: LedgerSale[] }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => tick((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  return <MoneyOverview sales={sales} start={start} end={end} label="Today" />;
}
