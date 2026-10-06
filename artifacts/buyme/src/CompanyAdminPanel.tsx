import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Seller = { id: string; name: string; premiumApproved: boolean; accessEnabled: boolean; upgradeRequestedAt: string | null; members: { email: string; role: string }[] };
type Patch = { premiumApproved?: boolean; accessEnabled?: boolean };

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const apiUrl = (path: string) => `${basePath}${path}`;

async function errorOf(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error || fallback;
}
function when(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" }).format(date);
}

export default function CompanyAdminPanel({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [query, setQuery] = useState("");
  const [onlyRequests, setOnlyRequests] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const busyRef = useRef("");
  busyRef.current = busy;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(apiUrl("/api/shop/sellers"), { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error(await errorOf(response, "Could not load seller accounts."));
      const body = await response.json() as { sellers?: Seller[] };
      if (!body || !Array.isArray(body.sellers)) throw new Error("Seller list came back in an unexpected format.");
      setSellers(body.sellers.map((s) => ({ ...s, members: Array.isArray(s.members) ? s.members : [] })));
      setLoaded(true); setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load seller accounts.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    const quiet = () => { if (!busyRef.current && navigator.onLine) void load(); };
    const timer = window.setInterval(quiet, 30000);
    const goOnline = () => { setOnline(true); quiet(); };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    window.addEventListener("focus", quiet);
    return () => { window.clearInterval(timer); window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); window.removeEventListener("focus", quiet); };
  }, [load]);

  const write = async (seller: Seller, patch: Patch, confirmText: string | null, done: string) => {
    if (busy || !online) return;
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(seller.id); setError(""); setNotice("");
    try {
      const response = await fetch(apiUrl(`/api/shop/sellers/${encodeURIComponent(seller.id)}`), { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      if (!response.ok) throw new Error(await errorOf(response, "Could not update this shop."));
      const updated = await response.json().catch(() => null) as { id?: string } | null;
      if (!updated || updated.id !== seller.id) throw new Error("The server reply was not understood. Refresh to see the current state.");
      await load();
      setNotice(done);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update this shop.");
      void load();
    } finally { setBusy(""); }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sellers.filter((s) => (!onlyRequests || (s.upgradeRequestedAt && !s.premiumApproved)) && (!q || s.name.toLowerCase().includes(q) || s.members.some((m) => m.email.toLowerCase().includes(q))));
  }, [sellers, query, onlyRequests]);
  const requests = sellers.filter((s) => s.upgradeRequestedAt && !s.premiumApproved).length;
  const locked = Boolean(busy) || !online;
  const btn = "rounded-xl px-3 py-2 text-xs font-extrabold disabled:opacity-50";

  return <main className="min-h-[100dvh] bg-background px-5 py-8 sm:px-10"><div className="mx-auto max-w-5xl">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
      <div><p className="text-xs font-bold uppercase tracking-widest text-primary">BUYME company</p><h1 className="mt-2 text-3xl font-extrabold">Seller access</h1><p className="mt-1 text-sm text-muted-foreground">Signed in as {email}</p></div>
      <button type="button" onClick={onSignOut} className="rounded-xl border border-border px-4 py-2 text-sm font-bold" data-testid="button-admin-sign-out">Sign out</button>
    </header>
    <section className="mt-7 rounded-2xl border border-border bg-card p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-xl font-extrabold">Shops and plans</h2><p className="mt-1 max-w-xl text-sm text-muted-foreground">Plan and access changes apply to every member of the shop. Data is never changed.</p></div>
        <button type="button" disabled={loading || !online} onClick={() => void load()} className="rounded-xl border border-border px-3 py-2 text-xs font-bold disabled:opacity-50" data-testid="button-admin-refresh">{loading ? "Refreshing…" : "Refresh"}</button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by user email or shop name" aria-label="Search shops" className="field min-w-0 flex-1 basis-64" data-testid="input-admin-search" />
        <button type="button" aria-pressed={onlyRequests} onClick={() => setOnlyRequests((v) => !v)} className={`rounded-xl border px-3 py-2 text-xs font-bold ${onlyRequests ? "border-primary bg-primary/10 text-primary" : "border-border"}`} data-testid="button-filter-requests">Requests ({requests})</button>
      </div>
      {!online && <p role="status" className="mt-4 rounded-lg bg-muted p-3 text-sm text-muted-foreground">You are offline. Changes are disabled until the connection returns.</p>}
      {error && <p role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive" data-testid="text-admin-error"><span>{error}</span><button type="button" onClick={() => void load()} className="font-bold underline">Retry</button></p>}
      {notice && <p role="status" className="mt-4 rounded-lg bg-muted p-3 text-sm font-bold" data-testid="text-admin-notice">{notice}</p>}
      {!loaded && !error ? <div className="mt-5 space-y-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)}</div>
        : filtered.length ? <div className="mt-5 divide-y divide-border">{filtered.map((s) => {
          const requested = Boolean(s.upgradeRequestedAt) && !s.premiumApproved;
          return <article key={s.id} className="flex flex-wrap items-center justify-between gap-4 py-4" data-testid={`row-seller-${s.id}`}>
            <div className="min-w-0 flex-1 basis-64">
              <div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{s.name}</h3>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${s.premiumApproved ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{s.premiumApproved ? "Full" : "Basic"}</span>
                {!s.accessEnabled && <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-[10px] font-extrabold text-destructive">Paused</span>}
                {requested && <span className="rounded-full bg-accent/20 px-2.5 py-1 text-[10px] font-extrabold" data-testid={`status-request-${s.id}`}>Requested Full {when(s.upgradeRequestedAt!)}</span>}
              </div>
              <p className="mt-1 break-words text-xs text-muted-foreground">{s.members.map((m) => `${m.email} (${m.role})`).join(" · ") || "No members"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {s.premiumApproved
                ? <button type="button" disabled={locked} onClick={() => void write(s, { premiumApproved: false }, `Switch ${s.name} to Basic? This applies to every member of the shop. Their data is kept.`, `${s.name} switched to Basic.`)} className={`${btn} border border-border`} data-testid={`button-basic-${s.id}`}>{busy === s.id ? "Saving…" : "Switch to Basic"}</button>
                : <button type="button" disabled={locked} onClick={() => void write(s, { premiumApproved: true }, null, `Full approved for ${s.name}.`)} className={`${btn} bg-primary text-primary-foreground`} data-testid={`button-approve-${s.id}`}>{busy === s.id ? "Saving…" : "Approve Full"}</button>}
              {s.accessEnabled
                ? <button type="button" disabled={locked} onClick={() => void write(s, { accessEnabled: false }, `Pause access for ${s.name}? Every member of the shop will be blocked until you restore it.`, `Access paused for ${s.name}.`)} className={`${btn} border border-destructive/40 text-destructive`} data-testid={`button-pause-${s.id}`}>Pause access</button>
                : <button type="button" disabled={locked} onClick={() => void write(s, { accessEnabled: true }, null, `Access restored for ${s.name}.`)} className={`${btn} bg-primary text-primary-foreground`} data-testid={`button-restore-${s.id}`}>Restore access</button>}
            </div>
          </article>;
        })}</div>
        : loaded && <p className="mt-6 rounded-xl bg-muted/40 p-5 text-sm text-muted-foreground" data-testid="text-admin-empty">{sellers.length ? "No shops match your search." : "No seller shops yet. They appear here after a seller creates an account."}</p>}
    </section>
  </div></main>;
}
