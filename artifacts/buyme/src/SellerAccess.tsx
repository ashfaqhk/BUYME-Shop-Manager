import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk, useUser } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import type { Product } from "./catalog-data";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const publishableKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
if (!publishableKey) throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY.");

export type ShopState = {
  shopId: string;
  shopName: string;
  email: string;
  role: string;
  isCompanyAdmin: boolean;
  premiumApproved: boolean;
  mode: "basic" | "full";
  catalog: Product[];
  sales: unknown[];
  settings: Record<string, unknown>;
  revision: number;
  isNew?: boolean;
};

type Snapshot = Pick<ShopState, "catalog" | "sales" | "settings">;
type SellerContextValue = {
  shop: ShopState;
  save: (snapshot: Snapshot) => Promise<void>;
  saveStatus: string;
  retrySave: () => void;
  refresh: () => Promise<ShopState>;
};
const SellerContext = createContext<SellerContextValue | null>(null);
export function useSellerShop() {
  const value = useContext(SellerContext);
  if (!value) throw new Error("Seller shop context is unavailable.");
  return value;
}

async function uploadDataImage(dataUrl: string): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const mime = blob.type as "image/jpeg" | "image/png" | "image/webp";
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime) || blob.size > 6_000_000) throw new Error("Shop images must be JPEG, PNG or WebP and under 6 MB.");
  const signed = await fetch("/api/shop/images/upload-url", {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType: mime, byteLength: blob.size }),
  });
  if (!signed.ok) throw new Error("Could not prepare a secure photo upload.");
  const { uploadURL, imageUrl } = await signed.json() as { uploadURL: string; imageUrl: string };
  const uploaded = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": mime }, body: blob });
  if (!uploaded.ok) throw new Error("Photo upload failed. Check your connection and try again.");
  return imageUrl;
}
export const uploadSellerPhoto = uploadDataImage;

export function AccountBar({ email, role, mode, saveStatus, onRetry }: { email: string; role: string; mode: string; saveStatus: string; onRetry: () => void }) {
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const [team, setTeam] = useState<{ email: string; role: string }[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const refreshTeam = useCallback(async () => {
    const response = await fetch("/api/shop/members", { credentials: "include" });
    if (!response.ok) throw new Error("Could not load shop team.");
    const body = await response.json() as { members: typeof team };
    setTeam(body.members);
  }, []);
  useEffect(() => { if (open && role === "owner") refreshTeam().catch(() => undefined); }, [open, role, refreshTeam]);
  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/shop/invitations", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: inviteEmail }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Could not send invitation.");
      setInviteEmail("");
      setMessage(`Invitation sent to ${body.email}.`);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not send invitation."); }
    finally { setBusy(false); }
  };
  const unsaved = saveStatus && saveStatus !== "All changes saved";
  return <div className="relative flex items-center gap-2">
    <span className={`hidden rounded-full px-3 py-1.5 text-[10px] font-extrabold sm:inline ${mode === "full" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{mode === "full" ? "Premium" : "Basic"}</span>
    {saveStatus && <span role="status" className={`hidden max-w-48 truncate text-[10px] sm:inline ${unsaved ? "text-destructive" : "text-muted-foreground"}`}>{saveStatus}</span>}
    {unsaved && <button type="button" onClick={onRetry} className="text-[10px] font-bold text-primary underline">{saveStatus.toLowerCase().includes("changed on another device") ? "Reload latest" : "Retry save"}</button>}
    <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-left text-xs font-bold">
      <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary">{email.slice(0, 1).toUpperCase()}</span>
      <span className="max-w-36 truncate">{email}</span>
    </button>
    {open && <section className="absolute right-0 top-full z-50 mt-2 w-[min(92vw,360px)] rounded-2xl border border-border bg-card p-4 text-foreground shadow-xl">
      <h3 className="font-extrabold">Shop account</h3><p className="mt-1 text-xs text-muted-foreground">{role === "owner" ? "Shop owner" : "Team member"} · {mode === "full" ? "Premium access" : "Basic access"}</p>
      {role === "owner" && <><form onSubmit={invite} className="mt-4 flex gap-2"><input type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} className="field min-w-0 flex-1" placeholder="Team member email" /><button disabled={busy} className="rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground">{busy ? "Sending…" : "Invite"}</button></form><h4 className="mt-4 text-xs font-bold">Shop team</h4><div className="mt-2 space-y-1">{team.map((member) => <p key={`${member.email}-${member.role}`} className="flex justify-between text-xs"><span>{member.email}</span><span className="text-muted-foreground">{member.role}</span></p>)}</div></>}
      {message && <p role="status" className="mt-3 text-xs text-muted-foreground">{message}</p>}
      <button type="button" onClick={() => void signOut({ redirectUrl: basePath || "/" })} className="mt-4 w-full rounded-lg border border-border px-3 py-2 text-xs font-bold">Sign out</button>
    </section>}
  </div>;
}

async function externalizePhotos(snapshot: Snapshot): Promise<Snapshot> {
  const cache = new Map<string, string>();
  const convert = async (value: unknown): Promise<unknown> => {
    if (typeof value === "string" && value.startsWith("data:image/")) {
      if (!cache.has(value)) cache.set(value, await uploadDataImage(value));
      return cache.get(value)!;
    }
    if (Array.isArray(value)) return Promise.all(value.map(convert));
    if (value && typeof value === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value)) result[key] = await convert(item);
      return result;
    }
    return value;
  };
  return await convert(snapshot) as Snapshot;
}

function savedLocalSnapshot(): Snapshot | null {
  try {
    const catalogRaw = localStorage.getItem("buyme-catalog");
    const salesRaw = localStorage.getItem("buyme-sales");
    const settingsRaw = localStorage.getItem("buyme-settings");
    if (!catalogRaw && !salesRaw && !settingsRaw) return null;
    const settings = settingsRaw ? JSON.parse(settingsRaw) : {};
    if (settings.upiId && settings.upiId !== "sharmastore@upi" && !settings.paymentQrs?.length) {
      settings.paymentQrs = [{ id: crypto.randomUUID(), label: "Primary UPI", upiId: settings.upiId, upiName: settings.upiName || settings.shopName }];
    }
    return {
      catalog: catalogRaw ? JSON.parse(catalogRaw) : [],
      sales: salesRaw ? JSON.parse(salesRaw) : [],
      settings: { shopName: "My shop", phone: "", upiName: "", paymentQrs: [], gstEnabled: false, gstin: "", gstRate: 5, darkMode: false, ...settings, upiId: "" },
    };
  } catch {
    return null;
  }
}

function hasLocalImportChoice(shopId: string) {
  try { return Boolean(localStorage.getItem(`buyme-local-import-choice:${shopId}`)); }
  catch { return false; }
}

function saveLocalImportChoice(shopId: string, choice: "imported" | "fresh") {
  try { localStorage.setItem(`buyme-local-import-choice:${shopId}`, choice); }
  catch { /* The shop remains account-backed even if this browser cannot persist the prompt choice. */ }
}

function AccessRouter({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const path = window.location.pathname.slice(basePath.length) || "/";
  const atSignIn = path.startsWith("/sign-in");
  const atSignUp = path.startsWith("/sign-up");
  if (!isLoaded) return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading BUYME…</div>;
  if (atSignIn) return <AuthFrame><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></AuthFrame>;
  if (atSignUp) return <AuthFrame><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></AuthFrame>;
  return isSignedIn ? <AccountGate>{children}</AccountGate> : <WelcomePage />;
}

function AuthFrame({ children }: { children: ReactNode }) {
  return <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8">{children}</div>;
}

function WelcomePage() {
  return <main className="flex min-h-[100dvh] items-center justify-center bg-background px-5 py-12">
    <section className="w-full max-w-xl rounded-3xl border border-border bg-card p-8 text-center shadow-xl sm:p-12">
      <img src={`${window.location.origin}${basePath}/buyme-icon.svg`} alt="BUYME" className="mx-auto mb-6 h-14 w-14" />
      <p className="text-xs font-bold uppercase tracking-[.2em] text-primary">BUYME · Shop counter</p>
      <h1 className="mt-4 font-display text-4xl font-extrabold text-primary sm:text-5xl">Your shop, ready to move.</h1>
      <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-muted-foreground">Sign in to manage your catalog, payments and shop team. New accounts start in Basic; Premium access is approved by the BUYME company team.</p>
      <div className="mt-8 flex justify-center gap-3"><a className="rounded-xl bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground" href={`${basePath}/sign-in`}>Sign in</a><a className="rounded-xl border border-primary/30 px-5 py-3 text-sm font-extrabold text-primary" href={`${basePath}/sign-up`}>Create account</a></div>
    </section>
  </main>;
}

export function BuymeAccess({ children }: { children: ReactNode }) {
  return <ClerkProvider
    publishableKey={publishableKey}
    proxyUrl={clerkProxyUrl}
    appearance={{
      theme: shadcn,
      cssLayerName: "clerk",
       options: { logoPlacement: "inside", logoLinkUrl: basePath || "/", logoImageUrl: `${window.location.origin}${basePath}/buyme-icon.svg` },
      variables: { colorPrimary: "#4b397b", colorForeground: "#28233a", colorMutedForeground: "#6d6878", colorDanger: "#b42318", colorBackground: "#ffffff", colorInput: "#ffffff", colorInputForeground: "#28233a", colorNeutral: "#dedbe5", fontFamily: "Manrope, sans-serif", borderRadius: "0.85rem" },
      elements: { rootBox: "w-full flex justify-center", cardBox: "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden", card: "!shadow-none !border-0 !bg-transparent !rounded-none", footer: "!shadow-none !border-0 !bg-transparent !rounded-none", headerTitle: "text-[#28233a]", headerSubtitle: "text-[#6d6878]", formFieldLabel: "text-[#28233a]", formFieldInput: "bg-white text-[#28233a]", footerActionText: "text-[#6d6878]", footerActionLink: "text-[#4b397b]", formButtonPrimary: "bg-[#4b397b] text-white", dividerText: "text-[#6d6878]" },
    }}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    localization={{ signIn: { start: { title: "Welcome back", subtitle: "Sign in to your shop" } }, signUp: { start: { title: "Create your shop account", subtitle: "Get started with BUYME" } } }}
  >
    <AccessRouter>{children}</AccessRouter>
  </ClerkProvider>;
}

function AccountGate({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [shop, setShop] = useState<ShopState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [localSnapshot, setLocalSnapshot] = useState<Snapshot | null>(null);
  const revision = useRef(0);
  const latest = useRef<Snapshot | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const refresh = useCallback(async () => {
    const response = await fetch("/api/shop", { credentials: "include" });
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || "Could not load your shop.");
    const data = await response.json() as ShopState;
    revision.current = data.revision;
    setShop(data);
    return data;
  }, []);

  useEffect(() => {
    let active = true;
    refresh().then((data) => {
      if (!active) return;
      if (!data.isCompanyAdmin && data.role === "owner" && data.isNew) {
        if (!hasLocalImportChoice(data.shopId)) setLocalSnapshot(savedLocalSnapshot());
      }
      setError("");
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load your shop."))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);

  useEffect(() => {
    if (!shop || shop.isCompanyAdmin) return;
    const timer = window.setInterval(() => {
      refresh().then((data) => {
        if (data.mode !== shop.mode) window.location.reload();
      }).catch(() => undefined);
    }, 30000);
    return () => window.clearInterval(timer);
  }, [refresh, shop?.shopId, shop?.mode, shop?.isCompanyAdmin]);

  const commit = useCallback((snapshot: Snapshot) => {
    latest.current = snapshot;
    setSaveStatus("Saving…");
    queue.current = queue.current.catch(() => undefined).then(async () => {
      const safeData = await externalizePhotos(snapshot);
      const response = await fetch("/api/shop", {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...safeData, revision: revision.current }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Shop changes could not be saved.");
      }
      const result = await response.json() as ShopState;
      revision.current = result.revision;
      setShop(result);
      setSaveStatus("All changes saved");
    }).catch((cause) => {
      setSaveStatus(cause instanceof Error ? cause.message : "Shop changes could not be saved.");
      throw cause;
    });
    return queue.current;
  }, []);

  const retrySave = () => {
    if (saveStatus.toLowerCase().includes("changed on another device")) {
      if (!window.confirm("Another device has newer shop data. Reload the latest version? Unsaved changes on this device will be discarded.")) return;
      void refresh().then(() => window.location.reload()).catch((cause) => setSaveStatus(cause instanceof Error ? cause.message : "Could not reload the latest shop data."));
      return;
    }
    if (latest.current) void commit(latest.current).catch(() => undefined);
  };

  const importSnapshot = async (snapshot: Snapshot) => {
    try { await commit(snapshot); if (shop) saveLocalImportChoice(shop.shopId, "imported"); setLocalSnapshot(null); }
    catch { /* The visible save message gives the user a retry path. */ }
  };

  const startFresh = () => {
    if (shop) saveLocalImportChoice(shop.shopId, "fresh");
    setLocalSnapshot(null);
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading your shop…</div>;
  if (error) return <main className="flex min-h-screen items-center justify-center p-5"><section className="max-w-lg rounded-2xl border border-border bg-card p-6"><h1 className="text-xl font-bold">Could not open BUYME</h1><p className="mt-2 text-sm text-muted-foreground">{error}</p><div className="mt-5 flex gap-3"><button className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground" onClick={() => window.location.reload()}>Try again</button><button className="rounded-xl border border-border px-4 py-2 text-sm font-bold" onClick={() => void signOut({ redirectUrl: basePath || "/" })}>Sign out</button></div></section></main>;
  if (!shop) return null;
  if (shop.isCompanyAdmin) return <CompanyAdminPanel email={shop.email} onSignOut={() => void signOut({ redirectUrl: basePath || "/" })} />;
  if (localSnapshot) return <main className="flex min-h-[100dvh] items-center justify-center bg-background p-5"><section className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-xl sm:p-8"><p className="text-xs font-bold uppercase tracking-widest text-primary">Shop data on this device</p><h1 className="mt-3 text-2xl font-extrabold">Import your existing shop?</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">This browser has a catalog, sales or settings saved locally. Import them into <strong>{shop.email}</strong>’s new shop, or start with an empty shop. Nothing is moved unless you choose import.</p><div className="mt-6 flex flex-wrap gap-3"><button onClick={() => void importSnapshot(localSnapshot)} className="rounded-xl bg-primary px-4 py-3 text-sm font-extrabold text-primary-foreground">Import this shop</button><button onClick={startFresh} className="rounded-xl border border-border px-4 py-3 text-sm font-bold">Start fresh</button></div>{saveStatus && <p className="mt-4 text-xs text-muted-foreground">{saveStatus}</p>}</section></main>;

  return <SellerContext.Provider value={{ shop, save: commit, saveStatus, retrySave, refresh }}>
    {children}
  </SellerContext.Provider>;
}

function CompanyAdminPanel({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const [sellers, setSellers] = useState<{ id: string; name: string; premiumApproved: boolean; members: { email: string; role: string }[] }[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/shop/sellers", { credentials: "include" });
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || "Could not load seller accounts.");
    const body = await response.json() as { sellers: typeof sellers };
    setSellers(body.sellers);
  }, []);
  useEffect(() => { load().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load sellers.")); }, [load]);
  const setPremium = async (id: string, premiumApproved: boolean) => {
    setBusy(id); setError("");
    try {
      const response = await fetch(`/api/shop/sellers/${encodeURIComponent(id)}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ premiumApproved }) });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || "Could not update access.");
      setSellers((items) => items.map((item) => item.id === id ? { ...item, premiumApproved } : item));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update access."); }
    finally { setBusy(""); }
  };
  return <main className="min-h-[100dvh] bg-background px-5 py-8 sm:px-10"><div className="mx-auto max-w-5xl">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5"><div><p className="text-xs font-bold uppercase tracking-widest text-primary">BUYME company</p><h1 className="mt-2 text-3xl font-extrabold">Seller access</h1><p className="mt-1 text-sm text-muted-foreground">Signed in as {email}</p></div><button onClick={onSignOut} className="rounded-xl border border-border px-4 py-2 text-sm font-bold">Sign out</button></header>
    <section className="mt-7 rounded-2xl border border-border bg-card p-5 sm:p-7"><div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-extrabold">Shops and plans</h2><p className="mt-1 text-sm text-muted-foreground">New shops start on Basic. Approving Premium enables the Full version for everyone in that shop.</p></div><button onClick={() => load().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not refresh."))} className="rounded-xl border border-border px-3 py-2 text-xs font-bold">Refresh</button></div>
      {error && <p role="alert" className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {sellers.length ? <div className="mt-5 divide-y divide-border">{sellers.map((seller) => <article key={seller.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div><h3 className="font-bold">{seller.name}</h3><p className="mt-1 text-xs text-muted-foreground">{seller.members.map((member) => `${member.email} (${member.role})`).join(" · ") || "No members"}</p></div><button disabled={busy === seller.id} onClick={() => void setPremium(seller.id, !seller.premiumApproved)} className={`rounded-xl px-4 py-2.5 text-xs font-extrabold ${seller.premiumApproved ? "border border-border" : "bg-primary text-primary-foreground"}`}>{busy === seller.id ? "Saving…" : seller.premiumApproved ? "Premium · switch to Basic" : "Approve Premium"}</button></article>)}</div> : !error ? <p className="mt-6 rounded-xl bg-muted/40 p-5 text-sm text-muted-foreground">No seller shops yet. They will appear here after a seller creates an account.</p> : null}
    </section>
  </div></main>;
}