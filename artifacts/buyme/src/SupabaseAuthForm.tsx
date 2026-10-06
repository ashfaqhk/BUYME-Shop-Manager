import { useState, type FormEvent } from "react";

export type AuthFormMode = "sign-in" | "sign-up" | "forgot" | "reset";

type Props = {
  mode: AuthFormMode;
  busy: boolean;
  error: string;
  message: string;
  online: boolean;
  onSubmit: (values: { email: string; password: string }) => Promise<void>;
  onModeChange: (mode: AuthFormMode) => void;
};

const COPY: Record<AuthFormMode, { title: string; sub: string; cta: string; busy: string }> = {
  "sign-in": { title: "Welcome back", sub: "Sign in to your shop counter.", cta: "Sign in", busy: "Signing in…" },
  "sign-up": { title: "Create your shop account", sub: "Use your email and a password of at least 8 characters. We will send a link to verify your email.", cta: "Create account", busy: "Creating account…" },
  forgot: { title: "Reset your password", sub: "Enter your account email and we will send a reset link.", cta: "Send reset link", busy: "Sending…" },
  reset: { title: "Choose a new password", sub: "Use at least 8 characters.", cta: "Save new password", busy: "Saving…" },
};

const linkCls = "font-bold text-primary underline underline-offset-2";

export default function SupabaseAuthForm({ mode, busy, error, message, online, onSubmit, onModeChange }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [local, setLocal] = useState("");
  const copy = COPY[mode];
  const needsEmail = mode !== "reset";
  const needsPassword = mode !== "forgot";
  const needsConfirm = mode === "sign-up" || mode === "reset";
  const shownError = local || error;
  const disabled = busy || !online;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (disabled) return;
    setLocal("");
    const cleanEmail = email.trim();
    if (needsEmail && !/^\S+@\S+\.\S+$/.test(cleanEmail)) return setLocal("Enter a valid email address.");
    if (needsPassword && mode !== "sign-in" && password.length < 8) return setLocal("Password must be at least 8 characters.");
    if (needsConfirm && password !== confirm) return setLocal("Passwords do not match.");
    try { await onSubmit({ email: cleanEmail, password: needsPassword ? password : "" }); }
    catch { /* The owner of this form reports failures through the error prop. */ }
  };

  const change = (next: AuthFormMode) => { setLocal(""); setPassword(""); setConfirm(""); onModeChange(next); };

  return <main className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8">
    <section className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-xl sm:p-9" aria-busy={busy}>
      <img src={`${import.meta.env.BASE_URL}buyme-icon.svg`} alt="BUYME" className="mb-4 h-12 w-12" />
      <p className="text-xs font-bold uppercase tracking-[.2em] text-primary">BUYME · Shop counter</p>
      <h1 className="mt-3 font-display text-3xl font-extrabold text-primary">{copy.title}</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.sub}</p>

      {(mode === "sign-up" || mode === "sign-in") && <div className="mt-4 rounded-xl bg-muted p-3 text-xs leading-5 text-muted-foreground">
        {mode === "sign-up"
          ? <><strong className="text-foreground">Already used BUYME?</strong> Existing users must create a Supabase password using the SAME email to reconnect their saved shop data. New users start in Basic; Premium requires company approval.</>
          : <><strong className="text-foreground">Moving from the old login?</strong> Existing users must create a Supabase password using the SAME email to reconnect saved shop data.</>}
      </div>}

      {!online && <p role="status" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-950">You are offline. Connect to the internet to continue.</p>}

      <form onSubmit={submit} noValidate className="mt-5 space-y-4">
        {needsEmail && <label className="block text-xs font-bold">Email
          <input data-testid="auth-email" className="field mt-1.5" type="email" name="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourshop.com" />
        </label>}
        {needsPassword && <label className="block text-xs font-bold">{mode === "reset" ? "New password" : "Password"}
          <input data-testid="auth-password" className="field mt-1.5" type="password" name="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} minLength={mode === "sign-in" ? undefined : 8} required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>}
        {needsConfirm && <label className="block text-xs font-bold">Confirm password
          <input data-testid="auth-confirm-password" className="field mt-1.5" type="password" name="confirm-password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>}

        {shownError && <p data-testid="auth-error" role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-semibold text-destructive">{shownError}</p>}
        {message && <p data-testid="auth-message" role="status" aria-live="polite" className="rounded-xl border border-primary/20 bg-primary/10 p-3 text-xs font-semibold text-primary">{message}</p>}

        <button data-testid="auth-submit" type="submit" disabled={disabled} className="w-full rounded-xl bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">{busy ? copy.busy : copy.cta}</button>
      </form>

      <div className="mt-5 space-y-2 text-center text-xs text-muted-foreground">
        {mode === "sign-in" && <>
          <p><button type="button" className={linkCls} onClick={() => change("forgot")}>Forgot password?</button></p>
          <p>New to BUYME? <button type="button" className={linkCls} onClick={() => change("sign-up")}>Create account</button></p>
        </>}
        {mode === "sign-up" && <p>Already have an account? <button type="button" className={linkCls} onClick={() => change("sign-in")}>Return to sign in</button></p>}
        {(mode === "forgot" || mode === "reset") && <p><button type="button" className={linkCls} onClick={() => change("sign-in")}>Return to sign in</button></p>}
      </div>
    </section>
  </main>;
}
