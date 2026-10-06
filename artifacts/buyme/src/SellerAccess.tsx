import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import CompanyAdminPanel from "./CompanyAdminPanel";
import type { ShopState, Snapshot } from "./shop-types";
import { activeOfflineUser, useOnline, useShopSync } from "./use-shop-sync";
import { clearOfflineUser } from "./offline-store";
export { uploadSellerPhoto } from "./shop-photos";
export type { ShopState } from "./shop-types";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const publishableKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
if (!publishableKey) throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY.");

type SellerContextValue = {
  shop: ShopState;
  save: (snapshot: Snapshot) => Promise<void>;
  updateSnapshot: (update: Snapshot | ((previous: Snapshot) => Snapshot)) => Promise<void>;
  saveStatus: string;
  retrySave: () => void;
  refresh: () => Promise<ShopState>;
  requestFull: () => Promise<void>;
  signOut: () => Promise<void>;
};
const SellerContext = createContext<SellerContextValue | null>(null);
export function useSellerShop() {
  const value = useContext(SellerContext);
  if (!value) throw new Error("Seller shop context is unavailable.");
  return value;
}

export function AccountBar({ email, role, mode, saveStatus, onRetry }: { email: string; role: string; mode: string; saveStatus: string; onRetry: () => void }) {
  const { signOut } = useSellerShop();
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
    {saveStatus && <span role="status" title={saveStatus} className={`max-w-36 text-[10px] sm:max-w-64 ${unsaved ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>{saveStatus}</span>}
    {unsaved && <button type="button" onClick={onRetry} className="text-[10px] font-bold text-primary underline">Sync now</button>}
    <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-left text-xs font-bold">
      <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary">{email.slice(0, 1).toUpperCase()}</span>
      <span className="max-w-36 truncate">{email}</span>
    </button>
    {open && <section className="absolute right-0 top-full z-50 mt-2 w-[min(92vw,360px)] rounded-2xl border border-border bg-card p-4 text-foreground shadow-xl">
      <h3 className="font-extrabold">Shop account</h3><p className="mt-1 text-xs text-muted-foreground">{role === "owner" ? "Shop owner" : "Team member"} · {mode === "full" ? "Premium access" : "Basic access"}</p>
      {role === "owner" && <><form onSubmit={invite} className="mt-4 flex gap-2"><input type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} className="field min-w-0 flex-1" placeholder="Team member email" /><button disabled={busy} className="rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground">{busy ? "Sending…" : "Invite"}</button></form><h4 className="mt-4 text-xs font-bold">Shop team</h4><div className="mt-2 space-y-1">{team.map((member) => <p key={`${member.email}-${member.role}`} className="flex justify-between text-xs"><span>{member.email}</span><span className="text-muted-foreground">{member.role}</span></p>)}</div></>}
      {message && <p role="status" className="mt-3 text-xs text-muted-foreground">{message}</p>}
      <button type="button" onClick={() => void signOut().catch((cause) => setMessage(cause instanceof Error ? cause.message : "Could not sign out."))} className="mt-4 w-full rounded-lg border border-border px-3 py-2 text-xs font-bold">Sign out</button>
    </section>}
  </div>;
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
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { signOut } = useClerk();
  const online = useOnline();
  const path = window.location.pathname.slice(basePath.length) || "/";
  const atSignIn = path.startsWith("/sign-in");
  const atSignUp = path.startsWith("/sign-up");
  const cachedUser = !online ? activeOfflineUser() : null;
  if (!atSignIn && !atSignUp && cachedUser && (!isLoaded || !isSignedIn)) {
    return <AccountGate key={cachedUser} userId={cachedUser} authenticated={false} onSignOut={() => signOut({ redirectUrl: basePath || "/" })}>{children}</AccountGate>;
  }
  if (!isLoaded) return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">{online ? "Loading BUYME…" : "Connect once and sign in to use BUYME on this device."}</div>;
  if (atSignIn) return <AuthFrame><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></AuthFrame>;
  if (atSignUp) return <AuthFrame><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></AuthFrame>;
  return isSignedIn && userId ? <AccountGate key={userId} userId={userId} authenticated onSignOut={() => signOut({ redirectUrl: basePath || "/" })}>{children}</AccountGate> : <WelcomePage />;
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
  const online = useOnline();
  const [bootedOffline] = useState(() => !navigator.onLine);
  const cachedUser = bootedOffline && !online ? activeOfflineUser() : null;
  // Cold offline startup must not depend on downloading Clerk's JavaScript.
  // This is only the last signed-in device copy; it cannot make authenticated
  // API requests. Reconnecting returns to Clerk before attempting a cloud sync.
  if (cachedUser && !window.location.pathname.includes("/sign-")) {
    return <AccountGate key={cachedUser} userId={cachedUser} authenticated={false} onSignOut={async () => {
      clearOfflineUser(); window.location.assign(`${basePath}/sign-in`);
    }}>{children}</AccountGate>;
  }
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

function AccountGate({ children, userId, authenticated, onSignOut }: { children: ReactNode; userId: string; authenticated: boolean; onSignOut: () => Promise<void> }) {
  const sync = useShopSync(userId, authenticated);
  const { shop, loading, error, saveStatus, save: commit, updateSnapshot, retrySave, refresh, requestFull } = sync;
  const [localSnapshot, setLocalSnapshot] = useState<Snapshot | null>(null);
  useEffect(() => {
    if (shop && !shop.isCompanyAdmin && shop.role === "owner" && shop.isNew && !hasLocalImportChoice(shop.shopId)) setLocalSnapshot(savedLocalSnapshot());
  }, [shop?.shopId, shop?.isNew, shop?.role, shop?.isCompanyAdmin]);
  const signOut = async () => {
    await sync.flushDevice();
    if (saveStatus !== "All changes saved" && shop && !shop.isCompanyAdmin &&
      !window.confirm("Changes waiting to sync will stay on this device for this account. Sign back in to sync them. Sign out now?")) return;
    clearOfflineUser();
    await onSignOut();
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
   if (error && !shop) return <main className="flex min-h-screen items-center justify-center p-5"><section className="max-w-lg rounded-2xl border border-border bg-card p-6"><h1 className="text-xl font-bold">Could not open BUYME</h1><p className="mt-2 text-sm text-muted-foreground">{error}</p><div className="mt-5 flex gap-3"><button className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground" onClick={() => window.location.reload()}>Try again</button><button className="rounded-xl border border-border px-4 py-2 text-sm font-bold" onClick={() => void signOut()}>Sign out</button></div></section></main>;
  if (!shop) return null;
  if (shop.isCompanyAdmin) return <CompanyAdminPanel email={shop.email} onSignOut={() => void signOut()} />;
  if (!shop.accessEnabled) return <main className="flex min-h-[100dvh] items-center justify-center p-5"><section className="max-w-lg rounded-2xl border border-border bg-card p-6"><h1 className="text-xl font-extrabold">Shop access is paused</h1><p className="mt-3 text-sm text-muted-foreground">Contact the BUYME company administrator with {shop.email}. Your shop and any device changes have not been deleted.</p><div className="mt-5 flex gap-3"><button onClick={retrySave} className="rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground">Check access</button><button onClick={() => void signOut()} className="rounded-xl border border-border px-4 py-2 font-bold">Sign out</button></div></section></main>;
  if (localSnapshot) return <main className="flex min-h-[100dvh] items-center justify-center bg-background p-5"><section className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-xl sm:p-8"><p className="text-xs font-bold uppercase tracking-widest text-primary">Shop data on this device</p><h1 className="mt-3 text-2xl font-extrabold">Import your existing shop?</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">This browser has a catalog, sales or settings saved locally. Import them into <strong>{shop.email}</strong>’s new shop, or start with an empty shop. Nothing is moved unless you choose import.</p><div className="mt-6 flex flex-wrap gap-3"><button onClick={() => void importSnapshot(localSnapshot)} className="rounded-xl bg-primary px-4 py-3 text-sm font-extrabold text-primary-foreground">Import this shop</button><button onClick={startFresh} className="rounded-xl border border-border px-4 py-3 text-sm font-bold">Start fresh</button></div>{saveStatus && <p className="mt-4 text-xs text-muted-foreground">{saveStatus}</p>}</section></main>;

  return <SellerContext.Provider value={{ shop, save: commit, updateSnapshot, saveStatus, retrySave, refresh, requestFull, signOut }}>
    {sync.conflicts.length > 0 && <section role="alert" className="sticky top-0 z-50 border-b border-amber-300 bg-amber-50 p-4 text-amber-950"><div className="mx-auto max-w-5xl"><h2 className="font-extrabold">Changes need your choice</h2><p className="mt-1 text-sm">{sync.conflicts.length} field(s) changed differently on this device and in the cloud. Independent edits will be kept. A backup of this device copy is kept before applying your choice.</p><details className="mt-2 text-xs"><summary>Conflicting fields</summary><ul>{sync.conflicts.map((path) => <li key={path}>{path}</li>)}</ul></details><div className="mt-3 flex flex-wrap gap-2"><button disabled={sync.resolving} onClick={() => void sync.resolveConflict("device")} className="rounded-lg border border-amber-400 px-3 py-2 text-sm font-bold">Use device values for conflicts</button><button disabled={sync.resolving} onClick={() => void sync.resolveConflict("cloud")} className="rounded-lg border border-amber-400 px-3 py-2 text-sm font-bold">Use cloud values for conflicts</button></div></div></section>}
    {children}
  </SellerContext.Provider>;
}