import { useCallback, useEffect, useId, useRef, useState } from "react";

type Mode = "basic" | "full";
type Props = {
  variant?: "button" | "settings";
  mode: Mode;
  premiumApproved: boolean;
  requestedAt?: string | null;
  onChooseMode: (mode: Mode) => void;
  onRequestFull: () => Promise<void>;
  onRefresh: () => Promise<void>;
};

function when(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" }).format(date);
}

export default function PlanAccess({ variant = "button", mode, premiumApproved, requestedAt, onChooseMode, onRequestFull, onRefresh }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const waiting = !premiumApproved && Boolean(requestedAt);
  const label = premiumApproved ? (mode === "full" ? "Premium plan" : "Basic view") : "Basic plan";

  const close = useCallback(() => { setOpen(false); setError(""); setSuccess(""); window.setTimeout(() => triggerRef.current?.focus(), 0); }, []);

  useEffect(() => {
    if (!open) return;
    const root = dialogRef.current;
    const focusables = () => Array.from(root?.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])") ?? []);
    (focusables()[0] ?? root)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) { event.preventDefault(); close(); return; }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (!items.length) { event.preventDefault(); root?.focus(); return; }
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, close]);

  const run = async (name: string, action: () => Promise<void>, done: string) => {
    if (busy) return;
    setBusy(name); setError(""); setSuccess("");
    try { await action(); setSuccess(done); }
    catch (cause) { setError(cause instanceof Error && cause.message ? cause.message : "Something went wrong. Check your connection and try again."); }
    finally { setBusy(""); }
  };
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;

  const control = <button ref={triggerRef} type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} data-testid="button-plan-access"
    className={variant === "settings" ? "rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground" : "rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground hover:border-primary/40 hover:text-primary"}>
    {variant === "settings" ? "Manage plan" : waiting ? `${label} · request pending` : label}
  </button>;

  return <>
    {variant === "settings"
      ? <section className="rounded-2xl border border-border bg-card p-5" data-testid="section-plan-summary">
        <p className="text-xs font-bold uppercase tracking-widest text-primary">Plan</p>
        <h3 className="mt-2 text-lg font-extrabold">{premiumApproved ? "Premium access approved" : "Basic plan"}</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {premiumApproved ? `You are using the ${mode === "full" ? "Full" : "Basic"} interface. Your shop data is the same in both.` : waiting ? `Full access requested${when(requestedAt) ? ` on ${when(requestedAt)}` : ""}. Waiting for BUYME approval.` : "Basic covers billing and your catalog. Full adds Insights, Settings, PDF reports, alerts and individual bill receipts."}
        </p>
        <div className="mt-4">{control}</div>
      </section>
      : control}
    {open && <div className="fixed inset-0 z-[80] flex items-end justify-center bg-foreground/40 p-4 sm:items-center" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) close(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descId} tabIndex={-1} className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-foreground shadow-xl outline-none" data-testid="dialog-plan-access">
        <p className="text-xs font-bold uppercase tracking-widest text-primary">Your plan</p>
        <h2 id={titleId} className="mt-2 text-xl font-extrabold">{premiumApproved ? "Choose your interface" : "Basic plan"}</h2>
        <div id={descId} className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
          <p><strong className="text-foreground">Basic</strong> gives you billing, payments and your product catalog.</p>
          <p><strong className="text-foreground">Full</strong> adds stock alerts, customer broadcast and individual printable bills. Approval is given by the BUYME company team and applies to everyone in your shop.</p>
          <p>Both versions include PDF data reports from Settings and Insights.</p>
          {premiumApproved && <p>Switching the interface does not change your approval or any shop data.</p>}
          {waiting && <p data-testid="status-request-waiting" className="rounded-lg bg-muted p-3 text-foreground">Request sent{when(requestedAt) ? ` on ${when(requestedAt)}` : ""}. Waiting for approval. Use Check status to see if it has been approved.</p>}
        </div>
        {offline && <p role="status" className="mt-3 text-xs text-muted-foreground">You are offline. Connect to the internet to continue.</p>}
        {error && <p role="alert" className="mt-3 rounded-lg bg-destructive/10 p-3 text-xs text-destructive" data-testid="text-plan-error">{error}</p>}
        {success && <p role="status" className="mt-3 rounded-lg bg-muted p-3 text-xs font-bold" data-testid="text-plan-success">{success}</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          {premiumApproved ? <>
            <button type="button" disabled={mode === "full"} onClick={() => { onChooseMode("full"); close(); }} className="rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground disabled:opacity-50" data-testid="button-use-full">{mode === "full" ? "Using Full" : "Use Full"}</button>
            <button type="button" disabled={mode === "basic"} onClick={() => { onChooseMode("basic"); close(); }} className="rounded-xl border border-border px-4 py-2.5 text-xs font-bold disabled:opacity-50" data-testid="button-use-basic">{mode === "basic" ? "Using Basic" : "Use Basic"}</button>
          </> : <>
            {!waiting && <button type="button" disabled={Boolean(busy) || offline} onClick={() => void run("request", onRequestFull, "Request sent. We will show approval here once the company team approves it.")} className="rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground disabled:opacity-50" data-testid="button-request-full">{busy === "request" ? "Sending…" : "Request Full access"}</button>}
            <button type="button" disabled={Boolean(busy) || offline} onClick={() => void run("refresh", onRefresh, "Status checked.")} className="rounded-xl border border-border px-4 py-2.5 text-xs font-bold disabled:opacity-50" data-testid="button-refresh-plan">{busy === "refresh" ? "Checking…" : "Check status"}</button>
          </>}
          <button type="button" disabled={Boolean(busy)} onClick={close} className="rounded-xl px-4 py-2.5 text-xs font-bold text-muted-foreground" data-testid="button-close-plan">Close</button>
        </div>
      </div>
    </div>}
  </>;
}
