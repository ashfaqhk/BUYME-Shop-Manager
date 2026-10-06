import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import SupabaseAuthForm, { type AuthFormMode } from "./SupabaseAuthForm";
import { activeOfflineUser, clearOfflineUser, loadDeviceShop } from "./offline-store";
import { useOnline } from "./use-shop-sync";

type SessionInfo = { authenticated: boolean; userId: string | null; email?: string; accounts: { userId: string; shopName: string }[] };
const base = import.meta.env.BASE_URL.replace(/\/$/, "");
const SIGNED_OUT = "buyme-supabase-signed-out";
class RequestError extends Error { constructor(public status: number, message: string) { super(message); } }
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${base}/api/auth/${path}`, {
    method: body ? "POST" : "GET", credentials: "include", cache: "no-store",
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new RequestError(response.status, data?.error || "Could not reach BUYME sign-in. Please try again.");
  return data as T;
}
function markedSignedOut() { try { return localStorage.getItem(SIGNED_OUT) === "1"; } catch { return false; } }
function markSignedOut(value: boolean) { try { if (value) localStorage.setItem(SIGNED_OUT, "1"); else localStorage.removeItem(SIGNED_OUT); } catch { /* State still changes in this tab. */ } }
const anonymous: SessionInfo = { authenticated: false, userId: null, accounts: [] };
async function devicePreference() {
  const preferredAccountId = activeOfflineUser() ?? undefined;
  const cached = preferredAccountId ? await loadDeviceShop(preferredAccountId).catch(() => null) : null;
  return { preferredAccountId, preferredShopId: cached?.server.shopId ?? undefined };
}
type TokenLink = { accessToken: string; refreshToken: string; recovery: boolean };
function consumeEmailLink(): TokenLink | null {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = hash.get("access_token"), refreshToken = hash.get("refresh_token");
  if (!accessToken || !refreshToken) return null;
  // Strip credentials before rendering UI or loading any third-party assets.
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  return { accessToken, refreshToken, recovery: hash.get("type") === "recovery" };
}
export default function SupabaseAccess({ children }: {
  children: (access: { userId: string; authenticated: boolean; signOut: () => Promise<void> }) => ReactNode;
}) {
  const online = useOnline();
  const [link, setLink] = useState(consumeEmailLink);
  const linkRef = useRef(link);
  const initialPath = window.location.pathname.slice(base.length);
  const [mode, setMode] = useState<AuthFormMode>(() => initialPath.startsWith("/reset-password") || link?.recovery ? "reset" :
    initialPath.startsWith("/sign-up") ? "sign-up" : "sign-in");
  const [session, setSession] = useState<SessionInfo>(anonymous);
  const [loading, setLoading] = useState(online);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [unreachable, setUnreachable] = useState(false);
  const pendingBoot = useRef<Promise<SessionInfo> | null>(null);
  const modeRef = useRef(mode); modeRef.current = mode;

  const adopt = useCallback((next: SessionInfo) => {
    setSession(next); setUnreachable(false);
    if (next.authenticated && next.userId && modeRef.current !== "reset") window.history.replaceState(null, "", `${base}/`);
  }, []);
  useEffect(() => {
    let alive = true;
    const boot = async () => {
      if (!online) { setLoading(false); return; }
      try {
        if (!pendingBoot.current) {
          pendingBoot.current = (async () => {
            if (markedSignedOut()) { await request("sign-out", {}); markSignedOut(false); return anonymous; }
            const preference = await devicePreference();
            if (linkRef.current) {
              return request<SessionInfo>("token", { ...linkRef.current, ...preference });
            }
            const query = new URLSearchParams();
            if (preference.preferredAccountId) query.set("preferredAccountId", preference.preferredAccountId);
            if (preference.preferredShopId) query.set("preferredShopId", preference.preferredShopId);
            return request<SessionInfo>(`session?${query}`);
          })();
        }
        const result = await pendingBoot.current;
        if (alive) {
          adopt(result); setError(""); setLoading(false);
          if (linkRef.current) { linkRef.current = null; setLink(null); }
        }
      } catch (cause) {
        if (!alive) return;
        const networkFailure = !(cause instanceof RequestError) || cause.status === 503;
        setUnreachable(networkFailure);
        setError(cause instanceof Error ? cause.message : "Sign-in is unavailable.");
        setLoading(false);
        // Invalid/expired links must not get resubmitted on each heartbeat.
        if (!networkFailure) { linkRef.current = null; setLink(null); }
      } finally { pendingBoot.current = null; }
    };
    void boot();
    const retry = () => { if (document.visibilityState === "visible") void boot(); };
    const timer = setInterval(retry, 30000);
    window.addEventListener("focus", retry);
    return () => { alive = false; clearInterval(timer); window.removeEventListener("focus", retry); };
  }, [online, adopt]);

  const changeMode = (next: AuthFormMode) => {
    setMode(next); setError(""); setMessage("");
    window.history.replaceState(null, "", `${base}/${next === "sign-up" ? "sign-up" : next === "reset" ? "reset-password" : "sign-in"}`);
  };
  const submit = async (values: { email: string; password: string }) => {
    setBusy(true); setError(""); setMessage("");
    try {
      if (mode === "sign-in") {
        const result = await request<SessionInfo>("sign-in", { ...values, ...await devicePreference() });
        markSignedOut(false); adopt(result);
      } else {
        const result = await request<{ message: string }>(mode === "sign-up" ? "sign-up" : mode === "forgot" ? "reset-request" : "password", values);
        setMessage(result.message);
        if (mode === "reset") {
          setMode("sign-in"); modeRef.current = "sign-in";
          adopt(await request<SessionInfo>("session"));
        }
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not complete sign-in."); }
    finally { setBusy(false); }
  };
  const signOut = async () => {
    clearOfflineUser(); markSignedOut(true);
    setSession(anonymous); setError(""); setMessage(""); setUnreachable(false);
    setMode("sign-in"); window.history.replaceState(null, "", `${base}/sign-in`);
    if (navigator.onLine) {
      try { await request("sign-out", {}); markSignedOut(false); }
      catch { setMessage("Signed out on this device. Reconnect to finish clearing the server session."); }
    }
  };
  const choose = async (userId: string) => {
    setBusy(true); setError("");
    try { adopt(await request<SessionInfo>("select-account", { userId })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not open this shop."); }
    finally { setBusy(false); }
  };
  if (loading && online) return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Checking your BUYME sign-in…</div>;
  const cached = !markedSignedOut() && (!online || unreachable) ? activeOfflineUser() : null;
  if (mode !== "reset" && !link && cached) return children({ userId: cached, authenticated: false, signOut });
  if (session.authenticated && session.userId && mode !== "reset") return children({ userId: session.userId, authenticated: online && !unreachable, signOut });
  if (session.authenticated && !session.userId && mode !== "reset") {
    return <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <section className="w-full max-w-md rounded-3xl border border-border bg-card p-7">
        <h1 className="font-display text-2xl font-extrabold">Choose your existing shop</h1>
        <p className="mt-3 text-sm text-muted-foreground">More than one saved account uses your verified email. Choose the shop you want to open. No existing data will be merged or replaced.</p>
        <div className="mt-5 space-y-3">{session.accounts.map((account) => <button key={account.userId} disabled={busy || !online} onClick={() => void choose(account.userId)} className="w-full rounded-xl border border-border px-4 py-3 text-left font-bold">{account.shopName}</button>)}</div>
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
        <button onClick={() => void signOut()} className="mt-5 text-sm font-bold text-primary">Sign out</button>
      </section>
    </main>;
  }
  return <SupabaseAuthForm mode={mode} busy={busy} error={error} message={message} online={online} onSubmit={submit} onModeChange={changeMode} />;
}
