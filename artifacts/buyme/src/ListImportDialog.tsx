import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, Check, FileText, ImageUp, Plus, Trash2, X } from 'lucide-react';
import type { Product } from './catalog-data';
import type { DetectedListItem, ImportBillLine } from './list-import-types';

type Draft = { id: number; name: string; qty: string; price: string; variantId: string; detectedVariant: string };
type Props = { products: Product[]; onClose: () => void; onImport?: (lines: ImportBillLine[]) => string | null };
const normalize = (value: string) => value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const money = (amount: number) => `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const inputClass = 'h-11 min-w-0 w-full rounded-lg border border-border bg-background px-3 text-sm font-semibold text-foreground outline-none focus:border-primary';

function readDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read this file. Please try another.'));
    reader.readAsDataURL(file);
  });
}

async function prepareImage(file: File): Promise<string> {
  const source = await readDataUrl(file);
  const image = new Image();
  image.src = source;
  try { await image.decode(); } catch { throw new Error('This image could not be opened. Try a JPEG or PNG.'); }
  const scale = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image processing is unavailable on this device.');
  context.fillStyle = '#fffdf7';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.88, 0.78, 0.66, 0.52]) {
    const data = canvas.toDataURL('image/jpeg', quality);
    if (data.length < 6_800_000) return data;
  }
  throw new Error('This photo is too detailed to upload. Please retake it closer to the list.');
}

export default function ListImportDialog({ products, onClose, onImport }: Props) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [phase, setPhase] = useState<'choose' | 'loading' | 'review'>('choose');
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const idRef = useRef(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onCloseRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); requestRef.current?.abort(); };
  }, []);

  function matchProduct(name: string) { return products.find((product) => normalize(product.name) === normalize(name)); }
  function fromDetected(item: DetectedListItem): Draft {
    const product = matchProduct(item.name);
    const hint = normalize(item.variant || item.unit || '');
    const exact = product?.variants.find((variant) => normalize(variant.name) === hint);
    const chosen = exact || (product?.variants.length === 1 ? product.variants[0] : undefined);
    return {
      id: ++idRef.current, name: item.name || '', qty: String(item.quantity || 1),
      price: item.unitPrice != null ? String(item.unitPrice) : chosen ? String(chosen.price) : '',
      variantId: chosen?.id || '', detectedVariant: item.variant || item.unit || '',
    };
  }
  function update(id: number, patch: Partial<Draft>) {
    setDrafts((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
    setError('');
  }
  function updateName(row: Draft, name: string) {
    const product = matchProduct(name);
    const only = product?.variants.length === 1 ? product.variants[0] : undefined;
    update(row.id, { name, variantId: only?.id || '', price: row.price || (only ? String(only.price) : '') });
  }
  async function processFile(file?: File) {
    if (!file) return;
    setError('');
    setDrafts([]);
    setFileName(file.name);
    setPhase('choose');
    const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    const image = ['image/jpeg', 'image/png'].includes(file.type) || /\.(jpe?g|png)$/i.test(file.name);
    if (!pdf && !image) { setError('Choose a JPEG, PNG, or PDF file.'); return; }
    if (pdf && file.size > 6_000_000) { setError('PDFs must be 6 MB or smaller.'); return; }
    if (image && file.size > 8 * 1024 * 1024) { setError('Photos must be 8 MB or smaller.'); return; }
    setPhase('loading');
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    try {
      const document = pdf ? (await readDataUrl(file)).replace(/^data:[^;]*;base64,/, 'data:application/pdf;base64,') : await prepareImage(file);
      if (controller.signal.aborted) return;
      const payload = JSON.stringify({ document, filename: file.name });
      if (payload.length > 8_300_000) throw new Error('The encoded document is too large. Try a smaller PDF or a clearer photo.');
      const response = await fetch('/api/billing/extract-list', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: payload, signal: controller.signal,
      });
      if (!response.ok) {
        let message = `Could not read the list (${response.status}). Please retry.`;
        try {
          const body: unknown = await response.json();
          if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') message = body.error;
        } catch { /* Keep the HTTP error. */ }
        throw new Error(message);
      }
      const result: unknown = await response.json();
      if (!result || typeof result !== 'object' || !('items' in result) || !Array.isArray(result.items)) throw new Error('The reader returned an unexpected result. Please retry.');
      const items = result.items.filter((item): item is DetectedListItem => !!item && typeof item.name === 'string' && typeof item.quantity === 'number');
      setDrafts(items.map(fromDetected));
      setPhase('review');
    } catch (reason) {
      if (controller.signal.aborted) return;
      setError(reason instanceof Error ? reason.message : 'Could not read this list. Please retry.');
      setPhase('choose');
    }
  }
  function confirm() {
    if (!drafts.length) { setError('Add at least one item to continue.'); return; }
    const lines: ImportBillLine[] = [];
    for (const row of drafts) {
      const name = row.name.trim();
      const qty = Number(row.qty);
      const price = Number(row.price);
      const product = matchProduct(name);
      const variant = product?.variants.find((option) => option.id === row.variantId);
      if (!name || !Number.isSafeInteger(qty) || qty <= 0) { setError('Every row needs a name and a whole-number quantity above zero.'); return; }
      if (product && !variant) { setError(`Choose a variant for ${name} before importing.`); return; }
      if (!Number.isFinite(price) || price <= 0 || !row.price.trim()) { setError(`Enter a positive unit price for ${name}.`); return; }
      lines.push({ name: product?.name || name, variant: variant?.name || row.detectedVariant.trim() || 'Custom item', qty, price, ...(product && variant ? { productId: product.id, variantId: variant.id } : {}) });
    }
    if (!onImport) { setError('List import is not connected to billing yet. Please add items manually.'); return; }
    try {
      const result = onImport(lines);
      if (result !== null) { setError(result || 'The list was not added. Please try again.'); return; }
      onClose();
    } catch { setError('The list was not added. Please try again.'); }
  }

  return <div className="fixed inset-0 z-[80] flex items-end justify-center bg-foreground/55 sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="import-title" className="flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl sm:max-h-[88dvh] sm:rounded-2xl">
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-7">
        <div><div className="mb-1 text-[10px] font-extrabold uppercase tracking-[.16em] text-primary">BUYME / BILLING</div><h2 id="import-title" className="font-display text-3xl leading-none text-primary">Add list / Add items</h2><p className="mt-2 text-xs font-medium text-muted-foreground">Turn a paper list into bill lines. Review each line before adding.</p></div>
        <button ref={closeRef} type="button" onClick={onClose} className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground" aria-label="Close list import" data-testid="button-close-import"><X size={18} /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
        <input ref={cameraRef} type="file" accept="image/jpeg,image/png" capture="environment" className="sr-only" onChange={(event) => { void processFile(event.target.files?.[0]); event.target.value = ''; }} aria-label="Take a photo of a list" data-testid="input-camera-list" />
        <input ref={uploadRef} type="file" accept="image/jpeg,image/png,application/pdf,.pdf" className="sr-only" onChange={(event) => { void processFile(event.target.files?.[0]); event.target.value = ''; }} aria-label="Upload a list image or PDF" data-testid="input-upload-list" />
        {phase === 'choose' && <>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => cameraRef.current?.click()} className="flex min-h-32 flex-col items-start justify-between rounded-xl border-2 border-primary bg-primary/5 p-4 text-left hover:bg-primary/10" data-testid="button-camera-list"><Camera size={25} className="text-primary" /><span><strong className="block text-sm text-foreground">Take photo</strong><small className="mt-1 block text-xs text-muted-foreground">Use your camera</small></span></button>
            <button type="button" onClick={() => uploadRef.current?.click()} className="flex min-h-32 flex-col items-start justify-between rounded-xl border border-border bg-background p-4 text-left hover:border-primary" data-testid="button-upload-list"><ImageUp size={25} className="text-primary" /><span><strong className="block text-sm text-foreground">Upload file</strong><small className="mt-1 block text-xs text-muted-foreground">Image or PDF</small></span></button>
          </div>
          <div className="mt-5 rounded-xl bg-secondary/60 p-4 text-xs leading-relaxed text-muted-foreground"><FileText size={17} className="mb-2 text-primary" />JPEG and PNG up to 8 MB; PDF up to 6 MB. Photos are resized to 1800px for reading. Documents are sent to Replit AI Integrations / OpenAI for reading and incur credits. Scans share a shop-wide limit of 8 per day and 40 per month (UTC); retries count too. If the limit is reached, add bill items manually. The source file is not saved. AI can misread handwriting; check names, quantities and prices.</div>
        </>}
        {phase === 'loading' && <div className="py-12" role="status" data-testid="status-import-loading"><div className="mb-5 flex items-center gap-3 text-primary"><FileText size={22} /><strong className="text-sm">Reading {fileName}…</strong></div><div className="h-16 animate-pulse rounded-lg bg-secondary" /><div className="mt-2 h-16 animate-pulse rounded-lg bg-secondary/70" /><p className="mt-5 text-xs text-muted-foreground">Keep this open while the list is read.</p></div>}
        {phase === 'review' && <>
          <div className="mb-4 flex items-center justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-muted-foreground">Review before billing</p><p className="mt-1 text-sm font-bold">{drafts.length} {drafts.length === 1 ? 'line' : 'lines'} from {fileName}</p></div><button type="button" onClick={() => { setPhase('choose'); setError(''); }} className="flex items-center gap-1 text-xs font-bold text-primary" data-testid="button-change-list"><ArrowLeft size={14} /> Change file</button></div>
          {drafts.length ? <div className="space-y-3">{drafts.map((row, index) => {
            const product = matchProduct(row.name);
            const variant = product?.variants.find((option) => option.id === row.variantId);
            return <div key={row.id} className="rounded-xl border border-border bg-background p-3 sm:p-4" data-testid={`row-extracted-${index}`}>
              <div className="mb-3 flex items-center justify-between"><span className="text-[10px] font-extrabold uppercase tracking-widest text-primary">Line {index + 1}</span><button type="button" onClick={() => { setDrafts((current) => current.filter((entry) => entry.id !== row.id)); setError(''); }} aria-label={`Remove line ${index + 1}`} className="rounded-md p-1 text-muted-foreground hover:text-destructive" data-testid={`button-remove-extracted-${index}`}><Trash2 size={16} /></button></div>
              <div className="grid grid-cols-[minmax(0,1fr)_80px] gap-2 sm:grid-cols-[minmax(0,1fr)_90px_110px]">
                <label className="min-w-0 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Item name<input value={row.name} onChange={(event) => updateName(row, event.target.value)} className={`mt-1 ${inputClass}`} data-testid={`input-extracted-name-${index}`} /></label>
                <label className="min-w-0 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Qty<input type="number" inputMode="numeric" min="1" step="1" value={row.qty} onChange={(event) => update(row.id, { qty: event.target.value })} className={`mt-1 ${inputClass}`} data-testid={`input-extracted-quantity-${index}`} /></label>
                <label className="min-w-0 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Unit price ₹<input type="number" inputMode="decimal" min="0.01" step="0.01" value={row.price} onChange={(event) => update(row.id, { price: event.target.value })} className={`mt-1 ${inputClass}`} data-testid={`input-extracted-price-${index}`} /></label>
              </div>
              {product ? <div className="mt-3"><label className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground" htmlFor={`import-variant-${row.id}`}>Catalog variant {variant ? '· matched' : '· choose one'}</label><select id={`import-variant-${row.id}`} value={row.variantId} onChange={(event) => { const choice = product.variants.find((option) => option.id === event.target.value); update(row.id, { variantId: event.target.value, price: choice ? String(choice.price) : row.price }); }} className={`mt-1 ${inputClass}`} data-testid={`select-extracted-variant-${index}`}><option value="">Choose variant</option>{product.variants.map((option) => <option key={option.id} value={option.id}>{option.name} · {money(option.price)} / {option.unit}</option>)}</select></div> : <p className="mt-3 text-xs font-medium text-muted-foreground">Not matched to catalog. Enter a positive unit price to add as a custom line.</p>}
            </div>;
          })}</div> : <div className="rounded-xl border border-dashed border-border bg-background px-5 py-10 text-center" data-testid="status-import-empty"><FileText size={26} className="mx-auto text-primary/60" /><p className="mt-3 text-sm font-bold">No items were found</p><p className="mt-1 text-xs text-muted-foreground">Try a clearer photo, or add a line yourself.</p></div>}
          <button type="button" onClick={() => { setDrafts((current) => [...current, { id: ++idRef.current, name: '', qty: '1', price: '', variantId: '', detectedVariant: '' }]); setError(''); }} className="mt-4 flex items-center gap-2 rounded-lg px-1 py-2 text-xs font-extrabold text-primary" data-testid="button-add-extracted-line"><Plus size={17} /> Add a line</button>
        </>}
        {error && <div role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs font-semibold text-destructive" data-testid="status-import-error">{error}</div>}
      </div>
      {phase === 'review' && <div className="shrink-0 border-t border-border bg-card px-5 py-4 sm:px-7"><button type="button" onClick={confirm} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-extrabold text-primary-foreground disabled:opacity-50" disabled={!drafts.length} data-testid="button-confirm-import"><Check size={17} /> Add {drafts.length} {drafts.length === 1 ? 'line' : 'lines'} to bill</button></div>}
    </div>
  </div>;
}