import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, FilePlus2, Minus, Package, Plus, Search, Trash2, X } from 'lucide-react';
import type { Product, Variant } from './catalog-data';
import type { ImportBillLine } from './list-import-types';
import ListImportDialog from './ListImportDialog';
import { initialQuantity, quantityStep, roundMoney, roundQuantity, validQuantity as isValidQuantity } from './quantity-units';

export type CalculatorBillLine = {
  lineId: string;
  productId: string;
  variantId: string;
  name: string;
  variant: string;
  unit?: string;
  qty: number;
  price: number;
};

type BillingCalculatorProps = {
  basic: boolean;
  products: Product[];
  search: string;
  onSearch: (value: string) => void;
  bill: CalculatorBillLine[];
  subtotal: number;
  gst: number;
  total: number;
  onAdd: (product: Product, variant: Variant, quantity: number) => boolean;
  onAdjust: (lineId: string, amount: number) => void;
  onClear: () => void;
  onPay: () => void;
  onImport?: (lines: ImportBillLine[]) => string | null;
};

const money = (amount: number) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
}).format(amount);

function ProductPhoto({ product, className = '' }: { product: Product; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [product.image]);

  if (!product.image || failed) {
    return <span className={`flex items-center justify-center bg-secondary text-primary/45 ${className}`} aria-hidden="true"><Package size={32} strokeWidth={1.4} /></span>;
  }
  const src = product.image.startsWith('data:') || product.image.startsWith('blob:') || product.image.startsWith('http') || product.image.startsWith('/')
    ? product.image
    : `${import.meta.env.BASE_URL}${product.image}`;
  return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className={`object-cover ${className}`} />;
}

export default function BillingCalculator({
  basic, products, search, onSearch, bill, subtotal, gst, total, onAdd, onAdjust, onClear, onPay, onImport,
}: BillingCalculatorProps) {
  const [view, setView] = useState<'products' | 'review'>('products');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [addError, setAddError] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [quickAdd, setQuickAdd] = useState(() => window.localStorage.getItem('buyme-quick-add') !== 'false');
  const searchRef = useRef<HTMLInputElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const catalogScrollRef = useRef({ x: 0, y: 0 });
  const pressTimer = useRef<number | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const ignoreClick = useRef<string | null>(null);
  const selectedProduct = products.find((product) => product.id === selectedId);
  const variant = selectedProduct?.variants.find((item) => item.id === variantId);
  const selectedBillLine = selectedProduct && variant ? bill.find((line) => line.productId === selectedProduct.id && line.variantId === variant.id) : undefined;
  const itemCount = bill.length;
  const rowCount = Math.ceil(products.length / 4);
  const productRows = Array.from({ length: rowCount }, (_, index) => {
    const rowSize = Math.floor(products.length / rowCount);
    const extra = products.length % rowCount;
    const start = index * rowSize + Math.min(index, extra);
    return products.slice(start, start + rowSize + Number(index < extra));
  });
  const parsedQuantity = Number(quantity);
  const validQuantity = isValidQuantity(parsedQuantity) && quantity.trim() !== '';
  const step = quantityStep(variant?.unit ?? '');

   const remainingStock = (product: Product, item: Variant) => item.stock === undefined ? undefined : Math.max(0, roundQuantity(item.stock - bill.filter((line) => line.productId === product.id && line.variantId === item.id).reduce((sum, line) => sum + line.qty, 0)));
  const variantAvailable = (product: Product, item: Variant) => remainingStock(product, item) === undefined || remainingStock(product, item)! > 0;
  const isSoldOut = (product: Product) => product.variants.length > 0 && product.variants.every((item) => remainingStock(product, item) === 0);
  const stockBadge = (product: Product, item: Variant | undefined) => item && remainingStock(product, item) !== undefined && remainingStock(product, item)! <= (item.threshold ?? 5);
  const availableQuantity = selectedProduct && variant ? remainingStock(selectedProduct, variant) : undefined;
  const validStockQuantity = availableQuantity === undefined || parsedQuantity <= availableQuantity;

  useEffect(() => () => {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
  }, []);

  function setQuickAddMode(enabled: boolean) {
    setQuickAdd(enabled);
    window.localStorage.setItem('buyme-quick-add', String(enabled));
  }

  function cancelLongPress() {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
    pressStart.current = null;
  }

  function canQuickAdd(product: Product) {
    return quickAdd && product.variants.length === 1 && quantityStep(product.variants[0].unit) === 1;
  }

  function beginLongPress(event: React.PointerEvent<HTMLButtonElement>, product: Product) {
    if (!canQuickAdd(product) || event.button !== 0) return;
    cancelLongPress();
    ignoreClick.current = null;
    const button = event.currentTarget;
    pressStart.current = { x: event.clientX, y: event.clientY };
    pressTimer.current = window.setTimeout(() => {
      ignoreClick.current = product.id;
      window.setTimeout(() => { if (ignoreClick.current === product.id) ignoreClick.current = null; }, 800);
      pressTimer.current = null;
      openProduct(product, button);
    }, 550);
  }

  function selectFromGrid(product: Product, button: HTMLButtonElement) {
    if (ignoreClick.current === product.id) { ignoreClick.current = null; return; }
    if (canQuickAdd(product)) {
      onAdd(product, product.variants[0], 1);
      return;
    }
    openProduct(product, button);
  }

  function closeProduct() {
    setSelectedId(null);
    setVariantId(null);
    setAddError(false);
    // Prevent focus restoration from scrolling the still-mounted catalog.
    window.requestAnimationFrame(() => {
      window.scrollTo(catalogScrollRef.current.x, catalogScrollRef.current.y);
      openerRef.current?.focus({ preventScroll: true });
    });
  }

  useEffect(() => {
    if (selectedId && !selectedProduct) closeProduct();
  }, [selectedId, selectedProduct]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (selectedId) { event.preventDefault(); closeProduct(); }
        else if (view === 'review') { setConfirmClear(false); setView('products'); }
      }
      if (event.key === 'Tab' && selectedId && sheetRef.current) {
        const focusable = Array.from(sheetRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'));
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === sheetRef.current)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [view, selectedId]);

  useEffect(() => {
    if (selectedId) sheetRef.current?.focus({ preventScroll: true });
  }, [selectedId]);

  function openProduct(product: Product, button: HTMLButtonElement) {
    if (isSoldOut(product) && !bill.some((line) => line.productId === product.id)) return;
    openerRef.current = button;
    catalogScrollRef.current = { x: window.scrollX, y: window.scrollY };
    setSelectedId(product.id);
    const first = product.variants.filter((item) => variantAvailable(product, item)).sort((a, b) => a.price - b.price)[0]
      ?? product.variants.find((item) => bill.some((line) => line.productId === product.id && line.variantId === item.id));
    setVariantId(first?.id ?? null);
    setQuantity(String(initialQuantity(first?.unit ?? 'piece')));
    setAddError(false);
  }

  function addToBill(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProduct || !variant || !variantAvailable(selectedProduct, variant) || !validQuantity || !validStockQuantity) return;
    if (onAdd(selectedProduct, variant, parsedQuantity)) {
      closeProduct();
      setQuantity('1');
    } else {
      setAddError(true);
    }
  }

  function openSearch() {
    if (selectedId) closeProduct();
    setView('products');
    setSearchOpen(true);
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }

  return (
    <section className="min-h-[60dvh] pb-40 font-sans text-foreground lg:pb-28" aria-label="Billing calculator">
      {view !== 'review' && <div className="sticky top-[max(1.25rem,env(safe-area-inset-top))] z-20 mb-4 flex items-end justify-between gap-4 rounded-xl border border-primary/15 bg-primary px-4 py-3 text-primary-foreground shadow-[var(--shadow-sm)] sm:top-4 sm:mb-6 sm:px-6 sm:py-4" aria-label={basic ? 'Amount due' : 'Current bill total'} data-testid="panel-calculator-total">
        <div className="min-w-0"><p className="text-[9px] font-extrabold uppercase tracking-[.16em] opacity-75">{basic ? 'Amount due' : 'Current bill'} · {roundQuantity(itemCount)} {itemCount === 1 ? 'item' : 'items'}</p><strong className="mt-1 block text-3xl font-extrabold leading-none tracking-tight tabular-nums sm:text-4xl" data-testid="text-running-total" aria-live="polite">{money(total)}</strong></div>
        <span className="hidden shrink-0 pb-1 text-right text-[11px] font-semibold opacity-70 sm:block">Add items below<br />{basic ? 'Select payment when ready' : 'Review before payment'}</span>
      </div>}
      {view === 'products' && (
        <>
          <fieldset className="mb-4 rounded-xl border border-border bg-card px-3 py-2.5" data-testid="quick-add-mode">
            <legend className="sr-only">Product tap behavior</legend>
            <div className="flex items-center gap-2 text-xs font-bold text-primary">
              <span className="shrink-0">Tap mode</span>
              <label className={`flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 ${quickAdd ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}><input type="radio" name="tap-mode" checked={quickAdd} onChange={() => setQuickAddMode(true)} className="accent-primary" data-testid="radio-quick-add" /> Quick add</label>
              <label className={`flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 ${!quickAdd ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}><input type="radio" name="tap-mode" checked={!quickAdd} onChange={() => setQuickAddMode(false)} className="accent-primary" data-testid="radio-choose-quantity" /> Enter quantity</label>
            </div>
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{quickAdd ? 'Tap once for 1, twice for 2. Long-press to edit. Products with sizes or weight always open first.' : 'Tap a product to choose its size and quantity.'}</p>
          </fieldset>
          {search && !searchOpen && <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-card px-4 py-2.5 text-xs font-bold text-primary" data-testid="status-active-search"><span className="min-w-0 truncate">Results for “{search}”</span><button type="button" onClick={() => onSearch('')} aria-label="Clear product search" className="flex shrink-0 items-center gap-1" data-testid="button-clear-search"><X size={15} /> Clear</button></div>}
          {products.length ? (
            <div className="space-y-5 sm:space-y-6" data-testid="grid-products">
              {productRows.map((row, index) => <div key={index} className="grid gap-x-2 sm:gap-x-4" style={{ gridTemplateColumns: `repeat(${Math.max(2, row.length)}, minmax(0, 1fr))` }}>
                {row.map((product) => {
                 const soldOut = isSoldOut(product);
                  const first = product.variants.filter((item) => variantAvailable(product, item)).sort((a, b) => a.price - b.price)[0]
                   ?? product.variants.slice().sort((a, b) => a.price - b.price)[0];
                return (
                  <button
                    key={product.id}
                    type="button"
                     onClick={(event) => selectFromGrid(product, event.currentTarget)}
                     onPointerDown={(event) => beginLongPress(event, product)}
                     onPointerMove={(event) => {
                       if (pressStart.current && (Math.abs(event.clientX - pressStart.current.x) > 10 || Math.abs(event.clientY - pressStart.current.y) > 10)) cancelLongPress();
                     }}
                     onPointerUp={cancelLongPress}
                     onPointerCancel={cancelLongPress}
                     onPointerLeave={cancelLongPress}
                     onContextMenu={(event) => { if (canQuickAdd(product)) { event.preventDefault(); cancelLongPress(); ignoreClick.current = product.id; openProduct(product, event.currentTarget); } }}
                      disabled={(soldOut && !bill.some((line) => line.productId === product.id)) || !first}
                     className="group min-w-0 touch-manipulation text-left outline-none disabled:cursor-not-allowed"
                     aria-label={`${soldOut ? 'Out of stock, ' : canQuickAdd(product) ? 'Quick add ' : 'Select '}${product.name}${first ? `, from ${money(first.price)} per ${first.unit}` : ''}${canQuickAdd(product) ? '. Long press to enter quantity.' : ''}`}
                    data-testid={`button-product-${product.id}`}
                  >
                      <span className={`relative block aspect-square overflow-hidden rounded-xl border border-border/80 bg-secondary shadow-[var(--shadow-sm)] transition-[border-color,transform] duration-200 group-enabled:hover:-translate-y-0.5 group-enabled:hover:border-primary/60 group-focus-visible:border-primary ${soldOut ? 'opacity-45 grayscale' : ''}`}>
                       <ProductPhoto product={product} className="h-full w-full transition-transform duration-200 group-enabled:hover:scale-[1.04]" />
                        {canQuickAdd(product) && bill.some((line) => line.productId === product.id && line.variantId === first?.id) && <span className="absolute right-1 top-1 rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-extrabold text-primary-foreground" data-testid={`badge-product-quantity-${product.id}`}>×{roundQuantity(bill.filter((line) => line.productId === product.id && line.variantId === first?.id).reduce((sum, line) => sum + line.qty, 0))}</span>}
                    </span>
                    <span className="sr-only">{product.name}</span>
                     <span className="mt-1.5 block text-center text-[10px] font-bold leading-4 text-primary sm:text-xs" data-testid={`text-rate-${product.id}`}>
                      {first ? <>{money(first.price)}<span className="font-medium text-muted-foreground"> / {first.unit}</span></> : 'No rate'}
                        {(soldOut || stockBadge(product, first)) && <span className="ml-1 inline-block whitespace-nowrap rounded-md bg-amber-100 px-1 py-0.5 align-middle text-[9px] font-extrabold leading-none text-amber-900">{soldOut ? '0 left' : `${first && remainingStock(product, first)} left`}</span>}
                    </span>
                     {soldOut && <span className="mt-0.5 block text-center text-[9px] font-bold text-muted-foreground">Out of stock</span>}
                  </button>
                );
                })}
              </div>)}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center" data-testid="status-no-products">
              <Search size={25} strokeWidth={1.6} className="mx-auto text-primary/50" />
              <p className="mt-3 text-sm font-bold">{search ? 'No matching products' : 'No products yet'}</p>
              {search && <button type="button" onClick={() => { onSearch(''); setSearchOpen(false); }} className="mt-3 text-xs font-extrabold text-primary underline underline-offset-4" data-testid="button-show-all-products">Clear search</button>}
            </div>
          )}
        </>
      )}

      {view === 'products' && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-primary/35 sm:items-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) closeProduct(); }} data-testid="overlay-product-backdrop">
        <div ref={sheetRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Add ${selectedProduct.name} to ${basic ? 'selection' : 'bill'}`} className="max-h-[min(88dvh,720px)] w-full max-w-xl overflow-y-auto rounded-t-[1.75rem] border border-border bg-background p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl outline-none sm:rounded-[1.75rem] sm:p-6" data-testid="view-variants">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-primary/20 sm:hidden" aria-hidden="true" />
          <div className="mb-4 flex items-start gap-3 border-b border-border pb-4">
            <ProductPhoto product={selectedProduct} className="size-16 shrink-0 rounded-xl border border-border sm:size-20" />
             <div className="min-w-0">
               <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-muted-foreground">Adjust item</p>
              <h2 className="mt-1 text-lg font-extrabold leading-tight tracking-tight sm:text-xl" data-testid="text-selected-product">{selectedProduct.name}</h2>
               <p className="mt-1 text-xs font-semibold text-muted-foreground">Change what is in your bill, or add more</p>
            </div>
            <button type="button" onClick={closeProduct} className="ml-auto flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-primary hover:bg-primary/15" aria-label="Close product" data-testid="button-back-products"><X size={18} /></button>
          </div>
          {selectedProduct.variants.length ? (
            <form onSubmit={addToBill}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label={`${selectedProduct.name} size or type`}>
                {selectedProduct.variants.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={variantId === option.id}
                      disabled={!variantAvailable(selectedProduct, option) && !bill.some((line) => line.productId === selectedProduct.id && line.variantId === option.id)}
                     onClick={() => { setVariantId(option.id); setQuantity(String(initialQuantity(option.unit))); setAddError(false); }}
                     className={`overflow-hidden rounded-lg border-2 text-left transition-[border-color,background-color] disabled:cursor-not-allowed disabled:opacity-45 ${variantId === option.id ? 'border-primary bg-primary/8' : 'border-border bg-card hover:border-primary/40'}`}
                     aria-label={`${option.name}, ${money(option.price)} per ${option.unit}${!variantAvailable(selectedProduct, option) ? ', out of stock' : ''}`}
                    data-testid={`button-variant-${option.id}`}
                  >
                     <ProductPhoto product={{ ...selectedProduct, image: option.image || selectedProduct.image }} className="aspect-[3.3] w-full" />
                      <span className="block p-2"><span className="flex items-start justify-between gap-1"><span className="text-[11px] font-extrabold leading-4">{option.name}</span>{variantId === option.id && <Check size={13} className="shrink-0 text-primary" aria-hidden="true" />}</span><span className="mt-0.5 block text-xs font-extrabold text-primary">{money(option.price)} <span className="text-[10px] font-medium text-muted-foreground">/ {option.unit}</span></span><span className="block text-[9px] font-bold text-muted-foreground">{option.stock === undefined ? 'Available' : remainingStock(selectedProduct, option) === 0 ? 'Out of stock' : `${roundQuantity(remainingStock(selectedProduct, option) ?? 0)} left`}</span></span>
                  </button>
                ))}
              </div>
               {selectedBillLine && <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3" data-testid="current-product-in-bill">
                  <div><p className="text-xs font-extrabold text-primary">Already {basic ? 'selected' : 'in bill'}</p><p className="mt-0.5 text-xs text-muted-foreground">{selectedBillLine.variant} · {roundQuantity(selectedBillLine.qty)} {selectedBillLine.unit}</p></div>
                 <div className="flex items-center rounded-xl border border-primary/25 bg-card">
                   <button type="button" onClick={() => onAdjust(selectedBillLine.lineId, -Math.min(step, selectedBillLine.qty))} className="flex size-11 items-center justify-center text-primary" aria-label={`Remove one ${selectedBillLine.unit ?? 'unit'} of ${selectedProduct.name} from bill`} data-testid="button-sheet-bill-minus"><Minus size={18} /></button>
                   <span className="min-w-7 text-center text-sm font-extrabold tabular-nums" data-testid="text-sheet-bill-quantity">{roundQuantity(selectedBillLine.qty)}</span>
                   <button type="button" onClick={() => onAdjust(selectedBillLine.lineId, step)} disabled={availableQuantity !== undefined && availableQuantity < step} className="flex size-11 items-center justify-center text-primary disabled:opacity-40" aria-label={`Add one ${selectedBillLine.unit ?? 'unit'} of ${selectedProduct.name} to bill`} data-testid="button-sheet-bill-plus"><Plus size={18} /></button>
                 </div>
               </div>}
                <label htmlFor="calculator-quantity" className="mt-4 block text-xs font-extrabold uppercase tracking-[0.12em] text-muted-foreground">Add more {variant ? `(${variant.unit})` : ''}</label>
               <div className="mt-2 flex items-center gap-2"><button type="button" onClick={() => setQuantity(String(roundQuantity(Math.max(0, parsedQuantity - step))))} disabled={!validQuantity || parsedQuantity <= step} className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-card text-primary disabled:opacity-40" aria-label={`Decrease quantity by ${step} ${variant?.unit ?? 'units'}`} data-testid="button-quantity-minus"><Minus size={18} /></button>
               <input
                ref={quantityRef}
                id="calculator-quantity"
                type="number"
                 inputMode="decimal"
                 min="0"
                 max={availableQuantity}
                 step="any"
                value={quantity}
                onChange={(event) => { setQuantity(event.target.value); setAddError(false); }}
                 className="h-11 min-w-0 flex-1 rounded-xl border-2 border-primary/30 bg-card px-3 text-lg font-extrabold tabular-nums text-primary outline-none focus:border-primary sm:max-w-52"
                aria-label={`Quantity of ${selectedProduct.name}`}
                data-testid="input-product-quantity"
               /><button type="button" onClick={() => setQuantity(String(roundQuantity((validQuantity ? parsedQuantity : 0) + step)))} disabled={availableQuantity !== undefined && parsedQuantity + step > availableQuantity} className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-card text-primary disabled:opacity-40" aria-label={`Increase quantity by ${step} ${variant?.unit ?? 'units'}`} data-testid="button-quantity-plus"><Plus size={18} /></button></div>
               <p className="mt-1 text-[11px] text-muted-foreground">± {step} {variant?.unit ?? 'units'} per tap. You can enter any decimal amount.</p>
               {(addError || !validStockQuantity) && <p role="alert" className="mt-2 text-xs font-bold text-destructive" data-testid="status-add-error">{!validStockQuantity ? `Only ${availableQuantity} left in stock.` : 'Could not add this quantity. Please check it and try again.'}</p>}
               <button type="submit" disabled={!variant || !variantAvailable(selectedProduct, variant) || !validQuantity || !validStockQuantity} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-extrabold text-primary-foreground shadow-[var(--shadow-md)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-add-to-bill">
                  Add to {basic ? 'selection' : 'bill'}{variant && validQuantity ? ` · ${money(roundMoney(variant.price * parsedQuantity))}` : ''} <ArrowRight size={18} />
              </button>
            </form>
          ) : <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm font-semibold text-muted-foreground">No sizes or rates available for this product.</div>}
        </div>
        </div>
      )}

      {view === 'review' && (
        <div className="mx-auto max-w-3xl" data-testid="view-bill-review">
          <div className="mb-5 flex items-center justify-between gap-3">
            <button type="button" onClick={() => { setConfirmClear(false); setView('products'); }} className="inline-flex items-center gap-2 rounded-lg py-2 text-sm font-bold text-primary hover:opacity-70" aria-label="Back to products" data-testid="button-back-from-review"><ArrowLeft size={18} /> Products</button>
            {bill.length > 0 && <button type="button" onClick={() => setConfirmClear(true)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold text-destructive hover:bg-destructive/10" data-testid="button-clear-bill"><Trash2 size={15} /> Clear bill</button>}
          </div>
          <div className="mb-5 border-b border-border pb-4">
            <h2 className="font-display text-3xl leading-none text-primary sm:text-4xl">Review bill</h2>
            <p className="mt-2 text-xs font-semibold text-muted-foreground">{itemCount} {itemCount === 1 ? 'item' : 'items'} in this bill</p>
          </div>
          {confirmClear && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-4" role="alertdialog" aria-label="Clear the entire bill?">
            <p className="text-sm font-bold">Remove every item from this bill?</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmClear(false)} className="rounded-lg border border-border px-3 py-2 text-xs font-bold" data-testid="button-cancel-clear">Cancel</button>
              <button type="button" onClick={() => { onClear(); setConfirmClear(false); }} className="rounded-lg bg-destructive px-3 py-2 text-xs font-bold text-destructive-foreground" data-testid="button-confirm-clear">Clear all</button>
            </div>
          </div>}
          {bill.length ? <>
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card" data-testid="list-bill-lines">
              {bill.map((line) => <div key={line.lineId} className="flex flex-wrap items-center gap-x-3 gap-y-3 px-3 py-4 sm:flex-nowrap sm:px-5" data-testid={`row-bill-${line.lineId}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold" data-testid={`text-line-name-${line.lineId}`}>{line.name}</p>
                  <p className="mt-0.5 text-xs font-medium text-muted-foreground">{line.variant} · {money(line.price)} each</p>
                </div>
                <div className="flex h-10 shrink-0 items-center rounded-lg border border-border bg-background">
                   {(() => { const increment = quantityStep(line.unit ?? ''); return <><button type="button" onClick={() => onAdjust(line.lineId, -increment)} disabled={line.qty <= increment} className="flex size-10 items-center justify-center rounded-l-lg hover:bg-muted disabled:opacity-40" aria-label={`Decrease ${line.name} quantity by ${increment} ${line.unit ?? 'units'}`} data-testid={`button-decrease-${line.lineId}`}><Minus size={16} /></button><span className="min-w-7 text-center text-sm font-extrabold tabular-nums" data-testid={`text-line-quantity-${line.lineId}`}>{roundQuantity(line.qty)}</span><button type="button" onClick={() => onAdjust(line.lineId, increment)} className="flex size-10 items-center justify-center rounded-r-lg hover:bg-muted" aria-label={`Increase ${line.name} quantity by ${increment} ${line.unit ?? 'units'}`} data-testid={`button-increase-${line.lineId}`}><Plus size={16} /></button></>; })()}
                </div>
                 <span className="min-w-20 text-right text-sm font-extrabold tabular-nums text-primary" data-testid={`text-line-total-${line.lineId}`}>{money(roundMoney(line.price * line.qty))}</span>
                <button type="button" onClick={() => onAdjust(line.lineId, -line.qty)} className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Remove ${line.name} from bill`} data-testid={`button-remove-${line.lineId}`}><Trash2 size={16} /></button>
              </div>)}
            </div>
            <div className="mt-5 rounded-xl bg-secondary/70 p-5 sm:p-6">
              <div className="flex justify-between text-sm font-semibold text-muted-foreground"><span>Subtotal</span><span className="tabular-nums">{money(subtotal)}</span></div>
              {gst > 0 && <div className="mt-3 flex justify-between text-sm font-semibold text-muted-foreground"><span>GST</span><span className="tabular-nums">{money(gst)}</span></div>}
              <div className="mt-4 flex items-end justify-between border-t border-primary/15 pt-4 text-primary"><span className="text-sm font-extrabold">Total due</span><strong className="text-2xl font-extrabold tabular-nums sm:text-3xl" data-testid="text-review-total">{money(total)}</strong></div>
            </div>
            <button type="button" onClick={onPay} className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-extrabold text-primary-foreground hover:opacity-90" data-testid="button-collect-payment">Payment <ArrowRight size={18} /></button>
          </> : <div className="rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center" data-testid="status-empty-bill"><Package className="mx-auto text-primary/45" size={32} strokeWidth={1.5} /><p className="mt-3 text-sm font-bold">Your bill is empty</p><button type="button" onClick={() => setView('products')} className="mt-4 rounded-lg bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground" data-testid="button-find-products">Find products</button></div>}
        </div>
      )}

      {view !== 'review' && <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-primary/15 bg-card/95 px-3 py-2.5 shadow-[0_-8px_30px_rgba(54,48,81,.09)] backdrop-blur-md lg:left-0 lg:px-8" aria-label="Billing actions" data-testid="bar-bill-total">
        {view === 'products' && searchOpen && <label className="relative mx-auto mb-2 block max-w-6xl">
          <Search size={19} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-primary/65" aria-hidden="true" />
          <span className="sr-only">Search items</span>
          <input
            ref={searchRef}
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search items..."
            autoComplete="off"
            className="h-12 w-full appearance-none rounded-xl border border-primary/20 bg-card pl-11 pr-11 text-sm font-semibold text-foreground shadow-[var(--shadow-sm)] outline-none placeholder:font-medium placeholder:text-muted-foreground focus:border-primary sm:h-14 sm:text-base"
            aria-label="Search items"
            data-testid="input-search-products"
          />
          <button type="button" onClick={() => { onSearch(''); setSearchOpen(false); }} className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close item search" data-testid="button-close-search"><X size={17} /></button>
        </label>}
        <div className={`mx-auto grid max-w-6xl gap-2 sm:gap-3 ${basic ? 'grid-cols-[1fr_1.4fr]' : 'grid-cols-[1fr_1.3fr_1fr] sm:grid-cols-[1fr_1.4fr_1.2fr]'}`}>
          <button type="button" onClick={openSearch} className="flex h-12 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-primary/25 bg-background px-2 text-xs font-extrabold text-primary hover:bg-secondary sm:text-sm" aria-label="Search items" data-testid="button-search-items"><Search size={17} className="shrink-0" /> <span className="sm:hidden">Search</span><span className="hidden sm:inline">Search items</span></button>
          {!basic && <button type="button" onClick={() => { onSearch(''); setImportOpen(true); }} className="flex h-12 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-primary/25 bg-background px-2 text-xs font-extrabold text-primary hover:bg-secondary sm:text-sm" aria-label="Add list or add items" data-testid="button-add-list"><FilePlus2 size={17} className="shrink-0" /> <span className="sm:hidden">Add list</span><span className="hidden sm:inline">Add list / Add items</span></button>}
          <button type="button" onClick={() => { if (basic) onPay(); else { setConfirmClear(false); setView('review'); } }} disabled={!bill.length} className="flex h-12 min-w-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-2 text-xs font-extrabold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 sm:text-sm" aria-label={basic ? `Payment due ${money(total)}` : `Next, review bill with ${itemCount} items totalling ${money(total)}`} data-testid="button-review-bill">{basic ? `Pay ${money(total)}` : 'Next'} <ArrowRight size={17} className="shrink-0" /></button>
        </div>
      </div>}
      {importOpen && <ListImportDialog products={products} onImport={onImport} onClose={() => setImportOpen(false)} />}
    </section>
  );
}