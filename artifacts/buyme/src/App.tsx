import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  CircleCheck,
  CircleHelp,
  Download,
  IndianRupee,
  LayoutDashboard,
  Menu,
  MessageCircleMore,
  Minus,
  Moon,
  Package,
  Pencil,
  Phone,
  Plus,
  Printer,
  ReceiptIndianRupee,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Store,
  Sun,
  Trash2,
  X,
} from 'lucide-react';

type Section = 'Billing' | 'Catalog' | 'Insights' | 'Notifications' | 'Broadcast' | 'Settings';
type PaymentMethod = 'Cash' | 'UPI';

type Variant = {
  id: string;
  name: string;
  price: number;
  stock?: number;
  threshold?: number;
  unit: string;
};

type Product = {
  id: string;
  name: string;
  category: string;
  variants: Variant[];
  updatedAt: string;
};

type BillLine = {
  lineId: string;
  productId: string;
  variantId: string;
  name: string;
  variant: string;
  qty: number;
  price: number;
};

type Sale = {
  id: string;
  createdAt: string;
  lines: BillLine[];
  total: number;
  paid: number;
  paymentMethod: PaymentMethod;
  customer?: string;
};

type ShopSettings = {
  shopName: string;
  phone: string;
  upiId: string;
  upiName: string;
  gstEnabled: boolean;
  gstin: string;
  gstRate: number;
  darkMode: boolean;
};

const seedCatalog: Product[] = [
  { id: 'p1', name: 'Aashirvaad Atta', category: 'Grocery', updatedAt: 'Today', variants: [
    { id: 'v1', name: '5 kg', price: 285, stock: 14, threshold: 5, unit: 'bag' },
    { id: 'v2', name: '10 kg', price: 520, stock: 7, threshold: 3, unit: 'bag' },
  ] },
  { id: 'p2', name: 'Tata Salt', category: 'Grocery', updatedAt: 'Today', variants: [
    { id: 'v3', name: '1 kg', price: 28, stock: 34, threshold: 8, unit: 'pack' },
  ] },
  { id: 'p3', name: 'Fortune Sunflower Oil', category: 'Grocery', updatedAt: 'Yesterday', variants: [
    { id: 'v4', name: '1 L', price: 146, stock: 9, threshold: 4, unit: 'bottle' },
    { id: 'v5', name: '5 L', price: 698, stock: 3, threshold: 2, unit: 'jar' },
  ] },
  { id: 'p4', name: 'Thums Up', category: 'Beverages', updatedAt: 'Today', variants: [
    { id: 'v6', name: '750 ml', price: 40, stock: 18, threshold: 6, unit: 'bottle' },
    { id: 'v7', name: '2.25 L', price: 95, stock: 4, threshold: 4, unit: 'bottle' },
  ] },
  { id: 'p5', name: 'Parle-G Biscuits', category: 'Snacks', updatedAt: 'Today', variants: [
    { id: 'v8', name: '800 g', price: 80, stock: 26, threshold: 8, unit: 'pack' },
  ] },
  { id: 'p6', name: 'Nandini Curd', category: 'Dairy', updatedAt: 'Yesterday', variants: [
    { id: 'v9', name: '500 g', price: 32, stock: 2, threshold: 6, unit: 'cup' },
  ] },
  { id: 'p7', name: 'Kurkure Masala Munch', category: 'Snacks', updatedAt: 'Today', variants: [
    { id: 'v10', name: '90 g', price: 20, stock: 21, threshold: 5, unit: 'pack' },
  ] },
  { id: 'p8', name: 'Red Label Tea', category: 'Grocery', updatedAt: '2 days ago', variants: [
    { id: 'v11', name: '250 g', price: 118, stock: 8, threshold: 3, unit: 'pack' },
  ] },
];

const seedSettings: ShopSettings = {
  shopName: 'Sharma General Store',
  phone: '+91 98765 43210',
  upiId: 'sharmastore@upi',
  upiName: 'Sharma General Store',
  gstEnabled: false,
  gstin: '',
  gstRate: 5,
  darkMode: false,
};

const categories = ['All items', 'Grocery', 'Beverages', 'Snacks', 'Dairy'];
const navItems: { label: Section; icon: typeof LayoutDashboard; helper?: string }[] = [
  { label: 'Billing', icon: ReceiptIndianRupee, helper: 'Counter' },
  { label: 'Catalog', icon: Package, helper: 'Products' },
  { label: 'Insights', icon: BarChart3, helper: 'Your numbers' },
  { label: 'Notifications', icon: Bell, helper: 'Keep in the loop' },
  { label: 'Broadcast', icon: MessageCircleMore, helper: 'Reach customers' },
];

function readStore<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function money(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function initials(name: string) {
  return name.split(' ').map((part) => part[0]).slice(0, 2).join('');
}

function App() {
  const [activeSection, setActiveSection] = useState<Section>('Billing');
  const [catalog, setCatalog] = useState<Product[]>(() => readStore('buyme-catalog', seedCatalog));
  const [sales, setSales] = useState<Sale[]>(() => readStore('buyme-sales', []));
  const [settings, setSettings] = useState<ShopSettings>(() => readStore('buyme-settings', seedSettings));
  const [bill, setBill] = useState<BillLine[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All items');
  const [mobileNav, setMobileNav] = useState(false);
  const [productModal, setProductModal] = useState<{ open: boolean; product?: Product }>({ open: false });
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);
  const [toast, setToast] = useState('');
  const [broadcastOpen, setBroadcastOpen] = useState(false);

  useEffect(() => { window.localStorage.setItem('buyme-catalog', JSON.stringify(catalog)); }, [catalog]);
  useEffect(() => { window.localStorage.setItem('buyme-sales', JSON.stringify(sales)); }, [sales]);
  useEffect(() => {
    window.localStorage.setItem('buyme-settings', JSON.stringify(settings));
    document.documentElement.classList.toggle('dark', settings.darkMode);
  }, [settings]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const today = new Date().toDateString();
  const todaySales = useMemo(() => sales.filter((sale) => new Date(sale.createdAt).toDateString() === today), [sales, today]);
  const revenue = todaySales.reduce((sum, sale) => sum + sale.paid, 0);
  const lowStock = useMemo(() => catalog.flatMap((product) => product.variants.map((variant) => ({ product, variant })).filter(({ variant }) => typeof variant.stock === 'number' && variant.stock <= (variant.threshold ?? 0))), [catalog]);
  const billTotal = bill.reduce((sum, line) => sum + line.price * line.qty, 0);
  const filteredProducts = useMemo(() => catalog.filter((product) => {
    const matchesSearch = `${product.name} ${product.category} ${product.variants.map((v) => v.name).join(' ')}`.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (category === 'All items' || product.category === category);
  }), [catalog, search, category]);

  const flash = (message: string) => setToast(message);
  const changeSection = (section: Section) => { setActiveSection(section); setMobileNav(false); };

  const addToBill = (product: Product, variant: Variant) => {
    setBill((current) => {
      const existing = current.find((line) => line.variantId === variant.id);
      if (existing) return current.map((line) => line.lineId === existing.lineId ? { ...line, qty: line.qty + 1 } : line);
      return [...current, { lineId: `${product.id}-${variant.id}`, productId: product.id, variantId: variant.id, name: product.name, variant: variant.name, qty: 1, price: variant.price }];
    });
    flash(`${product.name} added to bill`);
  };

  const adjustBill = (lineId: string, amount: number) => {
    setBill((current) => current.flatMap((line) => line.lineId === lineId
      ? (line.qty + amount > 0 ? [{ ...line, qty: line.qty + amount }] : [])
      : [line]));
  };

  const saveProduct = (product: Product) => {
    setCatalog((current) => current.some((item) => item.id === product.id)
      ? current.map((item) => item.id === product.id ? product : item)
      : [...current, product]);
    setProductModal({ open: false });
    flash(productModal.product ? 'Product details updated' : 'Product added to catalog');
  };

  const deleteProduct = (id: string) => {
    setCatalog((current) => current.filter((product) => product.id !== id));
    setProductModal({ open: false });
    flash('Product removed from catalog');
  };

  const completePayment = (method: PaymentMethod, paid: number, customer?: string) => {
    const sale: Sale = { id: `BM-${Date.now().toString().slice(-6)}`, createdAt: new Date().toISOString(), lines: bill, total: billTotal, paid, paymentMethod: method, customer };
    setSales((current) => [sale, ...current]);
    setCatalog((current) => current.map((product) => ({ ...product, variants: product.variants.map((variant) => {
      const sold = bill.find((line) => line.variantId === variant.id);
      return sold && typeof variant.stock === 'number' ? { ...variant, stock: Math.max(0, variant.stock - sold.qty) } : variant;
    }) })));
    setBill([]);
    setPaymentOpen(false);
    setReceiptSale(sale);
    flash('Payment recorded. Bill is ready.');
  };

  return (
    <div className="buyme-shell min-h-[100dvh] bg-background text-foreground">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col bg-sidebar px-4 py-5 text-sidebar-foreground transition-transform duration-300 lg:translate-x-0 ${mobileNav ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-3">
          <button className="flex items-center gap-3 text-left" onClick={() => changeSection('Billing')} data-testid="button-brand-home">
            <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-sidebar-primary text-lg font-extrabold text-sidebar-primary-foreground shadow-[0_7px_0_hsl(var(--sidebar-primary)/.25)]">B</span>
            <span><span className="block text-[17px] font-extrabold tracking-tight">BUYME</span><span className="block text-[10px] uppercase tracking-[.22em] text-sidebar-foreground/55">shop counter</span></span>
          </button>
          <button className="rounded-lg p-2 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground lg:hidden" onClick={() => setMobileNav(false)} data-testid="button-close-navigation"><X size={18} /></button>
        </div>
        <div className="mt-10 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-sidebar-foreground/40">Workspace</div>
        <nav className="mt-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.label;
            return <button key={item.label} onClick={() => changeSection(item.label)} className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left ${active ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-[0_8px_22px_hsl(var(--sidebar-primary)/.12)]' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`} data-testid={`nav-${item.label.toLowerCase()}`}>
              <Icon size={18} strokeWidth={active ? 2.4 : 1.8} />
              <span className="flex-1"><span className="block text-[13px] font-bold">{item.label}</span><span className={`block text-[10px] ${active ? 'text-sidebar-primary-foreground/65' : 'text-sidebar-foreground/40'}`}>{item.helper}</span></span>
              {item.label === 'Notifications' && lowStock.length > 0 && <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold ${active ? 'bg-sidebar text-sidebar-foreground' : 'bg-accent text-accent-foreground'}`}>{lowStock.length}</span>}
            </button>;
          })}
        </nav>
        <div className="mt-auto">
          <div className="mb-4 rounded-2xl border border-sidebar-border bg-sidebar-accent/60 p-4">
            <div className="flex items-center gap-2 text-sidebar-primary"><Sparkles size={15} /><span className="text-[11px] font-bold uppercase tracking-widest">Counter note</span></div>
            <p className="mt-2 text-[12px] leading-5 text-sidebar-foreground/65">You have <strong className="text-sidebar-foreground">{lowStock.length} stock alerts</strong> waiting today.</p>
            <button className="mt-3 text-[11px] font-bold text-sidebar-primary hover:underline" onClick={() => changeSection('Notifications')} data-testid="button-view-alerts">Review alerts <ArrowUpRight className="ml-1 inline" size={13} /></button>
          </div>
          <button onClick={() => changeSection('Settings')} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left ${activeSection === 'Settings' ? 'bg-sidebar-accent' : 'hover:bg-sidebar-accent'}`} data-testid="nav-settings">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sidebar-foreground/10 text-sidebar-foreground/70"><Settings2 size={17} /></span>
            <span className="flex-1"><span className="block text-[12px] font-bold">Settings</span><span className="block text-[10px] text-sidebar-foreground/45">Shop preferences</span></span>
            <ChevronDown size={15} className="-rotate-90 text-sidebar-foreground/40" />
          </button>
          <div className="mt-5 flex items-center gap-3 border-t border-sidebar-border px-3 pt-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-primary/20 text-xs font-extrabold text-sidebar-primary">{initials(settings.shopName)}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{settings.shopName}</span><span className="block truncate text-[10px] text-sidebar-foreground/45">{settings.phone}</span></span>
          </div>
        </div>
      </aside>

      {mobileNav && <button aria-label="Close menu" className="fixed inset-0 z-30 bg-foreground/30 lg:hidden" onClick={() => setMobileNav(false)} data-testid="button-menu-backdrop" />}
      <main className="min-h-[100dvh] lg:pl-[264px]">
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-border/70 bg-background/90 px-5 backdrop-blur-md sm:px-8 lg:px-10">
          <div className="flex items-center gap-3">
            <button className="rounded-xl border border-border bg-card p-2.5 lg:hidden" onClick={() => setMobileNav(true)} data-testid="button-open-navigation"><Menu size={18} /></button>
            <div><p className="text-[11px] font-bold uppercase tracking-[.17em] text-muted-foreground">{activeSection === 'Billing' ? 'Thursday, 24 October 2024' : 'Shop workspace'}</p><h1 className="mt-0.5 text-lg font-extrabold tracking-tight">{activeSection}</h1></div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <button onClick={() => changeSection('Notifications')} className="relative rounded-xl border border-border bg-card p-2.5 text-muted-foreground hover:border-primary/40 hover:text-primary" data-testid="button-notifications"><Bell size={18} />{lowStock.length > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-accent-foreground">{lowStock.length}</span>}</button>
            <div className="hidden h-8 w-px bg-border sm:block" />
            <div className="hidden items-center gap-2.5 sm:flex"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-extrabold text-primary">{initials(settings.shopName)}</span><span className="text-xs font-bold">{settings.shopName.split(' ')[0]}</span></div>
            <button onClick={() => changeSection('Settings')} className="rounded-xl p-2 text-muted-foreground hover:bg-muted hover:text-foreground sm:hidden" data-testid="button-mobile-settings"><Settings2 size={18} /></button>
          </div>
        </header>

        <div className="mx-auto max-w-[1480px] px-5 pb-24 pt-7 sm:px-8 lg:px-10 lg:pb-10">
          {activeSection === 'Billing' && <BillingView catalog={filteredProducts} search={search} setSearch={setSearch} category={category} setCategory={setCategory} bill={bill} billTotal={billTotal} onAdd={addToBill} onAdjust={adjustBill} onClear={() => { setBill([]); flash('Current bill cleared'); }} onPay={() => setPaymentOpen(true)} onOpenCatalog={() => changeSection('Catalog')} revenue={revenue} billCount={todaySales.length} lowStock={lowStock.length} />}
          {activeSection === 'Catalog' && <CatalogView catalog={catalog} onAdd={() => setProductModal({ open: true })} onEdit={(product) => setProductModal({ open: true, product })} onDelete={deleteProduct} onAddStock={(id, variantId) => setCatalog((current) => current.map((product) => product.id === id ? { ...product, variants: product.variants.map((variant) => variant.id === variantId && typeof variant.stock === 'number' ? { ...variant, stock: variant.stock + 1 } : variant) } : product))} />}
          {activeSection === 'Insights' && <InsightsView sales={sales} catalog={catalog} revenue={revenue} />}
          {activeSection === 'Notifications' && <NotificationsView lowStock={lowStock} sales={sales} onGoCatalog={() => changeSection('Catalog')} />}
          {activeSection === 'Broadcast' && <BroadcastView settings={settings} onOpen={() => setBroadcastOpen(true)} />}
          {activeSection === 'Settings' && <SettingsView settings={settings} onSave={(next) => { setSettings(next); flash('Shop settings saved'); }} />}
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-card/95 px-2 py-2 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-lg justify-around">
          {navItems.slice(0, 4).map((item) => { const Icon = item.icon; return <button key={item.label} onClick={() => changeSection(item.label)} className={`flex min-w-[64px] flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[10px] font-bold ${activeSection === item.label ? 'text-primary' : 'text-muted-foreground'}`} data-testid={`mobile-nav-${item.label.toLowerCase()}`}><Icon size={18} /><span>{item.label}</span></button>; })}
        </div>
      </div>

      {productModal.open && <ProductModal product={productModal.product} onClose={() => setProductModal({ open: false })} onSave={saveProduct} onDelete={deleteProduct} />}
      {paymentOpen && <PaymentModal total={billTotal} lines={bill} onClose={() => setPaymentOpen(false)} onComplete={completePayment} />}
      {receiptSale && <ReceiptModal sale={receiptSale} settings={settings} onClose={() => setReceiptSale(null)} />}
      {broadcastOpen && <BroadcastModal settings={settings} onClose={() => setBroadcastOpen(false)} onDone={(message) => { setBroadcastOpen(false); flash(message); }} />}
      {toast && <div className="fixed bottom-20 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-xl bg-sidebar px-4 py-3 text-xs font-bold text-sidebar-foreground shadow-[0_12px_35px_rgba(36,31,61,.22)] lg:bottom-7" data-testid="status-toast"><CircleCheck size={16} className="text-sidebar-primary" />{toast}</div>}
    </div>
  );
}

function BillingView({ catalog, search, setSearch, category, setCategory, bill, billTotal, onAdd, onAdjust, onClear, onPay, onOpenCatalog, revenue, billCount, lowStock }: { catalog: Product[]; search: string; setSearch: (value: string) => void; category: string; setCategory: (value: string) => void; bill: BillLine[]; billTotal: number; onAdd: (product: Product, variant: Variant) => void; onAdjust: (id: string, amount: number) => void; onClear: () => void; onPay: () => void; onOpenCatalog: () => void; revenue: number; billCount: number; lowStock: number }) {
  return <div className="rise-in">
    <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="mb-1 text-sm font-semibold text-accent">Your counter, made lighter.</p><h2 className="font-display text-[2.35rem] leading-none tracking-tight text-primary sm:text-[2.8rem]">Let’s make a bill.</h2><p className="mt-2 text-sm text-muted-foreground">Find a product, tap add, and keep the queue moving.</p></div><div className="flex items-center gap-2 text-xs font-bold text-muted-foreground"><span className="h-2 w-2 rounded-full bg-chart-3" /> Shop is open <span className="font-mono-app text-[10px] font-normal text-muted-foreground/70">• updated just now</span></div></div>
    <div className="mb-7 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <MetricCard icon={IndianRupee} label="Collected today" value={money(revenue)} note="+12.4% from last Thursday" tone="primary" trend />
      <MetricCard icon={ReceiptIndianRupee} label="Bills made" value={String(billCount).padStart(2, '0')} note="Average bill ₹386" tone="peach" />
      <MetricCard icon={AlertTriangle} label="Stock needs you" value={`${lowStock} items`} note={lowStock ? 'Review before the evening rush' : 'Everything looks healthy'} tone="sand" />
    </div>
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
      <section className="min-w-0 rounded-2xl border border-border/80 bg-card p-4 shadow-[var(--shadow-sm)] sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-base font-extrabold">Quick add</h3><p className="mt-1 text-xs text-muted-foreground">Popular items from your catalog</p></div><div className="relative w-full sm:w-[250px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search items or variants" className="h-10 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-xs font-semibold outline-none placeholder:text-muted-foreground/70 focus:border-primary" data-testid="input-search-products" /></div></div>
        <div className="no-scrollbar mt-5 flex gap-2 overflow-x-auto pb-1">{categories.map((item) => <button key={item} onClick={() => setCategory(item)} className={`whitespace-nowrap rounded-full border px-3.5 py-2 text-[11px] font-bold ${category === item ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-primary'}`} data-testid={`filter-category-${item.toLowerCase().replace(' ', '-')}`}>{item}</button>)}</div>
        {catalog.length === 0 ? <EmptyState icon={ShoppingBag} title="No products found" description="Try a different search or add this item to your catalog." action="Open catalog" onAction={onOpenCatalog} /> : <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">{catalog.map((product) => <ProductQuickCard key={product.id} product={product} onAdd={onAdd} />)}</div>}
      </section>
      <BillPanel bill={bill} total={billTotal} onAdjust={onAdjust} onClear={onClear} onPay={onPay} />
    </div>
  </div>;
}

function MetricCard({ icon: Icon, label, value, note, tone, trend }: { icon: typeof IndianRupee; label: string; value: string; note: string; tone: 'primary' | 'peach' | 'sand'; trend?: boolean }) {
  const tones = { primary: 'bg-primary text-primary-foreground', peach: 'bg-accent/12 text-accent-foreground', sand: 'bg-chart-4/20 text-foreground' };
  return <div className={`rounded-2xl border border-border/70 p-4 ${tones[tone]}`}><div className="flex items-start justify-between"><div className={`flex h-8 w-8 items-center justify-center rounded-lg ${tone === 'primary' ? 'bg-primary-foreground/15' : 'bg-card/70'}`}><Icon size={16} /></div>{trend && <span className="flex items-center gap-1 text-[10px] font-extrabold text-primary-foreground/70"><ArrowUpRight size={13} /> 12.4%</span>}</div><div className="mt-4 text-[11px] font-bold opacity-70">{label}</div><div className="mt-0.5 text-2xl font-extrabold tracking-tight">{value}</div><div className="mt-1 text-[10px] font-semibold opacity-65">{note}</div></div>;
}

function ProductQuickCard({ product, onAdd }: { product: Product; onAdd: (product: Product, variant: Variant) => void }) {
  return <div className="rounded-xl border border-border/70 bg-background p-3.5 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[var(--shadow-sm)]"><div className="flex items-start justify-between gap-2"><div><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{product.category}</span><h4 className="mt-1 text-sm font-extrabold">{product.name}</h4></div><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/8 text-primary"><Package size={15} /></span></div><div className="mt-3 space-y-2">{product.variants.map((variant) => <div key={variant.id} className="flex items-center gap-2"><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="truncate text-[11px] font-semibold text-muted-foreground">{variant.name} <span className="font-mono-app text-[9px] opacity-60">/ {variant.unit}</span></span><span className="text-xs font-extrabold">{money(variant.price)}</span></div><div className={`mt-1 text-[10px] font-semibold ${typeof variant.stock === 'number' && variant.stock <= (variant.threshold ?? 0) ? 'text-accent' : 'text-muted-foreground/65'}`}>{typeof variant.stock === 'number' ? `${variant.stock} in stock` : 'Stock not tracked'}</div></div><button onClick={() => onAdd(product, variant)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90" data-testid={`button-add-${variant.id}`} aria-label={`Add ${product.name} ${variant.name}`}><Plus size={16} /></button></div>)}</div></div>;
}

function BillPanel({ bill, total, onAdjust, onClear, onPay }: { bill: BillLine[]; total: number; onAdjust: (id: string, amount: number) => void; onClear: () => void; onPay: () => void }) {
  return <section className="flex min-h-[530px] flex-col overflow-hidden rounded-2xl border border-primary/15 bg-primary text-primary-foreground shadow-[0_18px_45px_hsl(var(--primary)/.15)]"><div className="flex items-center justify-between border-b border-primary-foreground/12 px-5 py-4"><div><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-sidebar-primary" /><h3 className="text-base font-extrabold">Current bill</h3></div><p className="mt-1 text-[11px] text-primary-foreground/55">Bill #{bill.length ? 'BM-' + String(Date.now()).slice(-4) : 'waiting'} · saved locally</p></div>{bill.length > 0 && <button onClick={onClear} className="text-[11px] font-bold text-primary-foreground/55 hover:text-primary-foreground" data-testid="button-clear-bill">Clear all</button>}</div>{bill.length === 0 ? <div className="flex flex-1 flex-col items-center justify-center px-8 text-center"><div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-primary-foreground/15 bg-primary-foreground/8"><ReceiptIndianRupee size={28} className="text-sidebar-primary" /></div><h4 className="mt-5 text-base font-bold">Your bill is ready</h4><p className="mt-2 max-w-[220px] text-xs leading-5 text-primary-foreground/55">Tap the plus on any item to start. It will appear here instantly.</p><div className="mt-5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-sidebar-primary"><CircleHelp size={13} /> No paper needed</div></div> : <><div className="flex-1 space-y-1 overflow-y-auto px-4 py-4">{bill.map((line) => <div key={line.lineId} className="flex items-center gap-2 rounded-xl bg-primary-foreground/7 px-3 py-3"><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{line.name}</p><p className="mt-0.5 text-[10px] text-primary-foreground/55">{line.variant} · {money(line.price)} each</p></div><div className="flex items-center gap-1 rounded-lg border border-primary-foreground/12 bg-primary-foreground/8 p-1"><button onClick={() => onAdjust(line.lineId, -1)} className="flex h-5 w-5 items-center justify-center rounded text-primary-foreground/65 hover:bg-primary-foreground/10" data-testid={`button-decrease-${line.lineId}`}><Minus size={12} /></button><span className="w-5 text-center text-[11px] font-bold">{line.qty}</span><button onClick={() => onAdjust(line.lineId, 1)} className="flex h-5 w-5 items-center justify-center rounded text-primary-foreground/65 hover:bg-primary-foreground/10" data-testid={`button-increase-${line.lineId}`}><Plus size={12} /></button></div><span className="w-14 text-right text-xs font-extrabold">{money(line.price * line.qty)}</span><button onClick={() => onAdjust(line.lineId, -line.qty)} className="p-1 text-primary-foreground/35 hover:text-sidebar-primary" data-testid={`button-remove-${line.lineId}`}><Trash2 size={14} /></button></div>)}</div><div className="border-t border-primary-foreground/12 p-5"><div className="flex items-center justify-between text-xs text-primary-foreground/60"><span>Subtotal</span><span>{money(total)}</span></div><div className="mt-2 flex items-end justify-between"><span className="text-sm font-bold">To collect</span><span className="text-3xl font-extrabold tracking-tight">{money(total)}</span></div><button onClick={onPay} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-sidebar-primary font-extrabold text-sidebar-primary-foreground shadow-[0_6px_0_hsl(var(--sidebar-primary)/.25)] hover:brightness-105" data-testid="button-collect-payment">Collect payment <ArrowUpRight size={17} /></button></div></>}</section>;
}

function CatalogView({ catalog, onAdd, onEdit, onDelete, onAddStock }: { catalog: Product[]; onAdd: () => void; onEdit: (product: Product) => void; onDelete: (id: string) => void; onAddStock: (id: string, variantId: string) => void }) {
  return <div className="rise-in"><div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-1 text-sm font-semibold text-accent">Keep the shelf honest.</p><h2 className="font-display text-[2.35rem] leading-none tracking-tight text-primary">Your catalog.</h2><p className="mt-2 text-sm text-muted-foreground">Prices, variants and stock in one calm view.</p></div><button onClick={onAdd} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-xs font-extrabold text-primary-foreground shadow-[0_5px_0_hsl(var(--primary)/.18)] hover:brightness-110" data-testid="button-add-product"><Plus size={17} /> Add product</button></div><div className="mb-5 flex flex-wrap items-center gap-2"><span className="rounded-full bg-primary/8 px-3 py-1.5 text-[11px] font-bold text-primary">{catalog.length} products</span><span className="rounded-full bg-chart-3/12 px-3 py-1.5 text-[11px] font-bold text-chart-3">{catalog.reduce((sum, p) => sum + p.variants.length, 0)} variants tracked</span><span className="rounded-full bg-accent/12 px-3 py-1.5 text-[11px] font-bold text-accent">{catalog.flatMap((p) => p.variants).filter((v) => typeof v.stock === 'number' && v.stock <= (v.threshold ?? 0)).length} low stock</span></div><section className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[var(--shadow-sm)]"><div className="hidden grid-cols-[minmax(220px,1fr)_130px_1fr_90px_110px] gap-4 border-b border-border bg-muted/45 px-5 py-3 text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground md:grid"><span>Product</span><span>Category</span><span>Variants & pricing</span><span>Stock</span><span className="text-right">Actions</span></div>{catalog.map((product) => <div key={product.id} className="grid gap-3 border-b border-border/70 px-5 py-4 last:border-0 md:grid-cols-[minmax(220px,1fr)_130px_1fr_90px_110px] md:items-center md:gap-4"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/8 text-sm font-extrabold text-primary">{initials(product.name)}</span><div><p className="text-sm font-extrabold">{product.name}</p><p className="mt-0.5 text-[10px] text-muted-foreground">Updated {product.updatedAt}</p></div></div><div><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground md:hidden">Category · </span><span className="text-xs font-semibold">{product.category}</span></div><div className="space-y-2">{product.variants.map((variant) => <div key={variant.id} className="flex items-center justify-between gap-3 rounded-lg bg-background px-2.5 py-2"><span className="text-xs font-semibold">{variant.name} <span className="text-[10px] text-muted-foreground">/ {variant.unit}</span></span><span className="font-mono-app text-[11px] font-medium">{money(variant.price)}</span></div>)}</div><div className="flex flex-wrap gap-1">{product.variants.map((variant) => <span key={variant.id} className={`rounded-full px-2 py-1 text-[10px] font-bold ${typeof variant.stock !== 'number' ? 'bg-muted text-muted-foreground' : variant.stock <= (variant.threshold ?? 0) ? 'bg-accent/14 text-accent' : 'bg-chart-3/12 text-chart-3'}`}>{typeof variant.stock === 'number' ? `${variant.stock} ${variant.unit}` : '—'}</span>)}</div><div className="flex items-center justify-start gap-1 md:justify-end"><button onClick={() => onEdit(product)} className="rounded-lg p-2 text-muted-foreground hover:bg-primary/8 hover:text-primary" data-testid={`button-edit-product-${product.id}`}><Pencil size={15} /></button><button onClick={() => onDelete(product.id)} className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid={`button-delete-product-${product.id}`}><Trash2 size={15} /></button>{product.variants[0] && typeof product.variants[0].stock === 'number' && <button onClick={() => onAddStock(product.id, product.variants[0].id)} className="rounded-lg border border-border px-2 py-1.5 text-[10px] font-bold text-muted-foreground hover:border-primary hover:text-primary" data-testid={`button-restock-product-${product.id}`}>+ stock</button>}</div></div>)}</section></div>;
}

function InsightsView({ sales, catalog, revenue }: { sales: Sale[]; catalog: Product[]; revenue: number }) {
  const productTotals = useMemo(() => Object.entries(sales.flatMap((sale) => sale.lines).reduce<Record<string, number>>((acc, line) => { acc[line.name] = (acc[line.name] ?? 0) + line.qty; return acc; }, {})).sort((a, b) => b[1] - a[1]), [sales]);
  const cash = sales.filter((sale) => sale.paymentMethod === 'Cash').reduce((sum, sale) => sum + sale.paid, 0);
  const upi = sales.filter((sale) => sale.paymentMethod === 'UPI').reduce((sum, sale) => sum + sale.paid, 0);
  const stockValue = catalog.flatMap((product) => product.variants).reduce((sum, variant) => sum + (variant.stock ?? 0) * variant.price, 0);
  const week = [34, 46, 39, 57, 49, 67, 52];
  return <div className="rise-in"><div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-1 text-sm font-semibold text-accent">A little clarity, every day.</p><h2 className="font-display text-[2.35rem] leading-none tracking-tight text-primary">What’s moving.</h2><p className="mt-2 text-sm text-muted-foreground">A simple read on this week at {catalog.length ? 'your shop' : 'the shop'}.</p></div><button className="flex items-center gap-2 self-start rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs font-bold text-muted-foreground hover:border-primary/30 hover:text-primary" data-testid="button-insights-range"><CalendarDays size={15} /> Last 7 days <ChevronDown size={14} /></button></div><div className="grid gap-4 lg:grid-cols-[1.25fr_.75fr]"><section className="rounded-2xl border border-border/80 bg-primary p-5 text-primary-foreground shadow-[0_16px_36px_hsl(var(--primary)/.14)] sm:p-6"><div className="flex items-start justify-between"><div><p className="text-xs font-bold text-primary-foreground/60">Collected revenue</p><p className="mt-2 text-4xl font-extrabold tracking-tight">{money(revenue || 28460)}</p><p className="mt-2 flex items-center gap-1 text-xs font-bold text-sidebar-primary"><ArrowUpRight size={14} /> 8.7% compared to last week</p></div><span className="rounded-xl bg-primary-foreground/10 p-3 text-sidebar-primary"><BarChart3 size={20} /></span></div><div className="mt-8 flex h-28 items-end gap-2 sm:gap-4">{week.map((height, index) => <div key={index} className="flex flex-1 flex-col items-center gap-2"><div className={`w-full rounded-t-md ${index === 5 ? 'bg-sidebar-primary' : 'bg-primary-foreground/20'}`} style={{ height: `${height}%` }} /><span className="text-[9px] font-mono-app text-primary-foreground/45">{['M', 'T', 'W', 'T', 'F', 'S', 'S'][index]}</span></div>)}</div></section><section className="rounded-2xl border border-border/80 bg-card p-5 shadow-[var(--shadow-sm)] sm:p-6"><p className="text-xs font-bold text-muted-foreground">Payment mix</p><div className="mt-5 flex items-center gap-5"><div className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(hsl(var(--primary)) 0 58%, hsl(var(--accent)) 58% 100%)` }}><div className="flex h-20 w-20 items-center justify-center rounded-full bg-card text-center"><span className="text-lg font-extrabold">₹</span></div></div><div className="space-y-4 text-xs"><div><div className="flex items-center gap-2 font-bold"><span className="h-2.5 w-2.5 rounded-full bg-primary" /> UPI <span className="ml-2 font-mono-app text-muted-foreground">{money(upi || 16500)}</span></div><p className="ml-4 mt-1 text-[10px] text-muted-foreground">58% of collected</p></div><div><div className="flex items-center gap-2 font-bold"><span className="h-2.5 w-2.5 rounded-full bg-accent" /> Cash <span className="ml-2 font-mono-app text-muted-foreground">{money(cash || 11960)}</span></div><p className="ml-4 mt-1 text-[10px] text-muted-foreground">42% of collected</p></div></div></div></section></div><div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr]"><section className="rounded-2xl border border-border/80 bg-card p-5 shadow-[var(--shadow-sm)] sm:p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-bold text-muted-foreground">Top sellers</p><h3 className="mt-1 text-lg font-extrabold">Customers came for these</h3></div><span className="rounded-lg bg-chart-3/12 px-2 py-1 text-[10px] font-bold text-chart-3">This week</span></div><div className="mt-5 space-y-4">{(productTotals.length ? productTotals.slice(0, 4) : [['Aashirvaad Atta', 42], ['Thums Up', 31], ['Tata Salt', 24]] as [string, number][]).map(([name, amount], index) => <div key={name} className="flex items-center gap-3"><span className="font-mono-app text-[10px] text-muted-foreground">0{index + 1}</span><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/8 text-[10px] font-extrabold text-primary">{initials(name)}</span><span className="flex-1 text-xs font-bold">{name}</span><span className="text-xs font-extrabold">{amount} sold</span><div className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-muted sm:block"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(25, 100 - index * 17)}%` }} /></div></div>)}</div></section><section className="rounded-2xl border border-border/80 bg-card p-5 shadow-[var(--shadow-sm)] sm:p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-bold text-muted-foreground">Inventory snapshot</p><h3 className="mt-1 text-lg font-extrabold">Worth keeping an eye on</h3></div><span className="rounded-lg bg-chart-4/20 px-2 py-1 text-[10px] font-bold">{money(stockValue || 18640)} value</span></div><div className="mt-5 space-y-3">{catalog.flatMap((product) => product.variants.map((variant) => ({ product, variant }))).filter(({ variant }) => typeof variant.stock === 'number' && variant.stock <= (variant.threshold ?? 0)).slice(0, 3).map(({ product, variant }) => <div key={variant.id} className="flex items-center gap-3 rounded-xl bg-accent/7 p-3"><AlertTriangle size={16} className="text-accent" /><div className="flex-1"><p className="text-xs font-bold">{product.name}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{variant.name} · threshold {variant.threshold}</p></div><span className="font-mono-app text-xs font-bold text-accent">{variant.stock} left</span></div>)}{catalog.flatMap((product) => product.variants).every((v) => typeof v.stock !== 'number' || v.stock > (v.threshold ?? 0)) && <div className="rounded-xl bg-chart-3/10 p-4 text-xs font-bold text-chart-3">No urgent stock alerts. Nice work.</div>}</div></section></div></div>;
}

function NotificationsView({ lowStock, sales, onGoCatalog }: { lowStock: { product: Product; variant: Variant }[]; sales: Sale[]; onGoCatalog: () => void }) {
  return <div className="rise-in"><div className="mb-7"><p className="mb-1 text-sm font-semibold text-accent">The useful kind of noise.</p><h2 className="font-display text-[2.35rem] leading-none tracking-tight text-primary">Notifications.</h2><p className="mt-2 text-sm text-muted-foreground">Small nudges to help the shop stay ready.</p></div><div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><section className="rounded-2xl border border-border/80 bg-card p-5 shadow-[var(--shadow-sm)] sm:p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-accent">Needs attention</p><h3 className="mt-1 text-xl font-extrabold">Stock alerts</h3></div><span className="rounded-full bg-accent/12 px-3 py-1 text-[11px] font-bold text-accent">{lowStock.length} open</span></div>{lowStock.length === 0 ? <EmptyState icon={CircleCheck} title="Shelf looks good" description="No products have crossed their low-stock threshold." action="View catalog" onAction={onGoCatalog} /> : <div className="mt-5 space-y-2">{lowStock.map(({ product, variant }) => <div key={variant.id} className="flex items-center gap-3 rounded-xl border border-accent/15 bg-accent/6 p-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/12 text-accent"><AlertTriangle size={16} /></span><div className="flex-1"><p className="text-xs font-bold">{product.name}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{variant.name} · reorder at {variant.threshold} {variant.unit}s</p></div><span className="text-right"><strong className="block text-sm font-extrabold text-accent">{variant.stock}</strong><small className="text-[9px] font-bold text-muted-foreground">left</small></span></div>)}<button onClick={onGoCatalog} className="mt-4 text-xs font-bold text-primary hover:underline" data-testid="button-notification-catalog">Open catalog to restock <ArrowUpRight className="ml-1 inline" size={13} /></button></div>}</section><section className="rounded-2xl border border-border/80 bg-primary p-5 text-primary-foreground shadow-[0_16px_36px_hsl(var(--primary)/.14)] sm:p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-bold text-primary-foreground/55">Weekly pulse</p><h3 className="mt-1 text-xl font-extrabold">Your shop is moving.</h3></div><span className="rounded-xl bg-sidebar-primary p-2 text-sidebar-primary-foreground"><BarChart3 size={17} /></span></div><p className="mt-8 font-display text-3xl leading-tight">“{sales.length ? 'More bills, more rhythm.' : 'A fresh week starts with one bill.'}”</p><div className="mt-8 border-t border-primary-foreground/12 pt-4"><div className="flex items-center justify-between text-xs"><span className="text-primary-foreground/60">Busiest hour</span><span className="font-bold">6:00 – 8:00 pm</span></div><div className="mt-3 flex items-center justify-between text-xs"><span className="text-primary-foreground/60">Most used payment</span><span className="font-bold">UPI <span className="text-sidebar-primary">58%</span></span></div></div></section></div></div>;
}

function BroadcastView({ settings, onOpen }: { settings: ShopSettings; onOpen: () => void }) {
  return <div className="rise-in"><div className="mb-7"><p className="mb-1 text-sm font-semibold text-accent">A friendly tap on the shoulder.</p><h2 className="font-display text-[2.35rem] leading-none tracking-tight text-primary">Broadcast.</h2><p className="mt-2 text-sm text-muted-foreground">Let customers know what’s fresh, useful or worth a visit.</p></div><div className="grid gap-5 lg:grid-cols-[1fr_360px]"><section className="rounded-2xl border border-border/80 bg-card p-5 shadow-[var(--shadow-sm)] sm:p-7"><div className="max-w-lg"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-chart-3/12 text-chart-3"><MessageCircleMore size={24} /></span><h3 className="mt-6 font-display text-3xl text-primary">Your customers are already listening.</h3><p className="mt-3 text-sm leading-6 text-muted-foreground">Save numbers as you go and send a thoughtful WhatsApp note when new stock arrives, prices change, or festival days are near.</p><button onClick={onOpen} className="mt-6 flex h-11 items-center gap-2 rounded-xl bg-chart-3 px-4 text-xs font-extrabold text-white hover:brightness-105" data-testid="button-start-broadcast"><Send size={16} /> Start a broadcast</button></div></section><section className="rounded-2xl border border-border/80 bg-card p-5 shadow-[var(--shadow-sm)]"><p className="text-xs font-bold text-muted-foreground">Your broadcast profile</p><div className="mt-5 flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-sm font-extrabold text-primary">{initials(settings.shopName)}</span><div><p className="text-sm font-extrabold">{settings.shopName}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{settings.phone}</p></div></div><div className="mt-6 rounded-xl bg-muted/50 p-3.5 text-xs leading-5 text-muted-foreground">Tip: Keep it personal and useful. A short note about fresh stock works better than a long offer list.</div></section></div></div>;
}

function SettingsView({ settings, onSave }: { settings: ShopSettings; onSave: (settings: ShopSettings) => void }) {
  const [form, setForm] = useState(settings);
  useEffect(() => setForm(settings), [settings]);
  return <div className="rise-in"><div className="mb-7"><p className="mb-1 text-sm font-semibold text-accent">Make it yours.</p><h2 className="font-display text-[2.35rem] leading-none tracking-tight text-primary">Settings.</h2><p className="mt-2 text-sm text-muted-foreground">A few details make every bill feel like your shop.</p></div><div className="grid gap-5 xl:grid-cols-[1fr_380px]"><section className="rounded-2xl border border-border/80 bg-card p-5 shadow-[var(--shadow-sm)] sm:p-7"><div className="border-b border-border pb-5"><h3 className="text-lg font-extrabold">Shop details</h3><p className="mt-1 text-xs text-muted-foreground">Shown on receipts and customer messages.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Shop name"><input value={form.shopName} onChange={(e) => setForm({ ...form, shopName: e.target.value })} className="field" data-testid="input-shop-name" /></Field><Field label="Phone number"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="field" data-testid="input-shop-phone" /></Field></div></div><div className="border-b border-border py-5"><h3 className="text-lg font-extrabold">Payments</h3><p className="mt-1 text-xs text-muted-foreground">Your UPI details can be printed on receipts.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="UPI ID"><input value={form.upiId} onChange={(e) => setForm({ ...form, upiId: e.target.value })} className="field" data-testid="input-upi-id" /></Field><Field label="Display name"><input value={form.upiName} onChange={(e) => setForm({ ...form, upiName: e.target.value })} className="field" data-testid="input-upi-name" /></Field></div></div><div className="border-b border-border py-5"><div className="flex items-center justify-between"><div><h3 className="text-lg font-extrabold">GST invoices</h3><p className="mt-1 text-xs text-muted-foreground">Add tax details to your receipts when needed.</p></div><button onClick={() => setForm({ ...form, gstEnabled: !form.gstEnabled })} className={`relative h-6 w-11 rounded-full ${form.gstEnabled ? 'bg-primary' : 'bg-muted-foreground/25'}`} data-testid="toggle-gst"><span className={`absolute top-1 h-4 w-4 rounded-full bg-card transition-transform ${form.gstEnabled ? 'translate-x-6' : 'translate-x-1'}`} /></button></div>{form.gstEnabled && <div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="GSTIN"><input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} className="field" placeholder="22AAAAA0000A1Z5" data-testid="input-gstin" /></Field><Field label="GST rate"><select value={form.gstRate} onChange={(e) => setForm({ ...form, gstRate: Number(e.target.value) })} className="field" data-testid="select-gst-rate"><option value={5}>5%</option><option value={12}>12%</option><option value={18}>18%</option></select></Field></div>}</div><div className="flex flex-col justify-between gap-4 pt-5 sm:flex-row sm:items-center"><div><h3 className="text-sm font-extrabold">Night mode</h3><p className="mt-1 text-xs text-muted-foreground">Easier on the eyes after sunset.</p></div><button onClick={() => setForm({ ...form, darkMode: !form.darkMode })} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-bold hover:border-primary/30" data-testid="button-toggle-theme">{form.darkMode ? <Moon size={15} /> : <Sun size={15} />} {form.darkMode ? 'Dark' : 'Light'} mode</button></div><button onClick={() => onSave(form)} className="mt-7 flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-xs font-extrabold text-primary-foreground hover:brightness-110" data-testid="button-save-settings"><Check size={16} /> Save changes</button></section><aside className="space-y-5"><div className="rounded-2xl border border-primary/15 bg-primary p-5 text-primary-foreground"><ShieldCheck size={22} className="text-sidebar-primary" /><h3 className="mt-4 text-lg font-extrabold">Private by default.</h3><p className="mt-2 text-xs leading-5 text-primary-foreground/60">BUYME keeps your catalog and sales on this device. Nothing leaves your counter unless you choose to share it.</p></div><div className="rounded-2xl border border-border/80 bg-card p-5 shadow-[var(--shadow-sm)]"><p className="text-xs font-bold text-muted-foreground">Need a hand?</p><div className="mt-4 flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-chart-4/20 text-foreground"><CircleHelp size={17} /></span><div><p className="text-xs font-bold">Quick help</p><p className="mt-0.5 text-[10px] text-muted-foreground">Made for busy counters</p></div></div></div></aside></div></div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>{children}</label>;
}

function ProductModal({ product, onClose, onSave, onDelete }: { product?: Product; onClose: () => void; onSave: (product: Product) => void; onDelete: (id: string) => void }) {
  const [form, setForm] = useState<Product>(product ?? { id: `p${Date.now()}`, name: '', category: 'Grocery', updatedAt: 'Just now', variants: [{ id: `v${Date.now()}`, name: '', price: 0, stock: 0, threshold: 0, unit: 'piece' }] });
  const updateVariant = (id: string, patch: Partial<Variant>) => setForm({ ...form, variants: form.variants.map((variant) => variant.id === id ? { ...variant, ...patch } : variant) });
  return <Modal title={product ? 'Edit product' : 'Add a product'} onClose={onClose}><div className="space-y-4"><Field label="Product name"><input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Nescafé Classic" className="field" data-testid="input-product-name" /></Field><Field label="Category"><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="field" data-testid="select-product-category">{categories.slice(1).map((item) => <option key={item}>{item}</option>)}<option>Other</option></select></Field><div><div className="mb-2 flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Variants</span><button onClick={() => setForm({ ...form, variants: [...form.variants, { id: `v${Date.now()}`, name: '', price: 0, stock: 0, threshold: 0, unit: 'piece' }] })} className="flex items-center gap-1 text-[11px] font-bold text-primary" data-testid="button-add-variant"><Plus size={13} /> Add variant</button></div><div className="space-y-2">{form.variants.map((variant, index) => <div key={variant.id} className="rounded-xl border border-border bg-background p-3"><div className="grid grid-cols-[1fr_86px] gap-2"><input value={variant.name} onChange={(e) => updateVariant(variant.id, { name: e.target.value })} placeholder={index === 0 ? 'Standard' : 'Size'} className="field" data-testid={`input-variant-name-${index}`} /><input type="number" value={variant.price} onChange={(e) => updateVariant(variant.id, { price: Number(e.target.value) })} placeholder="Price" className="field" data-testid={`input-variant-price-${index}`} /></div><div className="mt-2 grid grid-cols-3 gap-2"><input value={variant.unit} onChange={(e) => updateVariant(variant.id, { unit: e.target.value })} placeholder="Unit" className="field" data-testid={`input-variant-unit-${index}`} /><input type="number" value={variant.stock ?? ''} onChange={(e) => updateVariant(variant.id, { stock: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="Stock" className="field" data-testid={`input-variant-stock-${index}`} /><input type="number" value={variant.threshold ?? ''} onChange={(e) => updateVariant(variant.id, { threshold: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="Alert at" className="field" data-testid={`input-variant-threshold-${index}`} /></div></div>)}</div></div></div><div className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-4">{product ? <button onClick={() => onDelete(product.id)} className="text-xs font-bold text-destructive hover:underline" data-testid="button-modal-delete">Delete product</button> : <span />}{<button onClick={() => onSave({ ...form, name: form.name.trim() || 'Untitled product' })} className="flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-extrabold text-primary-foreground hover:brightness-110" data-testid="button-save-product"><Check size={15} /> Save product</button>}</div></Modal>;
}

function PaymentModal({ total, lines, onClose, onComplete }: { total: number; lines: BillLine[]; onClose: () => void; onComplete: (method: PaymentMethod, paid: number, customer?: string) => void }) {
  const [method, setMethod] = useState<PaymentMethod>('UPI');
  const [paid, setPaid] = useState(String(total));
  const [customer, setCustomer] = useState('');
  const paidValue = Math.min(total, Math.max(0, Number(paid) || 0));
  return <Modal title="Collect payment" onClose={onClose} wide><div className="grid gap-5 md:grid-cols-[1fr_250px]"><div><div className="rounded-xl bg-muted/55 p-4"><div className="flex items-center justify-between text-xs text-muted-foreground"><span>{lines.length} line items</span><span>Amount due</span></div><div className="mt-1 flex items-end justify-between"><span className="text-3xl font-extrabold text-primary">{money(total)}</span><span className="text-xs font-bold">{paidValue < total ? `${money(total - paidValue)} pending` : 'Full amount'}</span></div></div><div className="mt-5"><span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">How did they pay?</span><div className="grid grid-cols-2 gap-2"><button onClick={() => setMethod('UPI')} className={`flex items-center justify-center gap-2 rounded-xl border py-3 text-xs font-extrabold ${method === 'UPI' ? 'border-primary bg-primary/8 text-primary' : 'border-border text-muted-foreground'}`} data-testid="button-payment-upi"><Smartphone size={16} /> UPI</button><button onClick={() => setMethod('Cash')} className={`flex items-center justify-center gap-2 rounded-xl border py-3 text-xs font-extrabold ${method === 'Cash' ? 'border-primary bg-primary/8 text-primary' : 'border-border text-muted-foreground'}`} data-testid="button-payment-cash"><Banknote size={16} /> Cash</button></div></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Amount received"><div className="relative"><IndianRupee size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input type="number" min="0" value={paid} onChange={(e) => setPaid(e.target.value)} className="field pl-8" data-testid="input-payment-amount" /></div></Field><Field label="Customer number (optional)"><input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="+91 98..." className="field" data-testid="input-payment-customer" /></Field></div></div><div className="flex flex-col rounded-xl border border-border bg-background p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Payment note</p><p className="mt-4 text-sm font-bold leading-6">The bill will be saved on this device and stock will update automatically.</p><div className="mt-auto border-t border-border pt-4 text-[10px] leading-4 text-muted-foreground"><ShieldCheck className="mb-1 text-chart-3" size={16} /> You can print a receipt right after saving.</div></div></div><div className="mt-6 flex justify-end gap-2 border-t border-border pt-4"><button onClick={onClose} className="rounded-xl px-4 py-2.5 text-xs font-bold text-muted-foreground hover:bg-muted" data-testid="button-cancel-payment">Not yet</button><button onClick={() => onComplete(method, paidValue, customer || undefined)} disabled={!total || paidValue <= 0} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40" data-testid="button-confirm-payment"><Check size={15} /> Save payment</button></div></Modal>;
}

function ReceiptModal({ sale, settings, onClose }: { sale: Sale; settings: ShopSettings; onClose: () => void }) {
  return <Modal title="Payment confirmed" onClose={onClose}><div className="receipt-paper print-receipt rounded-xl border border-border p-5"><div className="text-center"><div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-lg font-extrabold text-primary-foreground">B</div><h3 className="mt-3 text-lg font-extrabold">{settings.shopName}</h3><p className="text-[10px] text-slate-500">{settings.phone}</p><p className="mt-3 border-y border-dashed border-slate-300 py-2 font-mono text-[10px] text-slate-500">{sale.id} · {dateLabel(sale.createdAt)}</p></div><div className="mt-4 space-y-2">{sale.lines.map((line) => <div key={line.lineId} className="flex justify-between gap-3 text-xs"><span>{line.name} <small className="text-slate-500">× {line.qty}</small></span><span className="font-mono">{money(line.price * line.qty)}</span></div>)}</div><div className="mt-4 border-t border-slate-300 pt-3"><div className="flex justify-between text-sm font-extrabold"><span>Total</span><span>{money(sale.total)}</span></div><div className="mt-1 flex justify-between text-[10px] text-slate-500"><span>{sale.paymentMethod} payment</span><span>Received {money(sale.paid)}</span></div>{settings.upiId && <p className="mt-4 text-center text-[10px] text-slate-500">Thank you for shopping with us</p>}</div></div><div className="mt-5 flex gap-2"><button onClick={() => window.print()} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-xs font-bold hover:border-primary hover:text-primary" data-testid="button-print-receipt"><Printer size={15} /> Print</button><button onClick={() => { const blob = new Blob([`${settings.shopName}\n${sale.id}\nTotal: ${money(sale.total)}\nPaid: ${money(sale.paid)} via ${sale.paymentMethod}`], { type: 'text/plain' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${sale.id}.txt`; anchor.click(); URL.revokeObjectURL(url); }} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-xs font-extrabold text-primary-foreground" data-testid="button-download-receipt"><Download size={15} /> Download</button></div></Modal>;
}

function BroadcastModal({ settings, onClose, onDone }: { settings: ShopSettings; onClose: () => void; onDone: (message: string) => void }) {
  const [number, setNumber] = useState('');
  const [message, setMessage] = useState(`Hello from ${settings.shopName}! Fresh stock is in today. Drop by when you're nearby.`);
  const send = () => {
    if (!number.trim()) return;
    window.open(`https://wa.me/${number.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    onDone('WhatsApp message prepared');
  };
  return <Modal title="Start a broadcast" onClose={onClose}><div className="space-y-4"><div className="rounded-xl bg-chart-3/10 p-3 text-xs leading-5 text-chart-3"><MessageCircleMore className="mb-1" size={16} /> WhatsApp will open with your message ready. BUYME never sends it without you.</div><Field label="Customer phone number"><div className="relative"><Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input autoFocus value={number} onChange={(e) => setNumber(e.target.value)} placeholder="+91 98765 43210" className="field pl-8" data-testid="input-broadcast-number" /></div></Field><Field label="Message"><textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} className="field resize-none leading-5" data-testid="input-broadcast-message" /></Field><button onClick={send} disabled={!number.trim()} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-chart-3 text-xs font-extrabold text-white disabled:opacity-40" data-testid="button-send-broadcast"><Send size={16} /> Open WhatsApp</button></div></Modal>;
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 p-0 backdrop-blur-sm sm:items-center sm:p-4"><div className={`max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card p-5 shadow-[0_25px_70px_rgba(36,31,61,.2)] sm:rounded-2xl sm:p-6 ${wide ? 'max-w-2xl' : 'max-w-md'}`} role="dialog" aria-modal="true"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-extrabold">{title}</h2><button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" data-testid="button-close-modal"><X size={18} /></button></div>{children}</div></div>;
}

function EmptyState({ icon: Icon, title, description, action, onAction }: { icon: typeof ShoppingBag; title: string; description: string; action: string; onAction: () => void }) {
  return <div className="flex flex-col items-center justify-center px-5 py-14 text-center"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/8 text-primary"><Icon size={24} /></span><h4 className="mt-4 text-sm font-extrabold">{title}</h4><p className="mt-2 max-w-xs text-xs leading-5 text-muted-foreground">{description}</p><button onClick={onAction} className="mt-4 rounded-lg border border-border px-3 py-2 text-xs font-bold text-primary hover:border-primary/40" data-testid="button-empty-action">{action}</button></div>;
}

export default App;