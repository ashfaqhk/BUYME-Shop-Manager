import { type ReactNode, type SetStateAction, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { categories, type Product, type Variant } from './catalog-data';
import BillingCalculator from './BillingCalculator';
import CatalogScanDialog from './CatalogScanDialog';
import type { ImportBillLine } from './list-import-types';
import { createBillPdf, getUpiUri } from './billing-documents';
import { accountUpiUri, prepareQrImage, validatePaymentQR, type PaymentQR } from './payment-profiles';
import { roundMoney, roundQuantity, validQuantity } from './quantity-units';
import { AccountBar, BuymeAccess, uploadSellerPhoto, useSellerShop } from './SellerAccess';
import PlanAccess from './PlanAccess';
import ReportExport, { ReportDownload } from './ReportExport';
import { sameData } from './shop-merge';
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
  ImagePlus,
  IndianRupee,
  LayoutDashboard,
  Menu,
  MessageCircleMore,
  Minus,
  Moon,
  Package,
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
type AppVersion = 'basic' | 'full';
type PaymentMethod = 'Cash' | 'UPI' | 'Credit';

type BillLine = {
  lineId: string;
  productId: string;
  variantId: string;
  name: string;
  variant: string;
  unit?: string;
  qty: number;
  price: number;
};

type PaymentEntry = { method: 'Cash' | 'UPI'; amount: number; createdAt: string };

type Sale = {
  id: string;
  createdAt: string;
  lines: BillLine[];
  total: number;
  subtotal?: number;
  gst?: number;
  discount?: number;
  paid: number;
  paymentMethod: PaymentMethod;
  payments?: PaymentEntry[];
  paymentQr?: PaymentQR;
  customerName?: string;
  customer?: string;
};

type ShopSettings = {
  shopName: string;
  phone: string;
  upiId: string;
  upiName: string;
  paymentQrs: PaymentQR[];
  gstEnabled: boolean;
  gstin: string;
  gstRate: number;
  darkMode: boolean;
};

const seedSettings: ShopSettings = {
  shopName: 'Sharma General Store',
  phone: '+91 98765 43210',
  upiId: '',
  upiName: 'Sharma General Store',
  paymentQrs: [],
  gstEnabled: false,
  gstin: '',
  gstRate: 5,
  darkMode: false,
};

const navItems: { label: Section; icon: typeof LayoutDashboard; helper?: string }[] = [
  { label: 'Billing', icon: ReceiptIndianRupee, helper: 'Counter' },
  { label: 'Catalog', icon: Package, helper: 'Products' },
  { label: 'Notifications', icon: Bell, helper: 'Keep in the loop' },
  { label: 'Insights', icon: BarChart3, helper: 'Your numbers' },
  { label: 'Broadcast', icon: MessageCircleMore, helper: 'Reach customers' },
];

function money(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function initials(name: string) {
  return name.split(' ').map((part) => part[0]).slice(0, 2).join('');
}

function ShopWorkspace() {
  const { shop, updateSnapshot, saveStatus, retrySave } = useSellerShop();
  const [activeSection, setActiveSection] = useState<Section>('Billing');
  const appVersion: AppVersion = shop.premiumApproved && shop.settings.workspaceMode !== 'basic' ? 'full' : 'basic';
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const catalog = shop.catalog;
  const sales = shop.sales as Sale[];
  const settings = useMemo(() => ({ ...seedSettings, ...shop.settings, upiId: '', paymentQrs: Array.isArray(shop.settings.paymentQrs) ? shop.settings.paymentQrs as PaymentQR[] : [] } as ShopSettings), [shop.settings]);
  const setCatalog = (next: SetStateAction<Product[]>) => {
    void updateSnapshot((previous) => ({ ...previous, catalog: typeof next === 'function' ? next(previous.catalog) : next })).catch((cause) => flash(cause instanceof Error ? cause.message : 'Could not save catalog.'));
  };
  const setSales = (next: SetStateAction<Sale[]>) => {
    void updateSnapshot((previous) => ({ ...previous, sales: typeof next === 'function' ? next(previous.sales as Sale[]) : next })).catch((cause) => flash(cause instanceof Error ? cause.message : 'Could not save payments.'));
  };
  const setSettings = (next: SetStateAction<ShopSettings>) => {
    void updateSnapshot((previous) => {
      const current = { ...seedSettings, ...previous.settings } as ShopSettings;
      return { ...previous, settings: { ...previous.settings, ...(typeof next === 'function' ? next(current) : next) } };
    }).catch((cause) => flash(cause instanceof Error ? cause.message : 'Could not save settings.'));
  };
  const draftKey = `buyme-bill-draft:${shop.shopId}:${shop.email}`;
  const [bill, applyBill] = useState<BillLine[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(draftKey) || '[]');
      return Array.isArray(stored) && stored.every((line) => line && typeof line.lineId === 'string' && typeof line.productId === 'string' && typeof line.variantId === 'string' && Number.isFinite(line.qty) && Number.isFinite(line.price)) ? stored : [];
    } catch { return []; }
  });
  const draftBill = useRef(bill);
  const setBill = (next: SetStateAction<BillLine[]>) => {
    const value = typeof next === 'function' ? next(draftBill.current) : next;
    draftBill.current = value;
    try { localStorage.setItem(draftKey, JSON.stringify(value)); }
    catch { flash('This bill draft could not be stored. Keep BUYME open until payment is recorded.'); }
    applyBill(value);
  };
  const [search, setSearch] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [productModal, setProductModal] = useState<{ open: boolean; product?: Product; draft?: Product }>({ open: false });
  const [scanOpen, setScanOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);
  const [toast, setToast] = useState('');
  const [broadcastOpen, setBroadcastOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', settings.darkMode);
  }, [settings.darkMode]);
  useEffect(() => {
    if (appVersion === 'basic' && (activeSection === 'Notifications' || activeSection === 'Broadcast')) setActiveSection('Billing');
  }, [appVersion, activeSection]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const lowStock = useMemo(() => catalog.flatMap((product) => product.variants.map((variant) => ({ product, variant })).filter(({ variant }) => typeof variant.stock === 'number' && variant.stock <= (variant.threshold ?? 0))), [catalog]);
  const billSubtotal = roundMoney(bill.reduce((sum, line) => sum + roundMoney(line.price * line.qty), 0));
  const billGst = settings.gstEnabled ? roundMoney(billSubtotal * settings.gstRate / 100) : 0;
  const billTotal = roundMoney(billSubtotal + billGst);
  const filteredProducts = useMemo(() => catalog.filter((product) =>
    `${product.name} ${product.category} ${product.variants.map((variant) => variant.name).join(' ')}`.toLowerCase().includes(search.trim().toLowerCase())
  ), [catalog, search]);

  const flash = (message: string) => setToast(message);
  const changeSection = (section: Section) => { setActiveSection(section); setMobileNav(false); };
  const addToBill = (product: Product, variant: Variant, quantity = 1) => {
    if (!validQuantity(quantity)) return false;
    const alreadyAdded = bill.filter((line) => line.productId === product.id && line.variantId === variant.id).reduce((sum, line) => sum + line.qty, 0);
    if (typeof variant.stock === 'number' && alreadyAdded + quantity > variant.stock + 0.000001) {
      flash(`Only ${Math.max(0, variant.stock - alreadyAdded)} left in stock`);
      return false;
    }
    setBill((current) => {
      const existing = current.find((line) => line.lineId === `${product.id}-${variant.id}`);
      if (existing) return current.map((line) => line.lineId === existing.lineId ? { ...line, qty: roundQuantity(line.qty + quantity) } : line);
      return [...current, { lineId: `${product.id}-${variant.id}`, productId: product.id, variantId: variant.id, name: product.name, variant: variant.name, unit: variant.unit, qty: roundQuantity(quantity), price: variant.price }];
    });
    flash(`${quantity} × ${product.name} added to ${appVersion === 'basic' ? 'selection' : 'bill'}`);
    return true;
  };

  const importToBill = (items: ImportBillLine[]): string | null => {
    if (!items.length) return 'Select at least one item to add.';
    const prepared: BillLine[] = [];
    for (const item of items) {
      if (!item.name.trim() || !Number.isSafeInteger(item.qty) || item.qty < 1 || !Number.isFinite(item.price) || item.price <= 0) {
        return 'Each item needs a name, whole-number quantity, and a price above zero.';
      }
      if (item.productId || item.variantId) {
        const product = catalog.find((entry) => entry.id === item.productId);
        const variant = product?.variants.find((entry) => entry.id === item.variantId);
        if (!product || !variant) return `Choose an available catalog type for ${item.name}.`;
        const price = Math.round(item.price * 100) / 100;
        if (price <= 0) return `Enter a valid price for ${item.name}.`;
        const lineId = price === variant.price ? `${product.id}-${variant.id}` : `${product.id}-${variant.id}-${price.toFixed(2)}`;
        const existing = prepared.find((line) => line.lineId === lineId);
        if (existing) existing.qty += item.qty;
        else prepared.push({ lineId, productId: product.id, variantId: variant.id, name: product.name, variant: variant.name, unit: variant.unit, qty: item.qty, price });
      } else {
        const price = Math.round(item.price * 100) / 100;
        if (price <= 0) return `Enter a valid price for ${item.name}.`;
        prepared.push({ lineId: `import-${crypto.randomUUID()}`, productId: '', variantId: '', name: item.name.trim(), variant: item.variant.trim() || 'Imported item', qty: item.qty, price });
      }
    }
    for (const line of prepared) {
      const variant = catalog.find((entry) => entry.id === line.productId)?.variants.find((entry) => entry.id === line.variantId);
      const inBill = bill.filter((entry) => entry.productId === line.productId && entry.variantId === line.variantId).reduce((sum, entry) => sum + entry.qty, 0);
      const importing = prepared.filter((entry) => entry.productId === line.productId && entry.variantId === line.variantId).reduce((sum, entry) => sum + entry.qty, 0);
      if (typeof variant?.stock === 'number' && inBill + importing > variant.stock) {
        return `${line.name} (${line.variant}): only ${Math.max(0, variant.stock - inBill)} left in stock.`;
      }
    }
    setBill((current) => {
      const next = [...current];
      for (const line of prepared) {
        const index = next.findIndex((entry) => entry.lineId === line.lineId);
        if (index >= 0) next[index] = { ...next[index], qty: next[index].qty + line.qty };
        else next.push(line);
      }
      return next;
    });
    flash(`${prepared.reduce((sum, line) => sum + line.qty, 0)} items added from list`);
    return null;
  };

  const adjustBill = (lineId: string, amount: number) => {
    const selected = bill.find((line) => line.lineId === lineId);
    if (selected && amount > 0) {
      const variant = catalog.find((item) => item.id === selected.productId)?.variants.find((item) => item.id === selected.variantId);
      const alreadyAdded = bill.filter((line) => line.productId === selected.productId && line.variantId === selected.variantId).reduce((sum, line) => sum + line.qty, 0);
      if (typeof variant?.stock === 'number' && alreadyAdded + amount > variant.stock + 0.000001) {
        flash('No more stock available');
        return;
      }
    }
    setBill((current) => current.flatMap((line) => line.lineId === lineId
      ? (roundQuantity(line.qty + amount) > 0 ? [{ ...line, qty: roundQuantity(line.qty + amount) }] : [])
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

  const restockFromScan = (productId: string, variantId: string, quantity: number): string | null => {
    if (!Number.isSafeInteger(quantity) || quantity < 1) return 'Enter a positive whole-number arrival quantity.';
    const product = catalog.find((item) => item.id === productId);
    const variant = product?.variants.find((item) => item.id === variantId);
    if (!product || !variant) return 'Choose a product and size from your catalog.';
    if (typeof variant.stock === 'number' && (!Number.isSafeInteger(variant.stock) || variant.stock < 0)) return 'Current stock is invalid. Correct it in the product editor first.';
    if ((variant.stock ?? 0) + quantity > Number.MAX_SAFE_INTEGER) return 'That stock quantity is too large.';
    setCatalog((current) => current.map((item) => item.id !== productId ? item : {
      ...item,
      updatedAt: 'Just now',
      variants: item.variants.map((option) => option.id === variantId ? { ...option, stock: (option.stock ?? 0) + quantity } : option),
    }));
    flash(`${quantity} ${variant.unit} added to ${product.name} stock`);
    return null;
  };

  const paymentSaving = useRef(false);
  const completePayment = async (method: PaymentMethod, paid: number, discount: number, customerName?: string, customer?: string, paymentQr?: PaymentQR) => {
    if (paymentSaving.current) return;
    paymentSaving.current = true;
    const total = roundMoney(billTotal - discount);
    const createdAt = new Date().toISOString();
    const sale: Sale = { id: `BM-${crypto.randomUUID().toUpperCase()}`, createdAt, lines: bill, subtotal: billSubtotal, gst: billGst, discount, total, paid, paymentMethod: method, payments: method === 'Credit' || paid <= 0 ? [] : [{ method, amount: paid, createdAt }], paymentQr: method === 'UPI' ? paymentQr : undefined, customerName, customer };
    try {
    await updateSnapshot((previous) => ({ ...previous, sales: [sale, ...previous.sales], catalog: previous.catalog.map((product) => ({ ...product, variants: product.variants.map((variant) => {
      const sold = bill.filter((line) => line.productId === product.id && line.variantId === variant.id).reduce((sum, line) => sum + line.qty, 0);
       return sold && typeof variant.stock === 'number' ? { ...variant, stock: Math.max(0, roundQuantity(variant.stock - sold)) } : variant;
    }) })) }));
    setBill([]);
    setSearch('');
    setPaymentOpen(false);
    if (appVersion === 'full') setReceiptSale(sale);
    else setReceiptSale(null);
    flash(method === 'Credit' ? `Credit of ${money(total)} recorded` : appVersion === 'basic' ? `Payment of ${money(paid)} recorded` : 'Payment recorded. Bill is ready.');
    } catch (cause) {
      // Never create a second sale to retry a device-storage failure.
      setPaymentOpen(false); setBill([]);
      flash(cause instanceof Error ? cause.message : 'Keep BUYME open and retry saving.');
    } finally { paymentSaving.current = false; }
  };

  const collectCredit = (saleId: string, method: 'Cash' | 'UPI', amount: number) => {
    const createdAt = new Date().toISOString();
    setSales((current) => current.map((sale) => {
      if (sale.id !== saleId) return sale;
      const payments = [...salePayments(sale), { method, amount, createdAt }];
      return { ...sale, paid: Math.min(sale.total, roundMoney(collectedAmount(sale) + amount)), paymentMethod: method, payments };
    }));
    flash(`${money(amount)} credit payment recorded`);
  };

  return (
    <div className="buyme-shell min-h-[100dvh] bg-background text-foreground">
      {appVersion === 'full' && activeSection !== 'Billing' && <aside className={`fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col bg-sidebar px-4 py-5 text-sidebar-foreground transition-transform duration-300 lg:translate-x-0 ${mobileNav ? 'translate-x-0' : '-translate-x-full'}`}>
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
      </aside>}

       {appVersion === 'full' && activeSection !== 'Billing' && mobileNav && <button aria-label="Close menu" className="fixed inset-0 z-30 bg-foreground/30 lg:hidden" onClick={() => setMobileNav(false)} data-testid="button-menu-backdrop" />}
       <main className={`min-h-[100dvh] ${appVersion === 'full' && activeSection !== 'Billing' ? 'lg:pl-[264px]' : ''}`}
         onTouchStart={(event) => { if (appVersion === 'basic') swipeStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }}
         onTouchEnd={(event) => {
           if (appVersion !== 'basic' || !swipeStart.current || paymentOpen || productModal.open) return;
           const dx = event.changedTouches[0].clientX - swipeStart.current.x;
           const dy = event.changedTouches[0].clientY - swipeStart.current.y;
           swipeStart.current = null;
           if (Math.abs(dx) > 85 && Math.abs(dx) > Math.abs(dy) * 1.5) {
             if (dx < 0 && activeSection === 'Billing') changeSection('Catalog');
             else if (dx > 0 && activeSection === 'Catalog') changeSection('Billing');
           }
         }}>
         {appVersion === 'full' && activeSection !== 'Billing' && <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-border/70 bg-background/90 px-5 backdrop-blur-md sm:px-8 lg:px-10">
          <div className="flex items-center gap-3">
            <button className="rounded-xl border border-border bg-card p-2.5 lg:hidden" onClick={() => setMobileNav(true)} data-testid="button-open-navigation"><Menu size={18} /></button>
             <div><p className="text-[11px] font-bold uppercase tracking-[.17em] text-muted-foreground">Shop workspace</p><h1 className="mt-0.5 text-lg font-extrabold tracking-tight">{activeSection}</h1></div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <button onClick={() => changeSection('Notifications')} className="relative rounded-xl border border-border bg-card p-2.5 text-muted-foreground hover:border-primary/40 hover:text-primary" data-testid="button-notifications"><Bell size={18} />{lowStock.length > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-accent-foreground">{lowStock.length}</span>}</button>
            <div className="hidden h-8 w-px bg-border sm:block" />
            <div className="hidden items-center gap-2.5 sm:flex"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-extrabold text-primary">{initials(settings.shopName)}</span><span className="text-xs font-bold">{settings.shopName.split(' ')[0]}</span></div>
            <button onClick={() => changeSection('Settings')} className="rounded-xl p-2 text-muted-foreground hover:bg-muted hover:text-foreground sm:hidden" data-testid="button-mobile-settings"><Settings2 size={18} /></button>
          </div>
        </header>}

        <div className={`mx-auto max-w-[1480px] px-5 sm:px-8 lg:px-10 ${activeSection === 'Billing' ? 'pb-14 pt-5 sm:pt-7' : 'pb-24 pt-7 lg:pb-10'}`}>
           <div className="mb-4 flex flex-wrap items-center justify-end gap-3">{appVersion === 'full' && <ShopPlanAccess mode={appVersion} />}<AccountBar email={shop.email} role={shop.role} mode={appVersion} saveStatus={saveStatus} onRetry={retrySave} /></div>
   {appVersion === 'basic' && <div className="mb-5 flex flex-wrap items-center justify-between gap-3" data-testid="basic-navigation">
             <nav className="flex rounded-xl border border-border bg-card p-1" aria-label="Basic pages">
               {(['Billing', 'Catalog', 'Insights', 'Settings'] as const).map((section) => <button key={section} type="button" onClick={() => changeSection(section)} aria-current={activeSection === section ? 'page' : undefined} className={`rounded-lg px-3 py-2 text-xs font-extrabold ${activeSection === section ? 'bg-primary text-primary-foreground' : 'text-primary'}`} data-testid={`basic-nav-${section.toLowerCase()}`}>{section}</button>)}
             </nav>
              <ShopPlanAccess mode={appVersion} />
           </div>}
           {activeSection === 'Billing' && <BillingCalculator key={sales.length} basic={appVersion === 'basic'} products={filteredProducts} search={search} onSearch={setSearch} bill={bill} subtotal={billSubtotal} gst={billGst} total={billTotal} onAdd={addToBill} onImport={importToBill} onAdjust={adjustBill} onClear={() => { setBill([]); flash('Current bill cleared'); }} onPay={() => setPaymentOpen(true)} />}
           {appVersion === 'basic' && activeSection === 'Billing' && <BasicPaymentTotals sales={sales} />}
           {appVersion === 'full' && activeSection === 'Billing' && <nav className="mt-20 border-t border-border pt-8" aria-label="More shop sections" data-testid="nav-billing-footer">
            <p className="mb-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">More from your shop</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {navItems.filter((item) => item.label !== 'Billing').map((item) => {
                const Icon = item.icon;
                return <button key={item.label} type="button" onClick={() => { changeSection(item.label); window.scrollTo({ top: 0, behavior: 'instant' }); }} className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-left text-sm font-bold text-primary hover:border-primary/40" data-testid={`footer-nav-${item.label.toLowerCase()}`}><Icon size={17} />{item.label}</button>;
              })}
              <button type="button" onClick={() => { changeSection('Settings'); window.scrollTo({ top: 0, behavior: 'instant' }); }} className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-left text-sm font-bold text-primary hover:border-primary/40" data-testid="footer-nav-settings"><Settings2 size={17} />Settings</button>
            </div>
          </nav>}
           {activeSection === 'Catalog' && <CatalogView catalog={catalog} basic={appVersion === 'basic'} onAdd={() => setProductModal({ open: true })} onScan={() => setScanOpen(true)} onEdit={(product) => setProductModal({ open: true, product })} />}
             {activeSection === 'Insights' && <InsightsView sales={sales} catalog={catalog} settings={settings} onOpenBill={(sale) => appVersion === 'full' ? setReceiptSale(sale) : flash('Individual bill receipts are available in Full. You can download a data report in Basic.')} onCollectCredit={collectCredit} />}
           {appVersion === 'full' && activeSection === 'Notifications' && <NotificationsView lowStock={lowStock} sales={sales} onGoCatalog={() => changeSection('Catalog')} />}
           {appVersion === 'full' && activeSection === 'Broadcast' && <BroadcastView settings={settings} onOpen={() => setBroadcastOpen(true)} />}
             {activeSection === 'Settings' && <SettingsView settings={settings} sales={sales} catalog={catalog} appVersion={appVersion} onSave={(next) => {
               void updateSnapshot((previous) => ({ ...previous, settings: { ...previous.settings, ...next, workspaceMode: previous.settings.workspaceMode } })).then(() => flash('Shop settings saved on this device')).catch((cause) => flash(cause instanceof Error ? cause.message : 'Could not save settings.'));
             }} />}
        </div>
      </main>

       {appVersion === 'full' && activeSection !== 'Billing' && <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-card/95 px-2 py-2 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-lg justify-around">
          {navItems.slice(0, 4).map((item) => { const Icon = item.icon; return <button key={item.label} onClick={() => changeSection(item.label)} className={`flex min-w-[64px] flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[10px] font-bold ${activeSection === item.label ? 'text-primary' : 'text-muted-foreground'}`} data-testid={`mobile-nav-${item.label.toLowerCase()}`}><Icon size={18} /><span>{item.label}</span></button>; })}
        </div>
      </div>}

      {scanOpen && <CatalogScanDialog catalog={catalog} onClose={() => setScanOpen(false)} onRestock={restockFromScan} onCreateDraft={(draft) => { setScanOpen(false); setProductModal({ open: true, draft }); }} onEditDraft={(productId, draft) => { const product = catalog.find((entry) => entry.id === productId); if (!product) return; setScanOpen(false); setProductModal({ open: true, product, draft: { ...draft, id: product.id } }); }} />}
       {productModal.open && <ProductModal basic={appVersion === 'basic'} product={productModal.product} draft={productModal.draft} onClose={() => setProductModal({ open: false })} onSave={saveProduct} onDelete={deleteProduct} />}
       {paymentOpen && (appVersion === 'basic'
          ? <BasicPaymentModal total={billTotal} onClose={() => setPaymentOpen(false)} onComplete={(method) => completePayment(method, method === 'Credit' ? 0 : billTotal, 0)} />
         : <PaymentModal basic={false} total={billTotal} subtotal={billSubtotal} gst={billGst} lines={bill} settings={settings} onSaveQR={(profile) => setSettings((current) => ({ ...current, paymentQrs: [...current.paymentQrs, profile] }))} onClose={() => setPaymentOpen(false)} onComplete={completePayment} />)}
       {appVersion === 'full' && receiptSale && <ReceiptModal sale={receiptSale} settings={settings} basic={false} onClose={() => setReceiptSale(null)} />}
      {broadcastOpen && <BroadcastModal settings={settings} onClose={() => setBroadcastOpen(false)} onDone={(message) => { setBroadcastOpen(false); flash(message); }} />}
      {toast && <div className="fixed bottom-20 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-xl bg-sidebar px-4 py-3 text-xs font-bold text-sidebar-foreground shadow-[0_12px_35px_rgba(36,31,61,.22)] lg:bottom-7" data-testid="status-toast"><CircleCheck size={16} className="text-sidebar-primary" />{toast}</div>}
    </div>
  );
}

function App() {
  return <BuymeAccess><ShopWorkspace /></BuymeAccess>;
}

function BillingView({ catalog, search, setSearch, category, setCategory, bill, billSubtotal, billGst, billTotal, onAdd, onAdjust, onClear, onPay, onOpenCatalog }: {
  catalog: Product[]; search: string; setSearch: (value: string) => void; category: string; setCategory: (value: string) => void;
  bill: BillLine[]; billSubtotal: number; billGst: number; billTotal: number;
  onAdd: (product: Product, variant: Variant, quantity: number) => void; onAdjust: (id: string, amount: number) => void;
  onClear: () => void; onPay: () => void; onOpenCatalog: () => void;
}) {
  const [showMobileBill, setShowMobileBill] = useState(false);
  const billCount = bill.reduce((sum, line) => sum + line.qty, 0);
  return <div className="rise-in">
    <div className="mb-5">
      <p className="text-sm font-semibold text-accent">Your counter, made lighter.</p>
      <h2 className="font-display text-[2.45rem] leading-none tracking-tight text-primary sm:text-[3rem]">Let's make a bill.</h2>
    </div>
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
      <section className="min-w-0">
        <label className="relative block">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-primary" size={22} />
          <span className="sr-only">Search products</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search items..." autoComplete="off" className="h-15 w-full rounded-2xl border-2 border-primary/25 bg-card pl-12 pr-4 text-base font-semibold shadow-[var(--shadow-sm)] outline-none placeholder:text-muted-foreground/75 focus:border-primary" data-testid="input-search-products" />
        </label>
        <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-2">
          {categories.map((item) => <button key={item} onClick={() => setCategory(item)} className={`whitespace-nowrap rounded-full border px-4 py-2.5 text-xs font-bold ${category === item ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-primary'}`} data-testid={`filter-category-${item.toLowerCase().replace(' ', '-')}`}>{item}</button>)}
        </div>
        <div className="mb-3 mt-3 flex items-center justify-between"><h3 className="text-sm font-extrabold">{category === 'All items' ? 'All products' : category}</h3><span className="text-xs text-muted-foreground">{catalog.length} items</span></div>
        {catalog.length === 0 ? <EmptyState icon={ShoppingBag} title="No products found" description="Try another search or add this item to your catalog." action="Open catalog" onAction={onOpenCatalog} /> : <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">{catalog.map((product) => <ProductQuickCard key={product.id} product={product} bill={bill} onAdd={onAdd} />)}</div>}
      </section>
      <div className="hidden xl:sticky xl:top-24 xl:block">
        <BillPanel bill={bill} subtotal={billSubtotal} gst={billGst} total={billTotal} onAdjust={onAdjust} onClear={onClear} onPay={onPay} />
      </div>
    </div>
    {bill.length > 0 && <div className="fixed bottom-[70px] left-0 right-0 z-20 border-t border-border bg-card p-3 shadow-[0_-10px_35px_rgba(36,31,61,.13)] xl:hidden">
      <button onClick={() => setShowMobileBill(true)} className="flex w-full items-center justify-between rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground" data-testid="button-review-bill">
        <span>View bill · {billCount} items</span><span>{money(billTotal)} <ArrowUpRight className="ml-1 inline" size={16} /></span>
      </button>
    </div>}
    {showMobileBill && <Modal title="Review bill" onClose={() => setShowMobileBill(false)} wide><BillPanel bill={bill} subtotal={billSubtotal} gst={billGst} total={billTotal} onAdjust={onAdjust} onClear={onClear} onPay={() => { setShowMobileBill(false); onPay(); }} /></Modal>}
  </div>;
}

function ProductArtwork({ product, className = '' }: { product: Product; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [product.image]);
  if (!product.image || failed) return <div className={`flex items-center justify-center bg-primary/8 text-primary ${className}`}><Package size={38} strokeWidth={1.4} /></div>;
  const src = product.image.startsWith('data:') ? product.image : `${import.meta.env.BASE_URL}${product.image}`;
  return <img src={src} alt={product.name} loading="lazy" onError={() => setFailed(true)} className={`object-cover ${className}`} />;
}

function ProductQuickCard({ product, bill, onAdd }: { product: Product; bill: BillLine[]; onAdd: (product: Product, variant: Variant, quantity: number) => void }) {
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? '');
  const [quantity, setQuantity] = useState(1);
  const variant = product.variants.find((item) => item.id === variantId) ?? product.variants[0];
  if (!variant) return null;
  const alreadyAdded = bill.find((line) => line.variantId === variant.id)?.qty ?? 0;
  const remaining = typeof variant.stock === 'number' ? Math.max(0, variant.stock - alreadyAdded) : 99;
  const low = typeof variant.stock === 'number' && variant.stock <= (variant.threshold ?? 0);
  return <article className="group overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)] transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-md)]">
    <div className="relative overflow-hidden bg-muted/40">
      <ProductArtwork product={product} className="aspect-[1.22] w-full transition-transform duration-300 group-hover:scale-[1.03]" />
      {low && <span className="absolute right-2 top-2 rounded-full bg-accent px-2 py-1 text-[10px] font-extrabold text-white">Low stock</span>}
      {alreadyAdded > 0 && <span className="absolute bottom-2 right-2 rounded-full bg-primary px-2 py-1 text-[10px] font-extrabold text-primary-foreground">{alreadyAdded} in bill</span>}
    </div>
    <div className="p-3">
      <h4 className="min-h-10 text-sm font-extrabold leading-5">{product.name}</h4>
      <div className="mt-1 flex items-baseline justify-between gap-1"><span className="text-base font-extrabold text-primary">{money(variant.price)}</span><span className="truncate text-[10px] text-muted-foreground">/ {variant.unit}</span></div>
      {product.variants.length > 1 ? <div className="no-scrollbar mt-2 flex gap-1 overflow-x-auto pb-1">{product.variants.map((option) => <button key={option.id} onClick={() => { setVariantId(option.id); setQuantity(1); }} className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-bold ${variant.id === option.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`} aria-label={`${product.name} ${option.name}`}>{option.name}</button>)}</div> : <p className="mt-2 truncate text-[10px] font-semibold text-muted-foreground">{variant.name}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex h-10 items-center rounded-xl border border-border bg-background">
          <button type="button" onClick={() => setQuantity(Math.max(1, quantity - 1))} disabled={quantity <= 1} className="flex h-10 w-9 items-center justify-center disabled:opacity-35" aria-label={`Decrease ${product.name} quantity`}><Minus size={14} /></button>
          <input type="number" min={1} max={99} value={quantity} onChange={(event) => setQuantity(Math.min(99, Math.max(1, Math.floor(Number(event.target.value) || 1))))} className="w-8 bg-transparent text-center text-sm font-extrabold outline-none" aria-label={`${product.name} quantity`} />
          <button type="button" onClick={() => setQuantity(Math.min(99, quantity + 1))} className="flex h-10 w-9 items-center justify-center" aria-label={`Increase ${product.name} quantity`}><Plus size={14} /></button>
        </div>
        <button onClick={() => { onAdd(product, variant, quantity); setQuantity(1); }} disabled={remaining < quantity} className="flex h-10 min-w-10 flex-1 items-center justify-center gap-1 rounded-xl bg-primary px-3 text-xs font-extrabold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40" data-testid={`button-add-${variant.id}`} aria-label={`Add ${quantity} ${product.name} ${variant.name} to bill`}><Plus size={16} /> Add</button>
      </div>
      {remaining === 0 && <p className="mt-2 text-[10px] font-semibold text-accent">Out of stock</p>}
    </div>
  </article>;
}

function BillPanel({ bill, subtotal, gst, total, onAdjust, onClear, onPay }: {
  bill: BillLine[]; subtotal: number; gst: number; total: number; onAdjust: (id: string, amount: number) => void; onClear: () => void; onPay: () => void;
}) {
  return <section className="flex min-h-[460px] flex-col overflow-hidden rounded-2xl border border-primary/15 bg-primary text-primary-foreground shadow-[0_18px_45px_hsl(var(--primary)/.15)]">
    <div className="flex items-center justify-between border-b border-primary-foreground/12 px-5 py-4">
      <div><h3 className="text-base font-extrabold">Current bill</h3><p className="mt-1 text-[11px] text-primary-foreground/60">{bill.length ? `${bill.reduce((sum, line) => sum + line.qty, 0)} items` : 'Ready for your first item'}</p></div>
      {bill.length > 0 && <button onClick={onClear} className="text-[11px] font-bold text-primary-foreground/75 hover:text-primary-foreground" data-testid="button-clear-bill">Clear all</button>}
    </div>
    {bill.length === 0 ? <div className="flex flex-1 flex-col items-center justify-center px-8 text-center"><ReceiptIndianRupee size={38} className="text-sidebar-primary" /><h4 className="mt-5 text-base font-bold">Start with a product</h4><p className="mt-2 max-w-[220px] text-xs leading-5 text-primary-foreground/60">Choose a quantity on a product card, then tap Add.</p></div> : <>
      <div className="max-h-[45vh] flex-1 space-y-2 overflow-y-auto px-4 py-4">{bill.map((line) => <div key={line.lineId} className="flex items-center gap-2 rounded-xl bg-primary-foreground/8 px-3 py-3">
        <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{line.name}</p><p className="mt-0.5 text-[10px] text-primary-foreground/65">{line.variant} · {money(line.price)} each</p></div>
        <div className="flex items-center gap-1 rounded-lg border border-primary-foreground/15 p-1">
          <button onClick={() => onAdjust(line.lineId, -1)} className="flex h-7 w-7 items-center justify-center rounded hover:bg-primary-foreground/10" aria-label={`Remove one ${line.name}`} data-testid={`button-decrease-${line.lineId}`}><Minus size={13} /></button>
          <span className="min-w-5 text-center text-xs font-bold">{line.qty}</span>
          <button onClick={() => onAdjust(line.lineId, 1)} className="flex h-7 w-7 items-center justify-center rounded hover:bg-primary-foreground/10" aria-label={`Add one ${line.name}`} data-testid={`button-increase-${line.lineId}`}><Plus size={13} /></button>
        </div>
        <span className="w-16 text-right text-xs font-extrabold">{money(line.price * line.qty)}</span>
        <button onClick={() => onAdjust(line.lineId, -line.qty)} className="p-1 text-primary-foreground/60 hover:text-sidebar-primary" aria-label={`Remove ${line.name} from bill`} data-testid={`button-remove-${line.lineId}`}><Trash2 size={14} /></button>
      </div>)}</div>
      <div className="border-t border-primary-foreground/12 p-5">
        <div className="flex items-center justify-between text-xs text-primary-foreground/70"><span>Subtotal</span><span>{money(subtotal)}</span></div>
        {gst > 0 && <div className="mt-2 flex items-center justify-between text-xs text-primary-foreground/70"><span>GST</span><span>{money(gst)}</span></div>}
        <div className="mt-3 flex items-end justify-between"><span className="text-sm font-bold">Total</span><span className="text-3xl font-extrabold tracking-tight">{money(total)}</span></div>
        <button onClick={onPay} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-sidebar-primary font-extrabold text-sidebar-primary-foreground hover:brightness-105" data-testid="button-collect-payment">Generate bill <ArrowUpRight size={17} /></button>
      </div>
    </>}
  </section>;
}

function CatalogView({ catalog, basic, onAdd, onScan, onEdit }: {
  catalog: Product[]; basic: boolean; onAdd: () => void; onScan: () => void; onEdit: (product: Product) => void;
}) {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All items');
  const filtered = catalog.filter((product) => (selectedCategory === 'All items' || product.category === selectedCategory) && `${product.name} ${product.category}`.toLowerCase().includes(query.toLowerCase()));
  const lowStockCount = catalog.reduce((count, product) => count + product.variants.filter((variant) => variant.stock !== undefined && variant.stock <= (variant.threshold ?? 5)).length, 0);
  return <div className="rise-in">
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
       <div><p className="text-sm font-semibold text-accent">The whole shelf, at a glance.</p><h2 className="font-display text-[2.45rem] leading-none text-primary sm:text-[3rem]">Your catalog.</h2><p className="mt-2 text-sm text-muted-foreground">{catalog.length} products · tap a card to edit{basic && ` · ${lowStockCount} low-stock ${lowStockCount === 1 ? 'type' : 'types'}`}</p></div>
      <div className="flex flex-wrap gap-2">{!basic && <button onClick={onScan} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-card px-4 text-sm font-extrabold text-primary hover:bg-secondary" data-testid="button-scan-product"><Sparkles size={17} /> Scan product / restock</button>}<button onClick={onAdd} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground hover:brightness-110" data-testid="button-add-product"><Plus size={18} /> Add product</button></div>
    </div>
    <label className="relative block max-w-xl"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-primary" size={19} /><span className="sr-only">Search catalog</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a product..." className="h-13 w-full rounded-2xl border-2 border-primary/25 bg-card pl-12 pr-4 text-sm font-semibold outline-none focus:border-primary" data-testid="input-search-catalog" /></label>
    <div className="no-scrollbar my-4 flex gap-2 overflow-x-auto pb-2">{categories.map((item) => <button key={item} onClick={() => setSelectedCategory(item)} className={`whitespace-nowrap rounded-full border px-4 py-2.5 text-xs font-bold ${selectedCategory === item ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground'}`}>{item}</button>)}</div>
    {filtered.length === 0 ? <EmptyState icon={Package} title="No products here" description="Try a different search or add a new product." action="Add product" onAction={onAdd} /> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {filtered.map((product) => {
         const lowVariants = product.variants.filter((variant) => variant.stock !== undefined && variant.stock <= (variant.threshold ?? 5));
        return <article key={product.id} className="group overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)] transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-md)]">
          <button onClick={() => onEdit(product)} className="block w-full text-left" aria-label={`Edit ${product.name}`} data-testid={`button-edit-product-${product.id}`}>
            <div className="relative overflow-hidden bg-muted/40"><ProductArtwork product={product} className="aspect-square w-full transition-transform duration-300 group-hover:scale-[1.03]" /></div>
             <div className="p-3"><h3 className="truncate text-sm font-extrabold leading-5">{product.name}</h3><p className="mt-1 text-sm font-extrabold text-primary">{product.variants.length ? money(Math.min(...product.variants.map((variant) => variant.price))) : 'Set a rate'}</p>{basic && lowVariants.length > 0 && <p className="mt-2 text-[11px] font-bold text-amber-800" data-testid={`catalog-low-stock-${product.id}`}>{lowVariants.map((variant) => `${variant.name}: ${variant.stock} left`).join(' · ')}</p>}</div>
          </button>
        </article>;
      })}
    </div>}
  </div>;
}

function localDateInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function collectedAmount(sale: Sale) {
  if (Array.isArray(sale.payments)) return roundMoney(sale.payments.reduce((sum, item) => {
    const amount = Number(item?.amount);
    return item?.method === 'Cash' || item?.method === 'UPI' ? sum + (Number.isFinite(amount) && amount > 0 ? amount : 0) : sum;
  }, 0));
  const amount = Number(sale.paid);
  return sale.paymentMethod !== 'Credit' && Number.isFinite(amount) && amount > 0 ? roundMoney(amount) : 0;
}

function salePayments(sale: Sale): PaymentEntry[] {
  if (Array.isArray(sale.payments)) return sale.payments
    .filter((item) => (item?.method === 'Cash' || item?.method === 'UPI') && Number.isFinite(Number(item.amount)) && Number(item.amount) > 0)
    .map((item) => ({ method: item.method, amount: roundMoney(Number(item.amount)), createdAt: typeof item.createdAt === 'string' ? item.createdAt : sale.createdAt }));
  return sale.paymentMethod !== 'Credit' && collectedAmount(sale) > 0
    ? [{ method: sale.paymentMethod, amount: collectedAmount(sale), createdAt: sale.createdAt }]
    : [];
}

function InsightsView({ sales, catalog, settings, onOpenBill, onCollectCredit }: { sales: Sale[]; catalog: Product[]; settings: ShopSettings; onOpenBill: (sale: Sale) => void; onCollectCredit: (saleId: string, method: 'Cash' | 'UPI', amount: number) => void }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  type Period = 'today' | 'month' | 'week' | 'lastMonth' | 'year' | 'yesterday' | 'last2' | 'last3' | 'custom';
  const latestSaleDate = sales.length ? new Date(Math.max(...sales.map((sale) => new Date(sale.createdAt).getTime()))) : null;
  const [period, setPeriod] = useState<Period>(() => {
    if (!latestSaleDate) return 'today';
    const saleDay = new Date(latestSaleDate);
    saleDay.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(today.getDate() - 2);
    if (saleDay.getTime() === today.getTime()) return 'today';
    if (saleDay.getTime() === yesterday.getTime()) return 'yesterday';
    if (saleDay.getTime() >= threeDaysAgo.getTime()) return 'last3';
    return 'custom';
  });
  const [customDates, setCustomDates] = useState(() => {
    const date = latestSaleDate ?? today;
    return { from: localDateInput(date), to: localDateInput(date) };
  });
  const periodLabels: Record<Period, string> = { today: 'Today', week: 'Last 7 days', lastMonth: 'Last 30 days', year: 'Last 365 days', month: 'This month', yesterday: 'Yesterday', last2: 'Last 2 days', last3: 'Last 3 days', custom: 'Custom dates' };
  const validPeriod = period !== 'custom' || (!!customDates.from && !!customDates.to && customDates.from <= customDates.to);
  const rangeStart = period === 'custom' && validPeriod ? new Date(`${customDates.from}T00:00:00`) : new Date(today);
  const rangeEnd = period === 'custom' && validPeriod ? new Date(`${customDates.to}T00:00:00`) : new Date(today);
  if (period === 'month') rangeStart.setDate(1);
  if (period === 'week') rangeStart.setDate(rangeStart.getDate() - 6);
  if (period === 'lastMonth') rangeStart.setDate(rangeStart.getDate() - 29);
  if (period === 'year') rangeStart.setDate(rangeStart.getDate() - 364);
  if (period === 'yesterday') {
    rangeStart.setDate(rangeStart.getDate() - 1);
  } else if (period === 'last2') {
    rangeStart.setDate(rangeStart.getDate() - 1);
  } else if (period === 'last3') {
    rangeStart.setDate(rangeStart.getDate() - 2);
  }
  if (period !== 'yesterday') rangeEnd.setDate(rangeEnd.getDate() + 1);
  const days: Date[] = [];
  if (validPeriod) {
    for (let date = new Date(rangeStart); date < rangeEnd && days.length < 32; date.setDate(date.getDate() + 1)) days.push(new Date(date));
  }
  const chartAvailable = days.length <= 31;
  const currentSales = validPeriod ? sales.filter((sale) => {
    const date = new Date(sale.createdAt).getTime();
    return date >= rangeStart.getTime() && date < rangeEnd.getTime();
  }) : [];
  const selectedBills = [...currentSales].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const periodPaymentEvents = validPeriod ? sales.flatMap((sale) => salePayments(sale).map((payment) => ({ sale, payment }))).filter(({ payment }) => {
    const time = new Date(payment.createdAt).getTime();
    return time >= rangeStart.getTime() && time < rangeEnd.getTime();
  }) : [];
  const creditSales = [...sales].filter((sale) => sale.total - collectedAmount(sale) > 0.005).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const visibleCreditIds = new Set(creditSales.slice(0, 30).map((sale) => sale.id));
  const previousStart = new Date(rangeStart);
  if (chartAvailable) previousStart.setDate(previousStart.getDate() - days.length);
  const revenue = roundMoney(periodPaymentEvents.reduce((sum, event) => sum + event.payment.amount, 0));
  const previousRevenue = chartAvailable && validPeriod ? sales.flatMap((sale) => salePayments(sale)).filter((payment) => {
    const date = new Date(payment.createdAt).getTime();
    return date >= previousStart.getTime() && date < rangeStart.getTime();
  }).reduce((sum, payment) => sum + payment.amount, 0) : 0;
  const dailyRevenue = days.map((date) => {
    const next = new Date(date);
    next.setDate(date.getDate() + 1);
    return periodPaymentEvents.filter(({ payment }) => {
      const time = new Date(payment.createdAt).getTime();
      return time >= date.getTime() && time < next.getTime();
    }).reduce((sum, event) => sum + event.payment.amount, 0);
  });
  const maxDailyRevenue = Math.max(0, ...dailyRevenue);
  const cash = periodPaymentEvents.filter(({ payment }) => payment.method === 'Cash').reduce((sum, event) => sum + event.payment.amount, 0);
  const upi = periodPaymentEvents.filter(({ payment }) => payment.method === 'UPI').reduce((sum, event) => sum + event.payment.amount, 0);
  const creditDue = creditSales.reduce((sum, sale) => sum + Math.max(0, sale.total - collectedAmount(sale)), 0);
  const collected = cash + upi;
  const upiPercent = collected > 0 ? upi / collected * 100 : 0;
  const productTotals = Object.values(currentSales.flatMap((sale) => sale.lines).reduce<Record<string, { name: string; qty: number }>>((acc, line) => {
    const key = line.productId || line.name;
    if (!acc[key]) acc[key] = { name: line.name, qty: 0 };
    acc[key].qty += line.qty;
    return acc;
  }, {})).sort((a, b) => b.qty - a.qty);
  const trackedStock = catalog.flatMap((product) => product.variants.map((variant) => ({ product, variant }))).filter(({ variant }) => typeof variant.stock === 'number');
  const stockValue = trackedStock.reduce((sum, { variant }) => sum + variant.stock! * variant.price, 0);
  const alerts = trackedStock.filter(({ variant }) => variant.stock! <= (variant.threshold ?? 0)).slice(0, 3);
  return <div className="rise-in">
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><p className="mb-1 text-sm font-semibold text-accent">A little clarity, every day.</p><h2 className="font-display text-[2.35rem] leading-none tracking-tight text-primary">What’s moving.</h2><p className="mt-2 text-sm text-muted-foreground">Sales and saved bills for the selected dates.</p></div>
      <div className="flex flex-wrap items-center gap-2 self-start"><label className="flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs font-bold text-muted-foreground"><CalendarDays size={15} /><span className="sr-only">Insights dates</span><select value={period} onChange={(event) => setPeriod(event.target.value as Period)} className="bg-transparent font-bold text-primary outline-none" data-testid="select-insights-period">{(Object.keys(periodLabels) as Period[]).map((value) => <option key={value} value={value}>{periodLabels[value]}</option>)}</select></label>{validPeriod && <ReportDownload sales={sales} catalog={catalog} settings={settings} range={{ start: rangeStart, end: rangeEnd, label: periodLabels[period] }} />}</div>
    </div>
    {period === 'custom' && <div className="mb-5 flex flex-wrap gap-3 rounded-xl border border-border bg-card p-4"><label className="text-xs font-bold">From<input type="date" value={customDates.from} onChange={(event) => setCustomDates((current) => ({ ...current, from: event.target.value }))} className="field mt-1 block" data-testid="input-bills-from" /></label><label className="text-xs font-bold">To<input type="date" value={customDates.to} onChange={(event) => setCustomDates((current) => ({ ...current, to: event.target.value }))} className="field mt-1 block" data-testid="input-bills-to" /></label></div>}
    {!validPeriod && <p role="alert" className="mb-5 text-sm font-bold text-destructive">The start date must be on or before the end date.</p>}
    {validPeriod && currentSales.length === 0 && <div className="mb-5 rounded-2xl border border-border bg-card p-6 text-center shadow-[var(--shadow-sm)]" data-testid="insights-empty"><ReceiptIndianRupee className="mx-auto text-primary" size={30} /><h3 className="mt-3 text-lg font-extrabold">No sales for {periodLabels[period].toLowerCase()}</h3><p className="mt-1 text-sm text-muted-foreground">Choose another date range or record a payment.</p></div>}
    <div className="grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
      <section className="rounded-2xl border border-border/80 bg-primary p-5 text-primary-foreground shadow-[0_16px_36px_hsl(var(--primary)/.14)] sm:p-6">
         <div className="flex items-start justify-between"><div><p className="text-xs font-bold text-primary-foreground/60">Collected revenue · {periodLabels[period].toLowerCase()}</p><p className="mt-2 text-4xl font-extrabold tracking-tight" data-testid="text-seven-day-collected">{money(revenue)}</p><p className="mt-2 text-xs font-bold text-sidebar-primary">{!chartAvailable ? 'Showing all selected dates' : previousRevenue > 0 ? `${((revenue - previousRevenue) / previousRevenue * 100).toFixed(1)}% compared to previous period` : 'No previous-period revenue to compare'}</p></div><span className="rounded-xl bg-primary-foreground/10 p-3 text-sidebar-primary"><BarChart3 size={20} /></span></div>
         {chartAvailable && validPeriod ? <div className="mt-8 flex h-28 items-end gap-2 sm:gap-4">{days.map((date, index) => <div key={date.toISOString()} className="flex flex-1 flex-col items-center gap-2" title={`${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}: ${money(dailyRevenue[index])}`}><div className="flex h-24 w-full items-end"><div className={`w-full rounded-t-md ${dailyRevenue[index] === maxDailyRevenue && maxDailyRevenue > 0 ? 'bg-sidebar-primary' : 'bg-primary-foreground/20'}`} style={{ height: maxDailyRevenue > 0 ? `${dailyRevenue[index] / maxDailyRevenue * 100}%` : '0%' }} /></div><span className="text-[9px] font-mono-app text-primary-foreground/45">{date.toLocaleDateString('en-IN', { weekday: 'short' })}</span></div>)}</div> : <p className="mt-6 text-xs text-primary-foreground/70">Daily chart is available for valid ranges of up to 31 days.</p>}
      </section>
      <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-[var(--shadow-sm)] sm:p-6">
         <p className="text-xs font-bold text-muted-foreground">Payment mix · {periodLabels[period].toLowerCase()}</p>
        {collected > 0 ? <div className="mt-5 flex items-center gap-5"><div className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(hsl(var(--primary)) 0 ${upiPercent}%, hsl(var(--accent)) ${upiPercent}% 100%)` }}><div className="flex h-20 w-20 items-center justify-center rounded-full bg-card text-center"><span className="text-lg font-extrabold">₹</span></div></div><div className="space-y-4 text-xs"><div><div className="flex items-center gap-2 font-bold"><span className="h-2.5 w-2.5 rounded-full bg-primary" /> UPI <span className="ml-2 font-mono-app text-muted-foreground">{money(upi)}</span></div><p className="ml-4 mt-1 text-[10px] text-muted-foreground">{upiPercent.toFixed(1)}% of collected</p></div><div><div className="flex items-center gap-2 font-bold"><span className="h-2.5 w-2.5 rounded-full bg-accent" /> Cash <span className="ml-2 font-mono-app text-muted-foreground">{money(cash)}</span></div><p className="ml-4 mt-1 text-[10px] text-muted-foreground">{(100 - upiPercent).toFixed(1)}% of collected</p></div></div></div> : <p className="mt-5 text-xs text-muted-foreground">No collected payments in this period.</p>}
        {creditDue > 0 && <p className="mt-4 rounded-xl bg-accent/10 p-3 text-xs font-bold text-accent">All unpaid credit: {money(creditDue)} · collect it below.</p>}
      </section>
    </div>
    {creditSales.length > 0 && <section className="mt-5 rounded-2xl border border-accent/20 bg-card p-5 shadow-[var(--shadow-sm)] sm:p-6" data-testid="section-credit-collection">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold text-accent">Credit collection</p><h3 className="mt-1 text-lg font-extrabold">Balances to collect</h3><p className="mt-1 text-xs text-muted-foreground">Record cash or UPI received against a bill; collections appear in Insights on the date received.</p></div><span className="rounded-lg bg-accent/10 px-3 py-2 text-xs font-extrabold text-accent">{creditSales.length} bills · {money(creditDue)}</span></div>
      <div className="mt-4 max-h-96 divide-y divide-border overflow-y-auto border-t border-border" data-testid="list-credit-collection">
        {creditSales.slice(0, 30).map((sale) => <div key={sale.id} className="py-3"><div className="flex items-start justify-between gap-3"><button type="button" onClick={() => onOpenBill(sale)} className="min-w-0 text-left hover:text-primary" data-testid={`button-credit-bill-${sale.id}`}><span className="block truncate text-xs font-extrabold">{sale.customerName?.trim() || sale.customer?.trim() || 'Walk-in customer'}</span><span className="mt-0.5 block text-[11px] text-muted-foreground">{sale.id} · {dateLabel(sale.createdAt)}</span></button><span className="shrink-0 text-right"><span className="block text-sm font-extrabold text-accent">{money(Math.max(0, sale.total - collectedAmount(sale)))}</span><span className="text-[10px] text-muted-foreground">due</span></span></div><div className="mt-2"><CollectCreditForm sale={sale} onCollect={onCollectCredit} /></div></div>)}
        {creditSales.length > 30 && <p className="p-3 text-center text-xs text-muted-foreground">Showing the 30 most recent unpaid bills. To collect from an older bill, select its date range in Saved bills below.</p>}
      </div>
    </section>}
    <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr]">
       <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-[var(--shadow-sm)] sm:p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-bold text-muted-foreground">Top sellers</p><h3 className="mt-1 text-lg font-extrabold">Customers came for these</h3></div><span className="rounded-lg bg-chart-3/12 px-2 py-1 text-[10px] font-bold text-chart-3">{periodLabels[period]}</span></div><div className="mt-5 space-y-4">{productTotals.length ? productTotals.slice(0, 4).map(({ name, qty }, index) => <div key={`${name}-${index}`} className="flex items-center gap-3"><span className="font-mono-app text-[10px] text-muted-foreground">0{index + 1}</span><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/8 text-[10px] font-extrabold text-primary">{initials(name)}</span><span className="flex-1 text-xs font-bold">{name}</span><span className="text-xs font-extrabold">{qty} sold</span><div className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-muted sm:block"><div className="h-full rounded-full bg-primary" style={{ width: `${qty / productTotals[0].qty * 100}%` }} /></div></div>) : <p className="text-xs text-muted-foreground">No products sold in this period.</p>}</div></section>
      <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-[var(--shadow-sm)] sm:p-6"><div className="flex items-center justify-between gap-2"><div><p className="text-xs font-bold text-muted-foreground">Inventory snapshot</p><h3 className="mt-1 text-lg font-extrabold">Worth keeping an eye on</h3></div><span className="rounded-lg bg-chart-4/20 px-2 py-1 text-[10px] font-bold">{trackedStock.length ? `${money(stockValue)} value` : 'Stock not tracked'}</span></div><div className="mt-5 space-y-3">{alerts.map(({ product, variant }) => <div key={`${product.id}-${variant.id}`} className="flex items-center gap-3 rounded-xl bg-accent/7 p-3"><AlertTriangle size={16} className="text-accent" /><div className="flex-1"><p className="text-xs font-bold">{product.name}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{variant.name} · threshold {variant.threshold ?? 0}</p></div><span className="font-mono-app text-xs font-bold text-accent">{variant.stock} left</span></div>)}{trackedStock.length > 0 && alerts.length === 0 && <div className="rounded-xl bg-chart-3/10 p-4 text-xs font-bold text-chart-3">No urgent stock alerts. Nice work.</div>}{trackedStock.length === 0 && <p className="text-xs text-muted-foreground">Add stock quantities to your catalog to see inventory value and alerts.</p>}</div></section>
    </div>
    <section className="mt-5 rounded-2xl border border-border/80 bg-card p-5 shadow-[var(--shadow-sm)] sm:p-6" data-testid="section-recent-bills">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="text-xs font-bold text-muted-foreground">Saved bills</p><h3 className="mt-1 text-lg font-extrabold">Recent bills by date</h3><p className="mt-1 text-xs text-muted-foreground">Tap a bill to view its receipt and PDF.</p></div>
         <span className="text-xs font-bold text-primary">{periodLabels[period]}</span>
      </div>
       {!validPeriod ? <p role="alert" className="mt-4 text-xs font-bold text-destructive">Select a valid date range above.</p> : selectedBills.length ? <div className="mt-4 max-h-96 divide-y divide-border overflow-y-auto border-t border-border" data-testid="list-recent-bills">
         {selectedBills.map((sale) => <div key={sale.id}>
           <button type="button" onClick={() => onOpenBill(sale)} className="flex w-full items-start justify-between gap-3 py-3 text-left hover:text-primary" data-testid={`button-recent-bill-${sale.id}`}>
             <span className="min-w-0"><span className="block truncate text-xs font-extrabold">{sale.customerName?.trim() || sale.customer?.trim() || 'Walk-in customer'}</span><span className="mt-0.5 block text-[11px] text-muted-foreground">{sale.id} · {dateLabel(sale.createdAt)}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{sale.customerName && sale.customer ? `${sale.customer} · ` : ''}{sale.lines.map((line) => line.name).join(', ') || 'Bill'} · {sale.paymentMethod}</span></span>
             <span className="shrink-0 text-right"><span className="block text-sm font-extrabold">{money(sale.total)}</span><span className="text-[11px] text-muted-foreground">{money(collectedAmount(sale))} collected</span></span>
           </button>
            {sale.total - collectedAmount(sale) > 0.005 && !visibleCreditIds.has(sale.id) && <CollectCreditForm sale={sale} onCollect={onCollectCredit} />}
         </div>)}
      </div> : <p className="mt-4 rounded-xl bg-muted/50 p-4 text-xs text-muted-foreground" data-testid="status-no-bills-in-range">No saved bills for these dates.</p>}
    </section>
  </div>;
}

function CollectCreditForm({ sale, onCollect }: { sale: Sale; onCollect: (saleId: string, method: 'Cash' | 'UPI', amount: number) => void }) {
  const due = Math.max(0, roundMoney(sale.total - collectedAmount(sale)));
  const [amount, setAmount] = useState(due.toFixed(2));
  const [method, setMethod] = useState<'Cash' | 'UPI'>('Cash');
  useEffect(() => setAmount(due.toFixed(2)), [due]);
  const value = Number(amount);
  const valid = Number.isFinite(value) && value > 0 && value <= due && roundMoney(value) === value;
  return <form onSubmit={(event) => { event.preventDefault(); if (valid) onCollect(sale.id, method, value); }} className="mb-3 flex flex-wrap items-end gap-2 rounded-xl bg-accent/7 p-3" data-testid={`form-collect-credit-${sale.id}`}>
    <p className="mr-auto w-full text-[11px] font-bold text-accent">Credit due: {money(due)}</p>
    <label className="min-w-28 flex-1 text-[10px] font-bold text-muted-foreground">Amount<input type="number" min="0.01" max={due} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="field mt-1" aria-label="Credit amount collected" /></label>
    <label className="text-[10px] font-bold text-muted-foreground">Method<select value={method} onChange={(event) => setMethod(event.target.value as 'Cash' | 'UPI')} className="field mt-1"><option value="Cash">Cash</option><option value="UPI">UPI</option></select></label>
    <button type="submit" disabled={!valid} className="rounded-lg bg-primary px-3 py-2.5 text-xs font-extrabold text-primary-foreground disabled:opacity-40" data-testid={`button-collect-credit-${sale.id}`}>Collect</button>
  </form>;
}

function NotificationsView({ lowStock, sales, onGoCatalog }: { lowStock: { product: Product; variant: Variant }[]; sales: Sale[]; onGoCatalog: () => void }) {
  return <div className="rise-in"><div className="mb-7"><p className="mb-1 text-sm font-semibold text-accent">The useful kind of noise.</p><h2 className="font-display text-[2.35rem] leading-none tracking-tight text-primary">Notifications.</h2><p className="mt-2 text-sm text-muted-foreground">Small nudges to help the shop stay ready.</p></div><div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><section className="rounded-2xl border border-border/80 bg-card p-5 shadow-[var(--shadow-sm)] sm:p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-accent">Needs attention</p><h3 className="mt-1 text-xl font-extrabold">Stock alerts</h3></div><span className="rounded-full bg-accent/12 px-3 py-1 text-[11px] font-bold text-accent">{lowStock.length} open</span></div>{lowStock.length === 0 ? <EmptyState icon={CircleCheck} title="Shelf looks good" description="No products have crossed their low-stock threshold." action="View catalog" onAction={onGoCatalog} /> : <div className="mt-5 space-y-2">{lowStock.map(({ product, variant }) => <div key={variant.id} className="flex items-center gap-3 rounded-xl border border-accent/15 bg-accent/6 p-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/12 text-accent"><AlertTriangle size={16} /></span><div className="flex-1"><p className="text-xs font-bold">{product.name}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{variant.name} · reorder at {variant.threshold} {variant.unit}s</p></div><span className="text-right"><strong className="block text-sm font-extrabold text-accent">{variant.stock}</strong><small className="text-[9px] font-bold text-muted-foreground">left</small></span></div>)}<button onClick={onGoCatalog} className="mt-4 text-xs font-bold text-primary hover:underline" data-testid="button-notification-catalog">Open catalog to restock <ArrowUpRight className="ml-1 inline" size={13} /></button></div>}</section><section className="rounded-2xl border border-border/80 bg-primary p-5 text-primary-foreground shadow-[0_16px_36px_hsl(var(--primary)/.14)] sm:p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-bold text-primary-foreground/55">Weekly pulse</p><h3 className="mt-1 text-xl font-extrabold">Your shop is moving.</h3></div><span className="rounded-xl bg-sidebar-primary p-2 text-sidebar-primary-foreground"><BarChart3 size={17} /></span></div><p className="mt-8 font-display text-3xl leading-tight">“{sales.length ? 'More bills, more rhythm.' : 'A fresh week starts with one bill.'}”</p><div className="mt-8 border-t border-primary-foreground/12 pt-4"><div className="flex items-center justify-between text-xs"><span className="text-primary-foreground/60">Busiest hour</span><span className="font-bold">6:00 – 8:00 pm</span></div><div className="mt-3 flex items-center justify-between text-xs"><span className="text-primary-foreground/60">Most used payment</span><span className="font-bold">UPI <span className="text-sidebar-primary">58%</span></span></div></div></section></div></div>;
}

function BroadcastView({ settings, onOpen }: { settings: ShopSettings; onOpen: () => void }) {
  return <div className="rise-in"><div className="mb-7"><p className="mb-1 text-sm font-semibold text-accent">A friendly tap on the shoulder.</p><h2 className="font-display text-[2.35rem] leading-none tracking-tight text-primary">Broadcast.</h2><p className="mt-2 text-sm text-muted-foreground">Let customers know what’s fresh, useful or worth a visit.</p></div><div className="grid gap-5 lg:grid-cols-[1fr_360px]"><section className="rounded-2xl border border-border/80 bg-card p-5 shadow-[var(--shadow-sm)] sm:p-7"><div className="max-w-lg"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-chart-3/12 text-chart-3"><MessageCircleMore size={24} /></span><h3 className="mt-6 font-display text-3xl text-primary">Your customers are already listening.</h3><p className="mt-3 text-sm leading-6 text-muted-foreground">Save numbers as you go and send a thoughtful WhatsApp note when new stock arrives, prices change, or festival days are near.</p><button onClick={onOpen} className="mt-6 flex h-11 items-center gap-2 rounded-xl bg-chart-3 px-4 text-xs font-extrabold text-white hover:brightness-105" data-testid="button-start-broadcast"><Send size={16} /> Start a broadcast</button></div></section><section className="rounded-2xl border border-border/80 bg-card p-5 shadow-[var(--shadow-sm)]"><p className="text-xs font-bold text-muted-foreground">Your broadcast profile</p><div className="mt-5 flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-sm font-extrabold text-primary">{initials(settings.shopName)}</span><div><p className="text-sm font-extrabold">{settings.shopName}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{settings.phone}</p></div></div><div className="mt-6 rounded-xl bg-muted/50 p-3.5 text-xs leading-5 text-muted-foreground">Tip: Keep it personal and useful. A short note about fresh stock works better than a long offer list.</div></section></div></div>;
}

function ShopPlanAccess({ mode, variant }: { mode: AppVersion; variant?: 'button' | 'settings' }) {
  const { shop, updateSnapshot, requestFull, refresh } = useSellerShop();
  return <PlanAccess variant={variant} mode={mode} premiumApproved={shop.premiumApproved} requestedAt={shop.upgradeRequestedAt} onChooseMode={(workspaceMode) => {
    void updateSnapshot((previous) => ({ ...previous, settings: { ...previous.settings, workspaceMode } })).catch(() => undefined);
  }} onRequestFull={requestFull} onRefresh={async () => { await refresh(); }} />;
}

function SettingsView({ settings, sales, catalog, appVersion, onSave }: { settings: ShopSettings; sales: Sale[]; catalog: Product[]; appVersion: AppVersion; onSave: (settings: ShopSettings) => void }) {
  const [form, setForm] = useState(settings);
  const lastSaved = useRef(settings);
  const { saveStatus } = useSellerShop();
  useEffect(() => {
    const previous = lastSaved.current;
    setForm((current) => sameData(current, previous) ? settings : current);
    lastSaved.current = settings;
  }, [settings]);
  return <div className="rise-in">
    <div className="mb-7"><p className="text-sm font-semibold text-accent">Make it yours.</p><h2 className="font-display text-[2.35rem] leading-none text-primary">Settings.</h2></div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-7">
        <div className="border-b border-border pb-5"><ShopPlanAccess mode={appVersion} variant="settings" /></div>
        <div className="border-b border-border pb-5"><h3 className="text-lg font-extrabold">Shop details</h3><p className="mt-1 text-xs text-muted-foreground">Shown on bills and receipts.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Shop name"><input value={form.shopName} onChange={(event) => setForm({ ...form, shopName: event.target.value })} className="field" data-testid="input-shop-name" /></Field><Field label="Phone number"><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="field" data-testid="input-shop-phone" /></Field></div></div>
        <div className="border-b border-border py-5"><PaymentQRManager profiles={form.paymentQrs} onChange={(paymentQrs) => setForm((current) => ({ ...current, paymentQrs }))} /></div>
        <div className="border-b border-border py-5">
          <div className="flex items-center justify-between"><div><h3 className="text-lg font-extrabold">GST invoices</h3><p className="mt-1 text-xs text-muted-foreground">Add tax details when needed.</p></div><button onClick={() => setForm({ ...form, gstEnabled: !form.gstEnabled })} className={`relative h-6 w-11 rounded-full ${form.gstEnabled ? 'bg-primary' : 'bg-muted-foreground/25'}`} aria-label="Toggle GST" aria-pressed={form.gstEnabled} data-testid="toggle-gst"><span className={`absolute top-1 h-4 w-4 rounded-full bg-card transition-transform ${form.gstEnabled ? 'translate-x-6' : 'translate-x-1'}`} /></button></div>
          {form.gstEnabled && <div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="GSTIN"><input value={form.gstin} onChange={(event) => setForm({ ...form, gstin: event.target.value.toUpperCase() })} className="field" placeholder="22AAAAA0000A1Z5" data-testid="input-gstin" /></Field><Field label="GST rate"><select value={form.gstRate} onChange={(event) => setForm({ ...form, gstRate: Number(event.target.value) })} className="field" data-testid="select-gst-rate"><option value={5}>5%</option><option value={12}>12%</option><option value={18}>18%</option></select></Field></div>}
        </div>
        <div className="flex flex-col justify-between gap-4 pt-5 sm:flex-row sm:items-center"><div><h3 className="text-sm font-extrabold">Night mode</h3><p className="mt-1 text-xs text-muted-foreground">Easier on the eyes after sunset.</p></div><button onClick={() => setForm({ ...form, darkMode: !form.darkMode })} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-bold" data-testid="button-toggle-theme">{form.darkMode ? <Moon size={15} /> : <Sun size={15} />} {form.darkMode ? 'Dark' : 'Light'} mode</button></div>
        <button onClick={() => onSave(form)} className="mt-7 flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-xs font-extrabold text-primary-foreground" data-testid="button-save-settings"><Check size={16} /> Save changes</button>
      </section>
      <aside className="space-y-5"><ReportExport sales={sales} catalog={catalog} settings={settings} /><section className="rounded-2xl border border-primary/15 bg-primary p-5 text-primary-foreground"><ShieldCheck size={22} className="text-sidebar-primary" /><h3 className="mt-4 text-lg font-extrabold">Device + cloud storage</h3><p className="mt-2 text-xs leading-5 text-primary-foreground/80">Changes are saved to this device first, then synced to your shop’s Supabase database when internet and your signed-in session are available. Uploaded photos are also copied to Supabase and saved on this device. Conflicting edits need your choice. Do not clear browser storage or app data while changes are waiting to sync.</p><p role="status" className="mt-3 text-xs font-bold">{saveStatus}</p><p className="mt-3 text-[11px] leading-5 text-primary-foreground/70">Sign in online once on each device. Offline access uses the last approved access status; admin changes take effect when the device reconnects.</p></section></aside>
    </div>
  </div>;
}

function AccountQRPreview({ profile }: { profile: PaymentQR }) {
  const uri = accountUpiUri(profile);
  const [image, setImage] = useState('');
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setImage('');
    setError(false);
    if (uri) QRCode.toDataURL(uri, { width: 256, margin: 1 })
      .then((result) => { if (active) setImage(result); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [uri]);
  if (error) return <p role="alert" className="text-xs text-destructive">Could not generate account QR.</p>;
  const src = uri ? image : profile.image;
  return src ? <img src={src} alt={`${profile.label} receiving account QR`} className="size-24 shrink-0 rounded-lg bg-white p-1" data-testid={`image-account-qr-${profile.id}`} /> : <span className="flex size-24 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Smartphone size={22} /></span>;
}

function PaymentQRManager({ profiles, onChange }: { profiles: PaymentQR[]; onChange: (profiles: PaymentQR[]) => void }) {
  const empty = (): PaymentQR => ({ id: crypto.randomUUID(), label: '', upiId: '', upiName: '' });
  const [draft, setDraft] = useState<PaymentQR>(empty);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const saveProfile = () => {
    const issue = validatePaymentQR(draft);
    if (issue) return setError(issue);
    const cleaned = { ...draft, label: draft.label.trim(), upiId: draft.upiId.trim(), upiName: draft.upiName.trim() };
    onChange(profiles.some((item) => item.id === draft.id) ? profiles.map((item) => item.id === draft.id ? cleaned : item) : [...profiles, cleaned]);
    setDraft(empty());
    setError('');
  };
  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try { const image = await uploadSellerPhoto(await prepareQrImage(file)); setDraft((current) => ({ ...current, image })); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not read this QR image.'); }
    finally { setUploading(false); }
  };
  return <div>
    <h3 className="text-lg font-extrabold">Receiving accounts & QR codes</h3>
    <p className="mt-1 text-xs leading-5 text-muted-foreground">Add a receiving UPI ID here. Its account QR is generated automatically; the final bill QR uses the same account with the approved amount. An uploaded image is a separate fixed QR and its recipient cannot be verified here.</p>
    {profiles.length > 0 && <div className="mt-4 space-y-2">{profiles.map((profile) => <div key={profile.id} className="flex items-center gap-3 rounded-xl border border-border bg-background p-3">
      <AccountQRPreview profile={profile} />
      <div className="min-w-0 flex-1"><p className="text-sm font-extrabold">{profile.label}</p><p className="break-all text-xs text-muted-foreground">{profile.upiId || 'Uploaded fixed QR'}</p><p className="mt-1 text-[11px] text-muted-foreground">{profile.upiId ? 'Account QR · bill QR links to this UPI ID' : 'Confirm the recipient in the payment app'}{profile.upiId && profile.image ? ' · Uploaded image is ignored' : ''}</p></div>
      <button onClick={() => { setDraft(profile); setError(''); }} className="rounded-lg px-2 py-1 text-xs font-bold text-primary" data-testid={`button-edit-qr-${profile.id}`}>Edit</button>
      <button onClick={() => { if (window.confirm(`Remove ${profile.label} QR?`)) onChange(profiles.filter((item) => item.id !== profile.id)); }} className="rounded-lg p-2 text-destructive" aria-label={`Remove ${profile.label} QR`} data-testid={`button-remove-qr-${profile.id}`}><Trash2 size={16} /></button>
    </div>)}</div>}
    <div className="mt-5 rounded-xl border border-border bg-background p-4">
      <h4 className="text-sm font-extrabold">{profiles.some((item) => item.id === draft.id) ? 'Edit QR' : 'Add a QR'}</h4>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Name"><input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} placeholder="Shop / Personal" className="field" data-testid="input-qr-label" /></Field>
        <Field label="UPI ID (optional with image)"><input value={draft.upiId} onChange={(event) => setDraft({ ...draft, upiId: event.target.value })} placeholder="yourname@bank" className="field" data-testid="input-upi-id" /></Field>
        <Field label="Recipient name"><input value={draft.upiName} onChange={(event) => setDraft({ ...draft, upiName: event.target.value })} placeholder="Name displayed on UPI apps" className="field" data-testid="input-upi-name" /></Field>
        <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-primary/40 px-3 py-2 text-xs font-bold text-primary">{uploading ? 'Preparing image...' : draft.image ? 'Change QR image' : 'Upload QR image'}<input type="file" accept="image/*" onChange={(event) => upload(event.target.files?.[0])} className="sr-only" data-testid="input-qr-image" /></label>
      </div>
      {draft.image && <div className="mt-3 flex items-center gap-3"><img src={draft.image} alt="QR preview" className="h-20 w-20 rounded-lg border border-border object-contain" /><button onClick={() => setDraft({ ...draft, image: undefined })} className="text-xs font-bold text-destructive">Remove image</button></div>}
      {error && <p className="mt-3 text-xs font-bold text-destructive" role="alert">{error}</p>}
      <div className="mt-4 flex items-center justify-between"><p className="text-[11px] text-muted-foreground">Click Save changes below to keep profile edits on your shop account.</p><button onClick={saveProfile} disabled={uploading} className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-extrabold text-primary-foreground disabled:opacity-50" data-testid="button-add-qr-profile">{profiles.some((item) => item.id === draft.id) ? 'Update QR' : 'Add QR'}</button></div>
    </div>
  </div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>{children}</label>;
}

async function compressProductPhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) throw new Error('Choose a photo smaller than 10 MB.');
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 480 / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not prepare the photo.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.72);
}

function ProductModal({ basic, product, draft, onClose, onSave, onDelete }: { basic: boolean; product?: Product; draft?: Product; onClose: () => void; onSave: (product: Product) => void; onDelete: (id: string) => void }) {
  const [form, setForm] = useState<Product>(draft ?? product ?? { id: crypto.randomUUID(), name: '', category: 'Grocery', updatedAt: 'Just now', variants: [{ id: crypto.randomUUID(), name: 'Standard', price: 0, stock: undefined, threshold: undefined, unit: 'piece' }] });
  const [photoBusy, setPhotoBusy] = useState(false);
  const updateVariant = (id: string, patch: Partial<Variant>) => setForm((current) => ({ ...current, variants: current.variants.map((variant) => variant.id === id ? { ...variant, ...patch } : variant) }));
  const uploadPhoto = async (file?: File) => {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const image = await uploadSellerPhoto(await compressProductPhoto(file));
      setForm((current) => ({ ...current, image }));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not read this photo.');
    } finally {
      setPhotoBusy(false);
    }
  };
  const save = () => {
    if (!form.name.trim()) return window.alert('Enter a product name.');
    if (!basic && !product && !form.image) return window.alert('Attach a product photo.');
    if (form.variants.some((variant) => !variant.name.trim() || !Number.isFinite(variant.price) || variant.price <= 0)) return window.alert('Enter a name and price for each option.');
    onSave({ ...form, name: form.name.trim(), updatedAt: 'Just now' });
  };
  return <Modal title={product ? 'Edit product' : 'Add a product'} onClose={onClose}>
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border-2 border-dashed border-primary/30 bg-background text-center">
        <div className="relative mx-auto h-36 w-full max-w-48"><ProductArtwork product={form} className="h-full w-full rounded-xl" /></div>
        <p className="py-2 text-xs font-bold text-primary">{photoBusy ? 'Preparing photo...' : form.image ? 'Change product photo' : basic ? 'Add product photo (optional)' : 'Attach a product photo'}</p>
        <div className="flex justify-center gap-2 px-3 pb-3">
          <label className="cursor-pointer rounded-lg border border-primary/30 bg-card px-3 py-2 text-xs font-bold text-primary" htmlFor="gallery-product-photo">Choose from gallery</label>
          <input id="gallery-product-photo" type="file" accept="image/*" onChange={(event) => { uploadPhoto(event.target.files?.[0]); event.target.value = ''; }} className="sr-only" data-testid="input-product-photo" />
          <label className="cursor-pointer rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground" htmlFor="camera-product-photo">Take picture</label>
          <input id="camera-product-photo" type="file" accept="image/*" capture="environment" onChange={(event) => { uploadPhoto(event.target.files?.[0]); event.target.value = ''; }} className="sr-only" data-testid="input-product-camera" />
        </div>
      </div>
      <Field label="Product name"><input autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Coconut Oil" className="field" data-testid="input-product-name" /></Field>
      <Field label="Category"><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="field" data-testid="select-product-category">{categories.slice(1).map((item) => <option key={item}>{item}</option>)}{!categories.includes(form.category) && form.category !== 'Other' && <option>{form.category}</option>}<option>Other</option></select></Field>
      <div>
        <div className="mb-2 flex items-center justify-between"><span className="text-xs font-bold text-muted-foreground">Sizes & prices</span><button onClick={() => setForm({ ...form, variants: [...form.variants, { id: crypto.randomUUID(), name: '', price: 0, stock: undefined, threshold: undefined, unit: 'piece' }] })} className="flex items-center gap-1 text-xs font-bold text-primary" data-testid="button-add-variant"><Plus size={14} /> Add size</button></div>
        <div className="space-y-2">{form.variants.map((variant, index) => <div key={variant.id} className="rounded-xl border border-border bg-background p-3">
          <label className="mb-2 flex cursor-pointer items-center gap-2 text-xs font-bold text-primary">{variant.image && <img src={variant.image} alt="" className="h-10 w-10 rounded-lg object-cover" />}{variant.image ? 'Change type photo' : 'Add type photo (optional)'}<input type="file" accept="image/*" className="sr-only" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { const image = await uploadSellerPhoto(await compressProductPhoto(file)); updateVariant(variant.id, { image }); } catch (cause) { window.alert(cause instanceof Error ? cause.message : 'Could not read this photo.'); } }} data-testid={`input-variant-photo-${index}`} /></label>
          <div className="grid grid-cols-[1fr_86px] gap-2"><input value={variant.name} onChange={(event) => updateVariant(variant.id, { name: event.target.value })} placeholder="Size" className="field" data-testid={`input-variant-name-${index}`} /><input type="number" min={0} value={variant.price} onChange={(event) => updateVariant(variant.id, { price: Number(event.target.value) })} placeholder="₹ Price" className="field" data-testid={`input-variant-price-${index}`} /></div>
          <div className="mt-2 grid grid-cols-3 gap-2"><input value={variant.unit} onChange={(event) => updateVariant(variant.id, { unit: event.target.value })} placeholder="Unit" className="field" data-testid={`input-variant-unit-${index}`} /><input type="number" min={0} value={variant.stock ?? ''} onChange={(event) => updateVariant(variant.id, { stock: event.target.value === '' ? undefined : Math.max(0, Number(event.target.value)) })} placeholder="Stock" className="field" data-testid={`input-variant-stock-${index}`} /><input type="number" min={0} value={variant.threshold ?? ''} onChange={(event) => updateVariant(variant.id, { threshold: event.target.value === '' ? undefined : Math.max(0, Number(event.target.value)) })} placeholder="Alert at" className="field" data-testid={`input-variant-threshold-${index}`} /></div>
          {form.variants.length > 1 && <button onClick={() => setForm({ ...form, variants: form.variants.filter((item) => item.id !== variant.id) })} className="mt-2 text-[11px] font-bold text-destructive">Remove size</button>}
        </div>)}</div>
      </div>
    </div>
    <div className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-4">{product ? <button onClick={() => { if (window.confirm(`Delete ${product.name}?`)) onDelete(product.id); }} className="text-xs font-bold text-destructive" data-testid="button-modal-delete">Delete product</button> : <span />}<button onClick={save} disabled={photoBusy} className="flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-extrabold text-primary-foreground disabled:opacity-50" data-testid="button-save-product"><Check size={15} /> Save product</button></div>
  </Modal>;
}

function usePdfDownload(bill: Sale, settings: ShopSettings, kind: 'bill' | 'receipt', enabled = true) {
  const [prepared, setPrepared] = useState<{ url: string; bill: Sale; settings: ShopSettings; kind: 'bill' | 'receipt' } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let createdUrl = '';
    setFailed(false);
    if (!enabled) return;
    createBillPdf(bill, settings, kind).then((blob) => {
      createdUrl = URL.createObjectURL(blob);
      if (active) setPrepared({ url: createdUrl, bill, settings, kind });
      else URL.revokeObjectURL(createdUrl);
    }).catch(() => { if (active) setFailed(true); });
    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [bill, settings, kind, enabled]);
  return { url: enabled && prepared?.bill === bill && prepared.settings === settings && prepared.kind === kind ? prepared.url : '', failed };
}

function CustomerFields({ name, number, onNameChange, onNumberChange }: {
  name: string; number: string; onNameChange: (value: string) => void; onNumberChange: (value: string) => void;
}) {
  return <div className="grid gap-3 sm:grid-cols-2">
    <Field label="Customer name (optional)"><input type="text" value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="Name for this bill" maxLength={80} className="field" data-testid="input-customer-name" /></Field>
    <Field label="Customer phone (optional)"><input type="tel" inputMode="tel" value={number} onChange={(event) => onNumberChange(event.target.value)} placeholder="Phone number" maxLength={20} className="field" data-testid="input-payment-customer" /></Field>
  </div>;
}

function BasicPaymentModal({ total, onClose, onComplete }: {
  total: number; onClose: () => void; onComplete: (method: PaymentMethod) => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>('UPI');
  const methods: { value: PaymentMethod; label: string; icon: typeof Smartphone }[] = [
    { value: 'UPI', label: 'UPI', icon: Smartphone },
    { value: 'Cash', label: 'Cash', icon: Banknote },
    { value: 'Credit', label: 'Credit', icon: ReceiptIndianRupee },
  ];
  return <Modal title="Payment" onClose={onClose}>
    <div className="rounded-xl bg-primary p-6 text-primary-foreground">
      <p className="text-xs font-bold uppercase tracking-widest opacity-75">Tell the customer · amount due</p>
      <p className="mt-2 text-5xl font-extrabold tabular-nums" data-testid="basic-amount-due">{money(total)}</p>
    </div>
    <p className="mb-3 mt-6 text-sm font-bold">How did the customer pay?</p>
    <div className="grid grid-cols-3 gap-2">
      {methods.map(({ value, label, icon: Icon }) => <button key={value} type="button" onClick={() => setMethod(value)} aria-pressed={method === value} className={`flex items-center justify-center gap-2 rounded-xl border py-3 text-xs font-extrabold ${method === value ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`} data-testid={`button-payment-${value.toLowerCase()}`}><Icon size={16} /> {label}</button>)}
    </div>
    <p className="mt-4 text-xs leading-5 text-muted-foreground" data-testid="basic-payment-note">{method === 'UPI' ? 'Use the QR already displayed in your shop. Confirm payment in your UPI app before marking it received.' : method === 'Cash' ? 'Confirm you have received the cash before marking it received.' : 'Record this bill as credit. The full amount remains due; collect it later and track it in Full Insights.'}</p>
    <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
      <button type="button" onClick={onClose} className="rounded-xl px-4 py-3 text-sm font-bold text-muted-foreground">Back</button>
      <button type="button" onClick={() => onComplete(method)} className="rounded-xl bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground" data-testid="button-confirm-payment">{method === 'Credit' ? 'Record credit' : `Mark ${money(total)} received`}</button>
    </div>
  </Modal>;
}

function BasicPaymentTotals({ sales }: { sales: Sale[] }) {
  const today = localDateInput(new Date());
  const todaysSales = sales.filter((sale) => localDateInput(new Date(sale.createdAt)) === today);
  const todaysPayments = sales.flatMap(salePayments).filter((entry) => localDateInput(new Date(entry.createdAt)) === today);
  const cash = todaysPayments.filter((entry) => entry.method === 'Cash').reduce((sum, entry) => sum + entry.amount, 0);
  const upi = todaysPayments.filter((entry) => entry.method === 'UPI').reduce((sum, entry) => sum + entry.amount, 0);
  const credit = sales.reduce((sum, sale) => sum + Math.max(0, sale.total - collectedAmount(sale)), 0);
  return <section className="mt-5 rounded-2xl border border-border bg-card p-5" aria-label="Today’s payment totals" data-testid="basic-payment-totals">
    <div className="flex items-center justify-between"><div><h3 className="font-extrabold">Today’s payment totals</h3><p className="mt-1 text-xs text-muted-foreground">Summary only in Basic; full bill history is available in Full.</p></div><span className="text-[10px] font-bold text-muted-foreground">{todaysSales.length} bills</span></div>
    <div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-muted/40 p-3"><p className="text-[10px] font-bold text-muted-foreground">UPI today</p><p className="mt-1 text-sm font-extrabold">{money(upi)}</p></div><div className="rounded-xl bg-muted/40 p-3"><p className="text-[10px] font-bold text-muted-foreground">Cash today</p><p className="mt-1 text-sm font-extrabold">{money(cash)}</p></div><div className="rounded-xl bg-accent/10 p-3"><p className="text-[10px] font-bold text-accent">Credit due now</p><p className="mt-1 text-sm font-extrabold">{money(credit)}</p></div></div>
  </section>;
}

function PaymentModal({ basic, total, subtotal, gst, lines, settings, onSaveQR, onClose, onComplete }: {
  basic: boolean; total: number; subtotal: number; gst: number; lines: BillLine[]; settings: ShopSettings;
  onSaveQR: (profile: PaymentQR) => void; onClose: () => void;
  onComplete: (method: PaymentMethod, paid: number, discount: number, customerName?: string, customer?: string, paymentQr?: PaymentQR) => void;
}) {
  const [approved, setApproved] = useState(false);
  const [discountType, setDiscountType] = useState<'amount' | 'percent'>('amount');
  const [discountInput, setDiscountInput] = useState('');
  const discountNumber = discountInput.trim() ? Number(discountInput) : 0;
  const validDiscount = Number.isFinite(discountNumber) && discountNumber >= 0 && (discountType === 'percent' ? discountNumber <= 100 : discountNumber <= total);
  const discount = validDiscount ? roundMoney(discountType === 'percent' ? total * discountNumber / 100 : discountNumber) : 0;
  const finalTotal = roundMoney(total - discount);
  const [method, setMethod] = useState<PaymentMethod>('UPI');
  const [paid, setPaid] = useState(String(total));
  const [customerName, setCustomerName] = useState('');
  const [customer, setCustomer] = useState('');
  const customerNameValue = customerName.trim();
  const customerNumberValue = customer.trim();
  const [selectedId, setSelectedId] = useState(settings.paymentQrs[0]?.id ?? '');
  const [generated, setGenerated] = useState<{ uri: string; image: string } | null>(null);
  const [qrError, setQrError] = useState(false);
  const [addingQR, setAddingQR] = useState(false);
  const [newQR, setNewQR] = useState<PaymentQR>({ id: crypto.randomUUID(), label: '', upiId: '', upiName: '' });
  const [newQRError, setNewQRError] = useState('');
  const [uploading, setUploading] = useState(false);
  const enteredPaid = Number(paid);
  const validPaid = method === 'Credit' || (paid.trim() !== '' && Number.isFinite(enteredPaid) && enteredPaid >= 0
    && enteredPaid <= finalTotal && (enteredPaid > 0 || finalTotal === 0)
    && roundMoney(enteredPaid) === enteredPaid);
  const paidValue = method === 'Credit' ? 0 : validPaid ? enteredPaid : 0;
  const chosen = settings.paymentQrs.find((profile) => profile.id === selectedId) ?? settings.paymentQrs[0];
  const paymentProfile = useMemo(() => ({
    ...settings,
    upiId: basic ? '' : chosen?.upiId ?? '',
    upiName: chosen?.upiName ?? '',
    qrImage: basic ? undefined : chosen?.image,
    omitPaymentQr: basic,
  }), [settings, chosen, basic]);
  const upiUri = !basic && approved && validPaid && method === 'UPI' ? getUpiUri(paymentProfile, paidValue) : null;
  const qrData = !basic && approved && validPaid && method === 'UPI' ? upiUri ? generated?.uri === upiUri ? generated.image : '' : chosen?.image ?? '' : '';

  useEffect(() => {
    let active = true;
    setQrError(false);
    if (upiUri) QRCode.toDataURL(upiUri, { width: 320, margin: 1 })
      .then((image) => { if (active) setGenerated({ uri: upiUri, image }); })
      .catch(() => { if (active) setQrError(true); });
    return () => { active = false; };
  }, [upiUri]);

  const addQR = () => {
    const issue = validatePaymentQR(newQR);
    if (issue) return setNewQRError(issue);
    const profile = { ...newQR, label: newQR.label.trim(), upiId: newQR.upiId.trim(), upiName: newQR.upiName.trim() };
    onSaveQR(profile);
    setSelectedId(profile.id);
    setNewQR({ id: crypto.randomUUID(), label: '', upiId: '', upiName: '' });
    setNewQRError('');
    setAddingQR(false);
  };
  const uploadQR = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try { const image = await prepareQrImage(file); setNewQR((current) => ({ ...current, image })); setNewQRError(''); }
    catch (cause) { setNewQRError(cause instanceof Error ? cause.message : 'Could not read the QR image.'); }
    finally { setUploading(false); }
  };
  const [draftDate] = useState(() => new Date().toISOString());
  const draft = useMemo<Sale>(() => ({ id: 'DRAFT', createdAt: draftDate, lines, subtotal, gst, discount, total: finalTotal, paid: paidValue, paymentMethod: method, paymentQr: basic ? undefined : chosen, customerName: customerNameValue || undefined, customer: customerNumberValue || undefined }), [draftDate, lines, subtotal, gst, discount, finalTotal, paidValue, method, chosen, basic, customerNameValue, customerNumberValue]);
  const pdf = usePdfDownload(draft, paymentProfile, 'bill', approved && validPaid);

  return <Modal title={approved ? 'Approved bill & payment QR' : 'Seller review & discount'} onClose={onClose} large>
    {!approved ? <div className="space-y-5" data-testid="stage-seller-review">
      <p className="text-sm text-muted-foreground">Review the bill and apply any discount before approving it. The PDF and QR are made only after approval.</p>
      <div className="max-h-[35dvh] space-y-2 overflow-y-auto rounded-xl border border-border p-4">{lines.map((line) => <div key={line.lineId} className="flex justify-between gap-3 text-sm"><span>{line.name} · {line.variant} × {line.qty} {line.unit}</span><strong>{money(roundMoney(line.price * line.qty))}</strong></div>)}</div>
      <div className="grid gap-3 rounded-xl bg-muted/55 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <Field label="Discount"><input type="number" min="0" max={discountType === 'percent' ? 100 : total} step="0.01" inputMode="decimal" value={discountInput} onChange={(event) => setDiscountInput(event.target.value)} placeholder="0" className="field" data-testid="input-bill-discount" /></Field>
        <select aria-label="Discount type" value={discountType} onChange={(event) => setDiscountType(event.target.value as 'amount' | 'percent')} className="field sm:w-32" data-testid="select-discount-type"><option value="amount">₹ off</option><option value="percent">% off</option></select>
        <div className="text-right"><p className="text-xs text-muted-foreground">Final amount</p><strong className="text-3xl font-extrabold text-primary" data-testid="text-discounted-total">{validDiscount ? money(finalTotal) : '—'}</strong></div>
      </div>
      {!validDiscount && <p role="alert" className="text-xs font-bold text-destructive">Enter a discount between 0 and {discountType === 'percent' ? '100%' : money(total)}.</p>}
      <div className="text-sm text-muted-foreground">Subtotal {money(subtotal)}{gst > 0 && ` · GST ${money(gst)}`} · Discount {money(discount)}</div>
      <div className="rounded-xl border border-border bg-card p-4"><p className="mb-3 text-sm font-extrabold">Who is this bill for?</p><CustomerFields name={customerName} number={customer} onNameChange={setCustomerName} onNumberChange={setCustomer} /><p className="mt-2 text-[11px] text-muted-foreground">Leave blank for a walk-in customer. You can update these details before saving.</p></div>
      <div className="flex justify-end gap-2 border-t border-border pt-4"><button onClick={onClose} className="rounded-xl px-4 py-3 text-sm font-bold">Back to bill</button><button onClick={() => { setPaid(String(finalTotal)); if (finalTotal === 0) setMethod('Cash'); setApproved(true); }} disabled={!validDiscount || !lines.length} className="rounded-xl bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground disabled:opacity-40" data-testid="button-approve-bill"><Check size={17} className="mr-2 inline" /> Approve final bill</button></div>
    </div> : <>
    <div className={`grid gap-5 ${basic ? '' : 'md:grid-cols-[minmax(0,1fr)_330px]'}`} data-testid="stage-approved-payment">
      <div>
        <div className="rounded-xl bg-muted/55 p-5"><p className="text-xs font-bold text-muted-foreground">Seller-approved bill</p><div className="mt-2 flex items-end justify-between"><span className="text-base font-bold">Total to collect</span><span className="text-4xl font-extrabold text-primary" data-testid="text-payment-total">{money(finalTotal)}</span></div><p className="mt-2 text-xs text-muted-foreground">Subtotal {money(subtotal)}{gst > 0 && ` · GST ${money(gst)}`}{discount > 0 && ` · Discount −${money(discount)}`}</p></div>
        <div className="mt-3 max-h-56 space-y-2 overflow-auto rounded-xl border border-border p-4">{lines.map((line) => <div key={line.lineId} className="flex justify-between gap-2 text-sm"><span>{line.name} · {line.variant} × {line.qty} {line.unit}</span><strong>{money(roundMoney(line.price * line.qty))}</strong></div>)}</div>
        <div className="mt-4 rounded-xl border border-border bg-card p-4"><p className="mb-3 text-xs font-extrabold">Customer on this bill · edit before saving</p><CustomerFields name={customerName} number={customer} onNameChange={setCustomerName} onNumberChange={setCustomer} /></div>
        <p className="mb-2 mt-5 text-xs font-bold">Payment method</p>
         <div className="grid grid-cols-3 gap-2"><button onClick={() => { setMethod('UPI'); if (method === 'Credit') setPaid(String(finalTotal)); }} className={`flex items-center justify-center gap-2 rounded-xl border py-3 text-xs font-extrabold ${method === 'UPI' ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`} data-testid="button-payment-upi"><Smartphone size={16} /> UPI / QR</button><button onClick={() => { setMethod('Cash'); if (method === 'Credit') setPaid(String(finalTotal)); }} className={`flex items-center justify-center gap-2 rounded-xl border py-3 text-xs font-extrabold ${method === 'Cash' ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`} data-testid="button-payment-cash"><Banknote size={16} /> Cash</button><button onClick={() => { setMethod('Credit'); setPaid('0'); }} className={`flex items-center justify-center gap-2 rounded-xl border py-3 text-xs font-extrabold ${method === 'Credit' ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`} data-testid="button-payment-credit"><ReceiptIndianRupee size={16} /> Credit</button></div>
         {method === 'Credit' ? <p className="mt-4 rounded-xl bg-accent/10 p-3 text-xs text-accent">No payment is collected now. {money(finalTotal)} will remain due and can be collected from Insights.</p> : <div className="mt-4 max-w-xs"><Field label="Amount received"><div className="relative"><IndianRupee size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input type="number" min="0" max={finalTotal} step="0.01" value={paid} onChange={(event) => setPaid(event.target.value)} className="field pl-8" data-testid="input-payment-amount" /></div></Field></div>}
        {!validPaid && <p role="alert" className="mt-2 text-xs font-bold text-destructive">Enter an amount from ₹{finalTotal === 0 ? '0' : '0.01'} to {money(finalTotal)} with at most two decimal places.</p>}
        {paidValue < finalTotal && <p className="mt-2 text-xs font-bold text-accent">{money(roundMoney(finalTotal - paidValue))} will remain due after saving.</p>}
        {method === 'UPI' && !basic && <>
           <div className="mb-2 mt-5 flex items-center justify-between"><p className="text-xs font-extrabold">Receiving account · change QR here</p><button onClick={() => setAddingQR((current) => !current)} className="text-xs font-bold text-primary" data-testid="button-add-qr-checkout">{addingQR ? 'Cancel' : '+ Add QR now'}</button></div>
           <div className="no-scrollbar flex max-w-full snap-x gap-2 overflow-x-auto overscroll-x-contain pb-2" aria-label="Swipe to choose a receiving QR">{settings.paymentQrs.map((profile) => <button key={profile.id} onClick={() => setSelectedId(profile.id)} aria-pressed={chosen?.id === profile.id} className={`shrink-0 snap-start rounded-xl border px-3 py-2 text-xs font-bold ${chosen?.id === profile.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'}`} data-testid={`button-select-qr-${profile.id}`}>{profile.label}</button>)}</div>
          {addingQR && <div className="mt-3 space-y-3 rounded-xl border border-primary/20 bg-background p-3">
            <div className="grid gap-2 sm:grid-cols-2"><Field label="QR name"><input value={newQR.label} onChange={(event) => setNewQR({ ...newQR, label: event.target.value })} className="field" placeholder="Shop / Personal" data-testid="input-checkout-qr-label" /></Field><Field label="UPI ID or upload image"><input value={newQR.upiId} onChange={(event) => setNewQR({ ...newQR, upiId: event.target.value })} className="field" placeholder="yourname@bank" data-testid="input-checkout-upi-id" /></Field><Field label="Recipient name"><input value={newQR.upiName} onChange={(event) => setNewQR({ ...newQR, upiName: event.target.value })} className="field" placeholder="Name on UPI apps" data-testid="input-checkout-upi-name" /></Field><label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-primary/40 px-3 py-2 text-xs font-bold text-primary">{uploading ? 'Preparing...' : newQR.image ? 'QR image attached' : 'Upload fixed QR'}<input type="file" accept="image/*" onChange={(event) => uploadQR(event.target.files?.[0])} className="sr-only" data-testid="input-checkout-qr-image" /></label></div>
            {newQRError && <p role="alert" className="text-xs font-bold text-destructive">{newQRError}</p>}
            <button onClick={addQR} disabled={uploading} className="rounded-lg bg-primary px-4 py-2 text-xs font-extrabold text-primary-foreground disabled:opacity-50" data-testid="button-save-checkout-qr">Save & use QR</button>
          </div>}
        </>}
      </div>
        {basic ? <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground" data-testid="basic-payment-note">{method === 'UPI' ? 'Ask the customer to pay using the QR already displayed in your shop. Confirm the payment in your UPI app before saving this bill. BUYME does not display or collect a QR in Basic.' : method === 'Credit' ? 'This records the full amount as credit due.' : 'Confirm the cash received before saving this bill.'}</p> : <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-background p-4 text-center">
          {method === 'Credit' ? <><ReceiptIndianRupee size={48} className="text-accent" /><h3 className="mt-4 text-base font-extrabold">Credit sale</h3><p className="mt-2 text-sm text-muted-foreground">{money(finalTotal)} remains to collect.</p></> : method === 'Cash' ? <><Banknote size={48} className="text-primary" /><h3 className="mt-4 text-base font-extrabold">{finalTotal === 0 ? 'No payment due' : 'Cash payment'}</h3></> : qrError ? <p className="text-sm font-bold text-destructive">Could not generate this QR. Choose another account.</p> : qrData ? <><img src={qrData} alt={`${chosen?.label || 'UPI'} QR for ${money(paidValue)}`} className="size-64 rounded-xl bg-white p-2 object-contain sm:size-72" data-testid="image-payment-qr" /><p className="mt-3 text-lg font-extrabold">{upiUri ? `Scan to pay ${money(paidValue)}` : `Scan QR · enter ${money(paidValue)}`}</p><p className="mt-1 break-all text-xs text-muted-foreground">{chosen?.label} {chosen?.upiId && `· ${chosen.upiId}`}</p>{!upiUri && <p className="mt-2 text-[11px] leading-4 text-accent">Fixed QR: confirm recipient and amount in the UPI app. This image is not automatically linked to a UPI ID.</p>}</> : upiUri ? <p className="text-sm text-muted-foreground">Generating QR...</p> : <><Smartphone size={40} className="text-primary" /><h3 className="mt-3 text-sm font-extrabold">Add a receiving account</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">Add a UPI ID or upload a fixed QR above, then select it here.</p></>}
      </div>}
    </div>
    <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
      <button onClick={onClose} className="rounded-xl px-4 py-2.5 text-xs font-bold text-muted-foreground" data-testid="button-cancel-payment">Back</button>
       {pdf.url ? <><a href={pdf.url} download="bill-draft.pdf" className="flex items-center gap-2 rounded-xl border border-primary px-4 py-2.5 text-xs font-extrabold text-primary" data-testid="button-download-bill-pdf"><Download size={15} /> Download bill PDF</a><a href={pdf.url} target="_blank" rel="noopener noreferrer" className="flex items-center rounded-xl px-3 py-2.5 text-xs font-bold text-primary" data-testid="link-open-bill-pdf">Open PDF</a></> : <span className={`flex items-center rounded-xl border border-border px-4 py-2.5 text-xs font-bold ${pdf.failed ? 'text-destructive' : 'text-muted-foreground'}`}>{!validPaid ? 'Enter a valid amount for the PDF' : pdf.failed ? 'Could not prepare PDF' : 'Preparing PDF...'}</span>}
        <button onClick={() => onComplete(method, paidValue, discount, customerNameValue || undefined, customerNumberValue || undefined, basic ? undefined : chosen)} disabled={!validPaid || !pdf.url || (!basic && method === 'UPI' && (!qrData || qrError))} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40" data-testid="button-confirm-payment"><Check size={15} /> {method === 'Credit' ? 'Save as credit' : finalTotal === 0 ? 'Save bill' : 'Save payment'}</button>
    </div>
    </>}
  </Modal>;
}

function ReceiptModal({ sale, settings, basic, onClose }: { sale: Sale; settings: ShopSettings; basic: boolean; onClose: () => void }) {
  const subtotal = sale.subtotal ?? sale.lines.reduce((sum, line) => sum + line.price * line.qty, 0);
  const gst = sale.gst ?? Math.max(0, sale.total + (sale.discount ?? 0) - subtotal);
  const payments = salePayments(sale);
  const collected = collectedAmount(sale);
  const balance = Math.max(0, roundMoney(sale.total - collected));
  const receiptProfile = useMemo(() => ({ ...settings, upiId: basic ? '' : sale.paymentQr?.upiId ?? '', upiName: sale.paymentQr?.upiName ?? '', qrImage: basic ? undefined : sale.paymentQr?.image, omitPaymentQr: basic }), [settings, sale.paymentQr, basic]);
  const pdf = usePdfDownload(sale, receiptProfile, 'receipt');
  return <Modal title="Bill saved" onClose={onClose}>
    <div className="receipt-paper print-receipt rounded-xl border border-border p-5">
      <div className="text-center"><div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-lg font-extrabold text-primary-foreground">B</div><h3 className="mt-3 text-lg font-extrabold">{settings.shopName}</h3><p className="text-[10px] text-slate-500">{settings.phone}</p><p className="mt-3 border-y border-dashed border-slate-300 py-2 font-mono text-[10px] text-slate-500">{sale.id} · {dateLabel(sale.createdAt)}</p></div>
      {(sale.customerName || sale.customer) && <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700" data-testid="receipt-customer"><p className="font-bold">Customer: {sale.customerName || 'Walk-in'}</p>{sale.customer && <p className="mt-0.5">Phone: {sale.customer}</p>}</div>}
       <div className="mt-4 space-y-2">{sale.lines.map((line) => <div key={line.lineId} className="flex justify-between gap-3 text-xs"><span>{line.name} ({line.variant}) <small className="text-slate-500">× {line.qty}</small></span><span className="font-mono">{money(line.price * line.qty)}</span></div>)}</div>
       <div className="mt-4 space-y-1 border-t border-slate-300 pt-3"><div className="flex justify-between text-xs"><span>Subtotal</span><span>{money(subtotal)}</span></div>{gst > 0 && <div className="flex justify-between text-xs"><span>GST</span><span>{money(gst)}</span></div>}{!!sale.discount && <div className="flex justify-between text-xs"><span>Discount</span><span>−{money(sale.discount)}</span></div>}<div className="flex justify-between text-sm font-extrabold"><span>Total</span><span>{money(sale.total)}</span></div>{payments.length ? payments.map((payment, index) => <div key={`${payment.createdAt}-${index}`} className="flex justify-between text-[10px] text-slate-500"><span>{payment.method} received</span><span>{money(payment.amount)}</span></div>) : <div className="flex justify-between text-[10px] text-slate-500"><span>{sale.paymentMethod === 'Credit' ? 'Payment status' : `${sale.paymentMethod} received`}</span><span>{sale.paymentMethod === 'Credit' ? 'Credit sale' : money(0)}</span></div>}{balance > 0 && <div className="flex justify-between text-[10px] font-bold text-slate-600"><span>Balance due</span><span>{money(balance)}</span></div>}</div>
    </div>
    <div className="mt-5 flex gap-2"><button onClick={() => window.print()} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-xs font-bold" data-testid="button-print-receipt"><Printer size={15} /> Print</button>{pdf.url ? <a href={pdf.url} download={`receipt-${sale.id}.pdf`} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-xs font-extrabold text-primary-foreground" data-testid="button-download-receipt"><Download size={15} /> Download PDF</a> : <span className={`flex flex-1 items-center justify-center rounded-xl px-3 text-xs font-bold ${pdf.failed ? 'text-destructive' : 'text-muted-foreground'}`}>{pdf.failed ? 'Could not prepare PDF' : 'Preparing PDF...'}</span>}</div>
    {pdf.url && <p className="mt-3 text-center text-xs text-muted-foreground">Download blocked? <a href={pdf.url} target="_blank" rel="noopener noreferrer" className="font-bold text-primary underline" data-testid="link-open-receipt-pdf">Open the PDF</a> to save it from your browser.</p>}
  </Modal>;
}

function BroadcastModal({ settings, onClose, onDone }: { settings: ShopSettings; onClose: () => void; onDone: (message: string) => void }) {
  const [number, setNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [message, setMessage] = useState("Fresh stock is in today. Drop by when you're nearby.");
  const [image, setImage] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!image) { setImageUrl(''); return; }
    const url = URL.createObjectURL(image);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);
  const digits = number.replace(/\D/g, '');
  const finalMessage = `Hi ${customerName.trim() || 'there'},\n${message.trim()}\n\n${settings.shopName}${settings.phone.trim() ? `\nCall us: ${settings.phone.trim()}` : ''}`;
  const send = () => {
    if (digits.length < 8 || digits.length > 15 || !message.trim()) return;
    setError('');
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(finalMessage)}`, '_blank', 'noopener,noreferrer');
    onDone(image ? 'WhatsApp message prepared. Attach the downloaded image before sending.' : 'WhatsApp message prepared. Review and confirm Send there.');
  };
  return <Modal title="Start a broadcast" onClose={onClose}><div className="space-y-4">
    <div className="rounded-xl bg-chart-3/10 p-3 text-xs leading-5 text-chart-3"><MessageCircleMore className="mb-1" size={16} /> BUYME prepares the message only. Review it in WhatsApp and press Send yourself. Your shop name and phone are included.</div>
    <Field label="Customer phone number"><div className="relative"><Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input autoFocus type="tel" inputMode="tel" value={number} onChange={(event) => setNumber(event.target.value)} placeholder="+91 98765 43210" className="field pl-8" data-testid="input-broadcast-number" /></div></Field>
    <Field label="Customer name (optional)"><input value={customerName} onChange={(event) => setCustomerName(event.target.value)} maxLength={80} placeholder="Name for a personal greeting" className="field" data-testid="input-broadcast-customer-name" /></Field>
    <Field label="Message"><textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={4} maxLength={2000} className="field resize-none leading-5" data-testid="input-broadcast-message" /></Field>
    <div className="rounded-xl border border-border p-3">
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-primary/40 px-3 py-3 text-xs font-bold text-primary"><ImagePlus size={16} /> {image ? 'Change broadcast image' : 'Add an image'}<input type="file" accept="image/*" className="sr-only" data-testid="input-broadcast-image" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; if (file.size > 6_000_000) { setError('Choose an image under 6 MB.'); return; } setError(''); setImage(file); }} /></label>
      {image && <div className="mt-3 flex items-center gap-3"><img src={imageUrl} alt="Broadcast attachment preview" className="size-16 rounded-lg object-cover" /><span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{image.name}</span><button type="button" onClick={() => setImage(null)} className="text-xs font-bold text-destructive">Remove</button>{imageUrl && <a href={imageUrl} download={image.name || 'buyme-broadcast-image'} className="text-xs font-bold text-primary">Download</a>}</div>}
      {image && <p className="mt-2 text-[10px] leading-4 text-muted-foreground">Download the image, open the selected WhatsApp chat, then attach the image and confirm Send. BUYME does not send it for you.</p>}
    </div>
    {error && <p role="alert" className="text-xs font-bold text-destructive">{error}</p>}
    <button type="button" onClick={send} disabled={digits.length < 8 || digits.length > 15 || !message.trim()} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-chart-3 text-xs font-extrabold text-white disabled:opacity-40" data-testid="button-send-broadcast"><Send size={16} /> Open selected WhatsApp chat</button>
  </div></Modal>;
}

function Modal({ title, onClose, children, wide, large }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; large?: boolean }) {
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 p-0 backdrop-blur-sm sm:items-center sm:p-4"><div className={`max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card p-5 shadow-[0_25px_70px_rgba(36,31,61,.2)] sm:rounded-2xl sm:p-6 ${large ? 'max-w-5xl' : wide ? 'max-w-2xl' : 'max-w-md'}`} role="dialog" aria-modal="true" aria-label={title}><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-extrabold">{title}</h2><button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" data-testid="button-close-modal"><X size={18} /></button></div>{children}</div></div>;
}

function EmptyState({ icon: Icon, title, description, action, onAction }: { icon: typeof ShoppingBag; title: string; description: string; action: string; onAction: () => void }) {
  return <div className="flex flex-col items-center justify-center px-5 py-14 text-center"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/8 text-primary"><Icon size={24} /></span><h4 className="mt-4 text-sm font-extrabold">{title}</h4><p className="mt-2 max-w-xs text-xs leading-5 text-muted-foreground">{description}</p><button onClick={onAction} className="mt-4 rounded-lg border border-border px-3 py-2 text-xs font-bold text-primary hover:border-primary/40" data-testid="button-empty-action">{action}</button></div>;
}

export default App;
