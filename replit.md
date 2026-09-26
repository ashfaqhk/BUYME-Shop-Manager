# BUYME

BUYME is a local-first shop counter workspace for fast billing, inventory tracking, payment collection, customer outreach, and sales insights.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/buyme/src/App.tsx` — main BUYME application shell, local data model, billing flow, catalog CRUD, insights, notifications, broadcasts, settings, and receipt actions.
- `artifacts/buyme/src/index.css` — BUYME visual system, responsive layout, typography, surfaces, and motion.
- `attached_assets/buyme_1790444901078.html` — original standalone prototype used as the feature reference.

## Architecture decisions

- The first build is frontend-only and local-first; shop data is persisted in browser localStorage so a shopkeeper can use the counter without account setup or a network connection.
- The app keeps the original prototype's product surface but presents it as a responsive counter workspace with desktop navigation and a compact mobile navigation.
- Payments and receipts are intentionally explicit user actions: cash/UPI, full/partial payment, receipt preview/print/download, and WhatsApp handoff are never auto-sent.

## Product

- Billing: search products, select variants and quantities, manage the current bill, record cash or UPI payments, and produce a receipt.
- Catalog: add, edit, and remove products with variants, units, prices, stock, and low-stock thresholds.
- Insights: review revenue, bill count, payment mix, top sellers, and stock alerts by time range.
- Notifications and outreach: review low-stock/trending alerts, save customers, and open WhatsApp messages with prefilled offers.
- Settings: configure shop identity, theme, UPI/payment profiles, and GST details.

## User preferences

No standing preferences recorded.

## Gotchas

- BUYME data is stored only in the current browser profile until a server-backed account flow is added.
- WhatsApp and receipt download actions hand off to the browser or external app; the app does not send messages automatically.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
