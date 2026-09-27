import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, Check, ImageUp, Package, RotateCcw, ScanLine, X } from 'lucide-react';
import { categories, type Product } from './catalog-data';

type Props = {
  catalog: Product[];
  onClose: () => void;
  onCreateDraft: (draft: Product) => void;
  onEditDraft: (productId: string, draft: Product) => void;
  onRestock: (productId: string, variantId: string, quantity: number) => string | null;
};

type Detection = {
  name: string | null;
  category: string | null;
  variant: string | null;
  unit: string | null;
  unitPrice: number | null;
  quantity: number | null;
};

type PreparedPhoto = { document: string; image: string; filename: string };
type Phase = 'choose' | 'loading' | 'review' | 'empty';

const fieldClass = 'mt-1.5 h-11 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-sm font-semibold text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/10';
const normalize = (value: string) => value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const categoryOptions = categories.filter((category) => category !== 'All items');

function readPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not open this photo. Please choose another.'));
    reader.readAsDataURL(file);
  });
}

function renderJpeg(image: HTMLImageElement, longestEdge: number, quality: number) {
  const scale = Math.min(1, longestEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Photo processing is unavailable on this device.');
  context.fillStyle = '#faf8f1';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file, such as a JPEG or PNG.');
  if (file.size > 8 * 1024 * 1024) throw new Error('Choose a photo smaller than 8 MB.');
  const source = await readPhoto(file);
  const image = new Image();
  image.src = source;
  try { await image.decode(); } catch { throw new Error('This photo could not be opened. Try a JPEG or PNG.'); }
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('This photo appears to be empty.');
  let document = '';
  for (const quality of [0.86, 0.74, 0.62, 0.5]) {
    document = renderJpeg(image, 1800, quality);
    if (document.length < 6_800_000) break;
  }
  if (document.length >= 6_800_000) throw new Error('This photo is too large. Retake it closer to the package.');
  return { document, image: renderJpeg(image, 480, 0.8), filename: file.name };
}

function validateDetection(value: unknown): Detection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The reader returned an unexpected result. Please retry.');
  const result = value as Record<string, unknown>;
  const textFields = ['name', 'category', 'variant', 'unit'] as const;
  for (const field of textFields) {
    if (result[field] !== null && typeof result[field] !== 'string') throw new Error('The reader returned an unexpected result. Please retry.');
  }
  if (result.unitPrice !== null && (typeof result.unitPrice !== 'number' || !Number.isFinite(result.unitPrice) || result.unitPrice < 0)) {
    throw new Error('The reader returned an invalid price. Please retry.');
  }
  if (result.quantity !== null && (typeof result.quantity !== 'number' || !Number.isSafeInteger(result.quantity) || result.quantity < 0)) {
    throw new Error('The reader returned an invalid quantity. Please retry.');
  }
  return result as Detection;
}

export default function CatalogScanDialog({ catalog, onClose, onCreateDraft, onEditDraft, onRestock }: Props) {
  const [phase, setPhase] = useState<Phase>('choose');
  const [error, setError] = useState('');
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [variantName, setVariantName] = useState('');
  const [unit, setUnit] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [productId, setProductId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [replacePhoto, setReplacePhoto] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onCloseRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); controllerRef.current?.abort(); };
  }, []);

  const existing = catalog.find((product) => product.id === productId);
  const existingVariant = existing?.variants.find((variant) => variant.id === variantId);

  function populate(result: Detection) {
    setName(result.name ?? '');
    setCategory(categoryOptions.find((option) => normalize(option) === normalize(result.category ?? '')) ?? '');
    setVariantName(result.variant ?? '');
    setUnit(result.unit ?? '');
    setPrice(result.unitPrice === null ? '' : String(result.unitPrice));
    setQuantity(result.quantity === null ? '' : String(result.quantity));
    const matches = result.name ? catalog.filter((product) => normalize(product.name) === normalize(result.name!)) : [];
    const matched = matches.length === 1 ? matches[0] : undefined;
    setProductId(matched?.id ?? '');
    const variants = matched?.variants.filter((variant) => normalize(variant.name) === normalize(result.variant ?? '')) ?? [];
    setVariantId(variants.length === 1 ? variants[0].id : matched?.variants.length === 1 ? matched.variants[0].id : '');
    setReplacePhoto(false);
  }

  async function scan(prepared: PreparedPhoto, controller: AbortController) {
    setPhase('loading');
    setError('');
    try {
      const response = await fetch('/api/catalog/scan-product', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: prepared.document, filename: prepared.filename }),
        signal: controller.signal,
      });
      if (!response.ok) {
        let message = `Could not read this package (${response.status}). Please retry.`;
        try {
          const body: unknown = await response.json();
          if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') message = body.error;
        } catch { /* Keep the HTTP error. */ }
        throw new Error(message);
      }
      const result = validateDetection(await response.json());
      if (controller.signal.aborted) return;
      populate(result);
      setPhase(Object.values(result).every((value) => value === null || value === '') ? 'empty' : 'review');
    } catch (reason) {
      if (controller.signal.aborted) return;
      setError(reason instanceof Error ? reason.message : 'Could not read this photo. Please retry.');
      setPhase('choose');
    }
  }

  async function chooseFile(file?: File) {
    if (!file) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setPhoto(null);
    setError('');
    setPhase('loading');
    try {
      const prepared = await preparePhoto(file);
      if (controller.signal.aborted) return;
      setPhoto(prepared);
      await scan(prepared, controller);
    } catch (reason) {
      if (controller.signal.aborted) return;
      setError(reason instanceof Error ? reason.message : 'Could not prepare this photo.');
      setPhase('choose');
    }
  }

  function retry() {
    if (!photo) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    void scan(photo, controller);
  }

  function changePhoto() {
    controllerRef.current?.abort();
    setPhoto(null);
    setPhase('choose');
    setError('');
  }

  function validatedFields(requireName: boolean) {
    if (requireName && !name.trim()) return 'Enter a product name before continuing.';
    if (price.trim() && (!Number.isFinite(Number(price)) || Number(price) < 0)) return 'Enter a valid selling price, or leave it blank.';
    if (quantity.trim() && (!Number.isSafeInteger(Number(quantity)) || Number(quantity) < 0)) return 'Arrival quantity must be a whole number of zero or more.';
    return null;
  }

  function createDraft() {
    const problem = validatedFields(true);
    if (problem) { setError(problem); return; }
    if (!category) { setError('Choose a category for the new product.'); return; }
    if (!variantName.trim()) { setError('Enter a size or type for the new product.'); return; }
    if (!unit.trim()) { setError('Enter a selling unit for the new product.'); return; }
    const draft: Product = {
      id: crypto.randomUUID(), name: name.trim(), category,
      image: photo?.image, updatedAt: new Date().toISOString(),
      variants: [{
        id: crypto.randomUUID(), name: variantName.trim(), unit: unit.trim(),
        price: price.trim() ? Number(price) : 0,
        ...(quantity.trim() ? { stock: Number(quantity) } : {}),
      }],
    };
    try { onCreateDraft(draft); onClose(); }
    catch { setError('Could not open the product editor. Please try again.'); }
  }

  function restock() {
    if (!existing || !existingVariant) { setError('Choose a catalog product and its exact variant to restock.'); return; }
    const count = Number(quantity);
    if (!quantity.trim() || !Number.isSafeInteger(count) || count <= 0) {
      setError('Enter a positive whole-number arrival quantity to add to stock.');
      return;
    }
    try {
      const result = onRestock(existing.id, existingVariant.id, count);
      if (result === null) onClose();
      else setError(result || 'Could not add stock. Please try again.');
    } catch { setError('Could not add stock. Please try again.'); }
  }

  function updateDraft() {
    if (!existing || !existingVariant) { setError('Choose a catalog product and its exact variant to update.'); return; }
    const problem = validatedFields(true);
    if (problem) { setError(problem); return; }
    if (!category) { setError('Choose a category.'); return; }
    if (!variantName.trim() || !unit.trim()) { setError('Enter a size/type and selling unit.'); return; }
    // An arrival count is never copied into an edit draft: stock changes only through Restock.
    const draft: Product = {
      ...existing, name: name.trim(), category,
      ...(replacePhoto && photo ? { image: photo.image } : {}),
      variants: existing.variants.map((item) => item.id === existingVariant.id
        ? { ...item, name: variantName.trim(), unit: unit.trim(), price: price.trim() ? Number(price) : item.price }
        : { ...item }),
    };
    try { onEditDraft(existing.id, draft); onClose(); }
    catch { setError('Could not open the product editor. Please try again.'); }
  }

  return <div className="fixed inset-0 z-[80] flex items-end justify-center bg-foreground/55 sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="scan-title" className="flex max-h-[95dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl sm:max-h-[88dvh] sm:rounded-2xl">
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-7">
        <div><div className="mb-1 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[.16em] text-primary"><ScanLine size={13} /> BUYME / CATALOG</div><h2 id="scan-title" className="font-display text-3xl leading-none text-primary">Scan a product</h2><p className="mt-2 text-xs font-medium text-muted-foreground">A photo starts a draft. You decide what goes into your shop.</p></div>
        <button ref={closeRef} type="button" onClick={onClose} className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground" aria-label="Close product scan" data-testid="button-close-scan"><X size={18} /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Take a product photo" data-testid="input-scan-camera" onChange={(event) => { void chooseFile(event.target.files?.[0]); event.target.value = ''; }} />
        <input ref={uploadRef} type="file" accept="image/*" className="sr-only" aria-label="Upload a product photo" data-testid="input-scan-upload" onChange={(event) => { void chooseFile(event.target.files?.[0]); event.target.value = ''; }} />
        {phase === 'choose' && <>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => cameraRef.current?.click()} className="flex min-h-32 flex-col items-start justify-between rounded-xl border-2 border-primary bg-primary/5 p-4 text-left hover:bg-primary/10" data-testid="button-scan-camera"><Camera size={25} className="text-primary" /><span><strong className="block text-sm text-foreground">Take photo</strong><small className="mt-1 block text-xs text-muted-foreground">Use your camera</small></span></button>
            <button type="button" onClick={() => uploadRef.current?.click()} className="flex min-h-32 flex-col items-start justify-between rounded-xl border border-border bg-background p-4 text-left hover:border-primary" data-testid="button-scan-upload"><ImageUp size={25} className="text-primary" /><span><strong className="block text-sm text-foreground">Upload photo</strong><small className="mt-1 block text-xs text-muted-foreground">Choose an image</small></span></button>
          </div>
          <div className="mt-5 rounded-xl bg-secondary/60 p-4 text-xs leading-relaxed text-muted-foreground"><strong className="mb-1 block text-foreground">Before you choose a photo</strong> The image is sent to Replit AI Integrations / OpenAI to read the packaging, which incurs credits. Scans share a shop-wide limit of 8 per day and 40 per month (UTC); retries count too. If the limit is reached, close this dialog and add the product manually. The source photo is not saved. A smaller copy is kept only if you choose to save it as a catalog image. Check every suggestion before saving; missing prices and arrival counts are left blank.</div>
          {photo && <button type="button" onClick={retry} className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg border border-primary px-4 text-xs font-bold text-primary" data-testid="button-scan-retry"><RotateCcw size={15} /> Retry this photo</button>}
        </>}
        {phase === 'loading' && <div className="py-8" role="status" data-testid="status-scan-loading"><div className="mb-5 flex items-center gap-3 text-primary"><ScanLine size={22} /><strong className="text-sm">Reading the package…</strong></div><div className="h-16 animate-pulse rounded-xl bg-secondary" /><div className="mt-3 h-16 animate-pulse rounded-xl bg-secondary/70" /><p className="mt-5 text-xs text-muted-foreground">No catalog changes are made during scanning.</p></div>}
        {phase === 'empty' && <div className="rounded-xl border border-dashed border-border bg-background px-5 py-8 text-center" data-testid="status-scan-empty"><Package size={28} className="mx-auto text-primary/60" /><h3 className="mt-3 text-base font-extrabold">Nothing certain from this photo</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Try a clearer view of the label, or enter the details yourself.</p><div className="mt-5 flex flex-wrap justify-center gap-2"><button type="button" onClick={retry} className="rounded-lg bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground" data-testid="button-scan-retry"><RotateCcw size={14} className="mr-1 inline" /> Retry scan</button><button type="button" onClick={() => { setError(''); setPhase('review'); }} className="rounded-lg border border-border px-4 py-2.5 text-xs font-bold" data-testid="button-scan-manual">Enter details myself</button></div></div>}
        {phase === 'review' && <>
          <div className="mb-5 flex items-start gap-4">
            {photo && <img src={photo.image} alt="Selected package" className="size-20 shrink-0 rounded-xl border border-border object-cover" data-testid="image-scan-preview" />}
            <div className="min-w-0 flex-1"><p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-primary">Review suggestions</p><p className="mt-1 truncate text-xs font-bold text-foreground">{photo?.filename}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Blank means the photo did not show it clearly. Set the details you know.</p><button type="button" onClick={changePhoto} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary" data-testid="button-scan-change-photo"><ArrowLeft size={14} /> Change photo</button></div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">Product name<input value={name} onChange={(event) => { setName(event.target.value); setError(''); }} placeholder="Name on package" className={fieldClass} data-testid="input-scan-name" /></label>
            <label className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">Category<select value={category} onChange={(event) => { setCategory(event.target.value); setError(''); }} className={fieldClass} data-testid="select-scan-category"><option value="">Choose category</option>{categoryOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
            <label className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">Size / type<input value={variantName} onChange={(event) => { setVariantName(event.target.value); setError(''); }} placeholder="e.g. 500 g" className={fieldClass} data-testid="input-scan-variant" /></label>
            <label className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">Selling unit<input value={unit} onChange={(event) => { setUnit(event.target.value); setError(''); }} placeholder="e.g. pack, bottle" className={fieldClass} data-testid="input-scan-unit" /></label>
            <label className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">Suggested selling price ₹<input type="number" inputMode="decimal" min="0" step="0.01" value={price} onChange={(event) => { setPrice(event.target.value); setError(''); }} placeholder="Not found — enter if known" className={fieldClass} data-testid="input-scan-price" /></label>
            <label className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">Arrival quantity · optional<input type="number" inputMode="numeric" min="0" step="1" value={quantity} onChange={(event) => { setQuantity(event.target.value); setError(''); }} placeholder="Leave blank if unknown" className={fieldClass} data-testid="input-scan-quantity" /></label>
          </div>
          <div className="mt-6 rounded-xl border border-border bg-background p-4">
            <div className="flex items-start gap-2"><Package size={17} className="mt-0.5 shrink-0 text-primary" /><div><h3 className="text-sm font-extrabold">Already in your catalog?</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Pick any product and variant yourself, even when the name on the package is different.</p></div></div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">Existing product<select value={productId} onChange={(event) => { setProductId(event.target.value); setVariantId(''); setReplacePhoto(false); setError(''); }} className={fieldClass} data-testid="select-scan-existing-product"><option value="">Choose a product</option>{catalog.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
              <label className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">Existing variant<select value={variantId} onChange={(event) => { setVariantId(event.target.value); setError(''); }} disabled={!existing} className={fieldClass} data-testid="select-scan-existing-variant"><option value="">Choose a variant</option>{existing?.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.name} · ₹{variant.price} / {variant.unit}</option>)}</select></label>
            </div>
             {existingVariant && <p className="mt-3 rounded-lg bg-secondary/60 px-3 py-2 text-xs font-semibold text-foreground" data-testid="text-scan-current-stock">{typeof existingVariant.stock === 'number' ? `Current stock: ${existingVariant.stock} ${existingVariant.unit}. Restock adds the arrival count to this amount.` : 'Stock is not tracked yet. Restocking starts tracking at the arrival count you enter; check existing stock first.'}</p>}
            {existing && <label className="mt-4 flex cursor-pointer items-start gap-2 text-xs font-semibold leading-5 text-foreground"><input type="checkbox" checked={replacePhoto} onChange={(event) => setReplacePhoto(event.target.checked)} className="mt-1 accent-primary" data-testid="checkbox-scan-replace-photo" /> Replace this product's existing photo when updating details</label>}
          </div>
          <div className="mt-5 space-y-2">
            <button type="button" onClick={createDraft} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground" data-testid="button-scan-create"><Check size={17} /> Add new product · review in editor</button>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button type="button" onClick={restock} disabled={!existing || !existingVariant} className="min-h-11 rounded-xl border border-primary px-3 text-xs font-extrabold text-primary disabled:cursor-not-allowed disabled:opacity-40" data-testid="button-scan-restock">Restock selected variant</button>
              <button type="button" onClick={updateDraft} disabled={!existing || !existingVariant} className="min-h-11 rounded-xl border border-border px-3 text-xs font-extrabold text-foreground disabled:cursor-not-allowed disabled:opacity-40" data-testid="button-scan-update">Update details · review in editor</button>
            </div>
            <p className="text-center text-[11px] leading-4 text-muted-foreground">Only Restock changes stock now. New products and edits open your usual editor before saving.</p>
          </div>
        </>}
        {error && <div role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs font-semibold text-destructive" data-testid="status-scan-error">{error}</div>}
      </div>
    </div>
  </div>;
}