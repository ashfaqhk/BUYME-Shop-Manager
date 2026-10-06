import type { Request, Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, buymeMembershipsTable, buymeShopsTable } from "@workspace/db";

const ACCESS = "buyme_access";
const REFRESH = "buyme_refresh";
const ACCOUNT = "buyme_account";
const SHOP = "buyme_shop";
type Tokens = { access_token: string; refresh_token: string; expires_in?: number };
export type AuthIdentity = { id: string; email: string };
export type AccountChoice = { userId: string; shopName: string };
export type AuthSessionInfo = {
  authenticated: boolean; userId: string | null; email?: string; accounts: AccountChoice[];
};
export class AuthServiceError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function configuration() {
  try {
    const url = new URL(process.env.SUPABASE_URL ?? "");
    const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
    let anon = false;
    if (key.startsWith("eyJ")) {
      anon = JSON.parse(Buffer.from(key.split(".")[1] ?? "", "base64url").toString()).role === "anon";
    }
    if (url.protocol !== "https:" || url.pathname !== "/" || url.username || url.password ||
      (!key.startsWith("sb_publishable_") && !anon)) throw new Error();
    return { url, key };
  } catch { throw new AuthServiceError(503, "Supabase sign-in configuration is unavailable. Contact the company administrator."); }
}

export async function supabaseAuthRequest(path: string, body?: unknown, token?: string, method = body ? "POST" : "GET") {
  const { url, key } = configuration();
  let response: globalThis.Response;
  try {
    response = await fetch(new URL(`/auth/v1/${path}`, url), {
      method, headers: { apikey: key, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(12000),
    });
  } catch { throw new AuthServiceError(503, "Supabase sign-in is temporarily unreachable. Your saved shop data is unchanged."); }
  const raw: unknown = await response.json().catch(() => ({}));
  const data = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  if (!response.ok) {
    const code = data.error_code ?? data.code;
    const message = response.status === 429 ? "Too many attempts. Please wait before trying again." :
      code === "email_not_confirmed" ? "Verify your email before signing in." :
      code === "email_address_not_authorized" ? "Supabase email delivery is not configured for this address. The company administrator must configure email delivery." :
      code === "weak_password" ? "Use a stronger password that meets the Supabase password requirements." :
      path.startsWith("token?grant_type=password") ? "Email or password is incorrect, or the email has not been verified." :
      response.status >= 500 ? "Supabase could not complete this request. Please try again later." :
      "Supabase could not complete this request. Check your details and try again.";
    throw new AuthServiceError(response.status >= 500 ? 503 : response.status === 429 ? 429 : 400, message);
  }
  return data;
}

// Only call with the trusted response from this project's /auth/v1/user.
// Editable user_metadata, email claims supplied by the browser and decoded
// (unverified) JWT payloads are never sources of application authority.
export function verifiedIdentity(input: unknown): AuthIdentity | null {
  if (!input || typeof input !== "object") return null;
  const user = input as Record<string, unknown>;
  if (typeof user.id !== "string" || typeof user.email !== "string" || !user.email.includes("@") ||
    typeof user.email_confirmed_at !== "string" || !user.email_confirmed_at) return null;
  return { id: user.id, email: user.email.trim().toLowerCase() };
}
export function tokenResponse(data: Record<string, unknown>): Tokens {
  if (typeof data.access_token !== "string" || typeof data.refresh_token !== "string") {
    throw new AuthServiceError(502, "Supabase returned an invalid session.");
  }
  return { access_token: data.access_token, refresh_token: data.refresh_token,
    ...(typeof data.expires_in === "number" ? { expires_in: data.expires_in } : {}) };
}
function cookieOptions(req: Request) {
  const secure = req.secure || req.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https";
  return {
    httpOnly: true, sameSite: secure ? "none" as const : "lax" as const, path: "/api",
    secure, partitioned: secure,
  };
}
export function clearAuthCookies(req: Request, res: Response) {
  for (const name of [ACCESS, REFRESH, ACCOUNT, SHOP]) res.clearCookie(name, cookieOptions(req));
}
export function setAccountCookie(req: Request, res: Response, userId: string) {
  res.cookie(ACCOUNT, userId, { ...cookieOptions(req), maxAge: 30 * 86400_000 });
}
export function setAuthCookies(req: Request, res: Response, tokens: Tokens) {
  if (typeof tokens.access_token !== "string" || tokens.access_token.length > 6000 ||
    typeof tokens.refresh_token !== "string" || tokens.refresh_token.length > 1024) {
    throw new AuthServiceError(502, "Supabase returned an invalid session.");
  }
  res.cookie(ACCESS, tokens.access_token, { ...cookieOptions(req), maxAge: Math.max(60, tokens.expires_in ?? 3600) * 1000 });
  res.cookie(REFRESH, tokens.refresh_token, { ...cookieOptions(req), maxAge: 30 * 86400_000 });
}

const refreshing = new Map<string, Promise<Tokens>>();
async function refreshSession(token: string): Promise<Tokens> {
  // Coalesce simultaneous API/image requests during refresh-token rotation.
  const pending = refreshing.get(token);
  if (pending) return pending;
  const result = supabaseAuthRequest("token?grant_type=refresh_token", { refresh_token: token }).then(tokenResponse);
  refreshing.set(token, result);
  void result.finally(() => { setTimeout(() => refreshing.delete(token), 10000).unref(); }).catch(() => undefined);
  return result;
}
export async function authIdentity(req: Request, res: Response): Promise<AuthIdentity | null> {
  let access = typeof req.cookies?.[ACCESS] === "string" ? req.cookies[ACCESS] : "";
  const refresh = typeof req.cookies?.[REFRESH] === "string" ? req.cookies[REFRESH] : "";
  if (!access && !refresh) return null;
  if (access) {
    try {
      return verifiedIdentity(await supabaseAuthRequest("user", undefined, access));
    } catch (error) {
      if (!(error instanceof AuthServiceError) || error.status === 503 || error.status === 429) throw error;
    }
  }
  if (!refresh) { clearAuthCookies(req, res); return null; }
  try {
    const tokens = await refreshSession(refresh);
    access = tokens.access_token;
    const identity = verifiedIdentity(await supabaseAuthRequest("user", undefined, access));
    if (!identity) { clearAuthCookies(req, res); return null; }
    setAuthCookies(req, res, tokens);
    // Downstream requests in this response use the freshly rotated tokens.
    req.cookies[ACCESS] = access; req.cookies[REFRESH] = tokens.refresh_token;
    return identity;
  } catch (error) {
    if (error instanceof AuthServiceError && (error.status === 503 || error.status === 429)) throw error;
    clearAuthCookies(req, res); return null;
  }
}
export function accessToken(req: Request): string | undefined { return req.cookies?.[ACCESS]; }

export async function accountChoices(identity: AuthIdentity): Promise<AccountChoice[]> {
  if (identity.email === process.env.BUYME_COMPANY_ADMIN_EMAIL?.trim().toLowerCase()) return [];
  const rows = await db.select({ userId: buymeMembershipsTable.userId, shopName: buymeShopsTable.name })
    .from(buymeMembershipsTable).innerJoin(buymeShopsTable, eq(buymeMembershipsTable.shopId, buymeShopsTable.id))
    .where(sql`lower(${buymeMembershipsTable.email}) = ${identity.email}`)
    .orderBy(buymeMembershipsTable.createdAt);
  return rows.filter((row, index) => rows.findIndex((other) => other.userId === row.userId) === index);
}
export function chooseAccount(identity: AuthIdentity, choices: AccountChoice[], preference?: string): string | null {
  if (!choices.length) return `supabase:${identity.id}`;
  if (preference && choices.some((choice) => choice.userId === preference)) return preference;
  return choices.length === 1 ? choices[0]!.userId : null;
}
export async function sessionInfo(req: Request, res: Response, identity: AuthIdentity, preference?: string, preferredShopId?: string): Promise<AuthSessionInfo> {
  const accounts = await accountChoices(identity);
  const userId = chooseAccount(identity, accounts, preference ?? req.cookies?.[ACCOUNT]);
  if (userId) setAccountCookie(req, res, userId);
  if (userId && preferredShopId && await emailMembership(userId, identity.email, preferredShopId)) {
    res.cookie(SHOP, preferredShopId, { ...cookieOptions(req), maxAge: 30 * 86400_000 });
    req.cookies[SHOP] = preferredShopId;
  }
  return { authenticated: true, userId, email: identity.email, accounts };
}
export async function shopSession(req: Request) {
  const identity = await authIdentity(req, req.res!);
  if (!identity) return null;
  const state = await sessionInfo(req, req.res!, identity);
  if (!state.userId) throw new AuthServiceError(409, "Choose your existing shop account before continuing.");
  const savedShopId = typeof req.cookies?.[SHOP] === "string" ? req.cookies[SHOP] : undefined;
  const assigned = savedShopId ? await emailMembership(state.userId, identity.email, savedShopId) : null;
  return { userId: state.userId, email: identity.email, shopId: assigned?.shop.id };
}

export async function emailMembership(userId: string, email: string, shopId?: string) {
  const [row] = await db.select({ shop: buymeShopsTable, role: buymeMembershipsTable.role, memberEmail: buymeMembershipsTable.email })
    .from(buymeMembershipsTable).innerJoin(buymeShopsTable, eq(buymeMembershipsTable.shopId, buymeShopsTable.id))
    .where(and(eq(buymeMembershipsTable.userId, userId), sql`lower(${buymeMembershipsTable.email}) = ${email}`,
      ...(shopId ? [eq(buymeMembershipsTable.shopId, shopId)] : []))).limit(1);
  return row;
}
