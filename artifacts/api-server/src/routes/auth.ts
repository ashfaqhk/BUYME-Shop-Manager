import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { accessToken, accountChoices, authIdentity, AuthServiceError, clearAuthCookies, sessionInfo,
  setAccountCookie, setAuthCookies, supabaseAuthRequest, tokenResponse, verifiedIdentity } from "../lib/supabaseAuth";

const router: IRouter = Router();
const credentials = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(1024),
  preferredAccountId: z.string().max(200).optional(),
  preferredShopId: z.string().max(200).optional(),
});
const preferredAccountId = (req: Request) => typeof req.query.preferredAccountId === "string" ? req.query.preferredAccountId : undefined;
const preferredShopId = (req: Request) => typeof req.query.preferredShopId === "string" ? req.query.preferredShopId : undefined;
export function sameOriginWrites(req: Request, res: Response, next: () => void) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) { next(); return; }
  const origin = req.get("origin");
  const host = (req.get("x-forwarded-host") ?? req.get("host") ?? "").split(",")[0]?.trim();
  let valid = !origin;
  try { if (origin) valid = new URL(origin).host === host; } catch { valid = false; }
  if (!valid || req.get("sec-fetch-site") === "cross-site") { res.status(403).json({ error: "Use BUYME directly to make this request." }); return; }
  next();
}
function redirectUrl(req: Request, path: string) {
  const protocol = req.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https" || req.secure ? "https" : "http";
  const host = (req.get("x-forwarded-host") ?? req.get("host") ?? "").split(",")[0]?.trim();
  return `${protocol}://${host}${path}`;
}
router.use("/auth", (_req, res, next) => { res.setHeader("Cache-Control", "private, no-store"); next(); });
router.get("/auth/session", async (req, res) => {
  const identity = await authIdentity(req, res);
  res.json(identity ? await sessionInfo(req, res, identity, preferredAccountId(req), preferredShopId(req)) :
    { authenticated: false, userId: null, accounts: [] });
});
router.post("/auth/sign-in", async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Enter a valid email and password." }); return; }
  const tokens = tokenResponse(await supabaseAuthRequest("token?grant_type=password", { email: parsed.data.email, password: parsed.data.password }));
  const identity = verifiedIdentity(await supabaseAuthRequest("user", undefined, tokens.access_token));
  if (!identity) { res.status(403).json({ error: "Verify your email before signing in." }); return; }
  setAuthCookies(req, res, tokens);
  res.json(await sessionInfo(req, res, identity, parsed.data.preferredAccountId, parsed.data.preferredShopId));
});
router.post("/auth/sign-up", async (req, res) => {
  const parsed = credentials.extend({ password: z.string().min(8).max(1024) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Enter a valid email and password of at least 8 characters." }); return; }
  await supabaseAuthRequest(`signup?redirect_to=${encodeURIComponent(redirectUrl(req, "/sign-in"))}`,
    { email: parsed.data.email, password: parsed.data.password });
  res.json({ message: "Check your email to verify your account, then return to BUYME and sign in. If you already have a Supabase account, sign in or reset its password.", needsVerification: true });
});
router.post("/auth/reset-request", async (req, res) => {
  const parsed = z.object({ email: z.string().trim().email().max(320) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Enter a valid email." }); return; }
  await supabaseAuthRequest(`recover?redirect_to=${encodeURIComponent(redirectUrl(req, "/reset-password"))}`, { email: parsed.data.email });
  res.json({ message: "If that email has an account, a password-reset link has been sent. Open the link to choose a new password." });
});
router.post("/auth/token", async (req, res) => {
  const parsed = z.object({ accessToken: z.string().min(1).max(6000), refreshToken: z.string().min(1).max(1024), preferredAccountId: z.string().max(200).optional(), preferredShopId: z.string().max(200).optional() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "This email link is invalid. Request a new one." }); return; }
  const identity = verifiedIdentity(await supabaseAuthRequest("user", undefined, parsed.data.accessToken));
  if (!identity) { res.status(403).json({ error: "Verify your email before continuing." }); return; }
  const tokens = tokenResponse(await supabaseAuthRequest("token?grant_type=refresh_token", { refresh_token: parsed.data.refreshToken }));
  const refreshed = verifiedIdentity(await supabaseAuthRequest("user", undefined, tokens.access_token));
  if (!refreshed || refreshed.id !== identity.id) { res.status(403).json({ error: "This email link is invalid. Request a new one." }); return; }
  setAuthCookies(req, res, tokens);
  res.json(await sessionInfo(req, res, identity, parsed.data.preferredAccountId, parsed.data.preferredShopId));
});
router.post("/auth/password", async (req, res) => {
  const identity = await authIdentity(req, res);
  if (!identity) { res.status(401).json({ error: "Open a fresh password-reset link before continuing." }); return; }
  const parsed = z.object({ password: z.string().min(8).max(1024) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Use a password of at least 8 characters." }); return; }
  await supabaseAuthRequest("user", { password: parsed.data.password }, accessToken(req), "PUT");
  res.json({ message: "Your password is updated. You can now open your shop." });
});
router.post("/auth/select-account", async (req, res) => {
  const identity = await authIdentity(req, res);
  if (!identity) { res.status(401).json({ error: "Sign in before choosing a shop." }); return; }
  const parsed = z.object({ userId: z.string().min(1).max(200) }).safeParse(req.body);
  const choices = await accountChoices(identity);
  if (!parsed.success || !choices.some((choice) => choice.userId === parsed.data.userId)) { res.status(403).json({ error: "This shop account is not assigned to your verified email." }); return; }
  setAccountCookie(req, res, parsed.data.userId);
  res.json(await sessionInfo(req, res, identity, parsed.data.userId));
});
router.post("/auth/sign-out", async (req, res) => {
  const token = accessToken(req);
  clearAuthCookies(req, res);
  if (token) { try { await supabaseAuthRequest("logout?scope=local", {}, token); } catch { /* Local cookies are cleared even during a provider outage. */ } }
  res.json({ message: "Signed out. Saved device data is retained." });
});
export function authErrors(error: unknown, _req: Request, res: Response, next: (error: unknown) => void) {
  if (error instanceof AuthServiceError) { res.status(error.status).json({ error: error.message }); return; }
  next(error);
}
export default router;
