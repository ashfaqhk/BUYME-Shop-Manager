import type { IncomingHttpHeaders } from "node:http";
import type { RequestHandler } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const FAPI = "https://frontend-api.clerk.dev";
export const CLERK_PROXY_PATH = "/api/__clerk";

export function getClerkProxyHost(req: { headers: IncomingHttpHeaders }): string | undefined {
  const raw = req.headers["x-forwarded-host"];
  const forwarded = Array.isArray(raw) ? raw[0] : raw;
  return forwarded?.split(",")[0]?.trim() || req.headers.host?.trim();
}

export function clerkProxyMiddleware(): RequestHandler {
  if (process.env.NODE_ENV !== "production" || !process.env.CLERK_SECRET_KEY) {
    return (_req, _res, next) => next();
  }
  return createProxyMiddleware({
    target: FAPI,
    changeOrigin: true,
    pathRewrite: (path) => path.replace(new RegExp(`^${CLERK_PROXY_PATH}`), ""),
    on: {
      proxyReq(proxyReq, req) {
        const host = getClerkProxyHost(req) ?? "";
        proxyReq.setHeader("Clerk-Proxy-Url", `${req.headers["x-forwarded-proto"] || "https"}://${host}${CLERK_PROXY_PATH}`);
        proxyReq.setHeader("Clerk-Secret-Key", process.env.CLERK_SECRET_KEY!);
        const forwardedFor = req.headers["x-forwarded-for"];
        const clientIp = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor)?.split(",")[0]?.trim();
        if (clientIp) proxyReq.setHeader("X-Forwarded-For", clientIp);
      },
    },
  }) as RequestHandler;
}