import { Router, type IRouter } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { z } from "zod";
import { db, buymeImagesTable, buymeMembershipsTable, buymeShopsTable } from "@workspace/db";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const storage = new ObjectStorageService();
const defaultSettings = {
  shopName: "My shop", phone: "", upiId: "", upiName: "", paymentQrs: [],
  gstEnabled: false, gstin: "", gstRate: 5, darkMode: false,
};

async function session(req: Parameters<Parameters<typeof router.get>[1]>[0]) {
  const userId = getAuth(req).userId;
  if (!userId) return null;
  const user = await clerkClient.users.getUser(userId);
  const email = user.emailAddresses.find((entry) => entry.id === user.primaryEmailAddressId);
  if (!email || email.verification?.status !== "verified") return null;
  return { userId, email: email.emailAddress.trim().toLowerCase(), metadata: user.publicMetadata };
}

async function membership(userId: string, shopId?: string) {
  const [row] = await db.select({
    shop: buymeShopsTable,
    role: buymeMembershipsTable.role,
    memberEmail: buymeMembershipsTable.email,
  }).from(buymeMembershipsTable)
    .innerJoin(buymeShopsTable, eq(buymeMembershipsTable.shopId, buymeShopsTable.id))
    .where(shopId
      ? and(eq(buymeMembershipsTable.userId, userId), eq(buymeMembershipsTable.shopId, shopId))
      : eq(buymeMembershipsTable.userId, userId))
    .limit(1);
  return row;
}

async function ensureShop(current: NonNullable<Awaited<ReturnType<typeof session>>>) {
  const invitedShopId = typeof current.metadata.buymeShopId === "string" ? current.metadata.buymeShopId : "";
  if (invitedShopId) {
    const [shop] = await db.select().from(buymeShopsTable).where(eq(buymeShopsTable.id, invitedShopId)).limit(1);
    if (shop) {
      await db.insert(buymeMembershipsTable).values({
        id: randomUUID(), shopId: shop.id, userId: current.userId, email: current.email, role: "staff",
      }).onConflictDoNothing();
      return membership(current.userId, shop.id);
    }
  }
  const existing = await membership(current.userId);
  if (existing) return existing;
  const id = randomUUID();
  const [shop] = await db.insert(buymeShopsTable).values({
    id, name: "My shop", ownerUserId: current.userId, settings: defaultSettings,
  }).returning();
  await db.insert(buymeMembershipsTable).values({
    id: randomUUID(), shopId: id, userId: current.userId, email: current.email, role: "owner",
  });
  return { shop, role: "owner", memberEmail: current.email };
}

function responseFor(shop: typeof buymeShopsTable.$inferSelect, role: string, email: string, isCompanyAdmin = false) {
  return {
    shopId: shop.id, email, role, isCompanyAdmin, shopName: shop.name,
    catalog: shop.catalog, sales: shop.sales, settings: shop.settings,
    premiumApproved: shop.premiumApproved, mode: shop.premiumApproved ? "full" : "basic",
    revision: shop.revision,
    isNew: shop.revision === 1 && Array.isArray(shop.catalog) && shop.catalog.length === 0 && Array.isArray(shop.sales) && shop.sales.length === 0,
  };
}

router.get("/shop", async (req, res): Promise<void> => {
  const current = await session(req);
  if (!current) { res.status(401).json({ error: "Sign in with a verified email to access your shop." }); return; }
  const companyEmail = process.env.BUYME_COMPANY_ADMIN_EMAIL?.trim().toLowerCase();
  if (companyEmail && current.email === companyEmail) {
    res.json({ email: current.email, role: "company-admin", isCompanyAdmin: true, shopId: null, shopName: "BUYME company", catalog: [], sales: [], settings: defaultSettings, premiumApproved: true, mode: "full", revision: 0 });
    return;
  }
  const owned = await ensureShop(current);
  if (!owned) { res.status(403).json({ error: "This account is not assigned to a shop." }); return; }
  res.json(responseFor(owned.shop, owned.role, current.email));
});

router.put("/shop", async (req, res): Promise<void> => {
  const current = await session(req);
  if (!current) { res.status(401).json({ error: "Sign in with a verified email to access your shop." }); return; }
  const parsed = z.object({
    catalog: z.array(z.unknown()).max(5000),
    sales: z.array(z.unknown()).max(100000),
    settings: z.record(z.string(), z.unknown()),
    revision: z.number().int().positive(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Shop data is invalid or too large." }); return; }
  const currentShop = await membership(current.userId);
  if (!currentShop) { res.status(404).json({ error: "No shop is assigned to this account." }); return; }
  const [updated] = await db.update(buymeShopsTable).set({
    catalog: parsed.data.catalog,
    sales: parsed.data.sales,
    settings: parsed.data.settings,
    name: typeof parsed.data.settings.shopName === "string" ? parsed.data.settings.shopName.slice(0, 120) : currentShop.shop.name,
    revision: currentShop.shop.revision + 1,
    updatedAt: new Date(),
  }).where(and(eq(buymeShopsTable.id, currentShop.shop.id), eq(buymeShopsTable.revision, parsed.data.revision))).returning();
  if (!updated) { res.status(409).json({ error: "This shop changed on another device. Reload to get the latest data before saving again." }); return; }
  res.json(responseFor(updated, currentShop.role, current.email));
});

router.get("/shop/sellers", async (req, res): Promise<void> => {
  const current = await session(req);
  if (!current || !process.env.BUYME_COMPANY_ADMIN_EMAIL || current.email !== process.env.BUYME_COMPANY_ADMIN_EMAIL.trim().toLowerCase()) {
    res.status(403).json({ error: "Company administrator access is required." }); return;
  }
  const shops = await db.select().from(buymeShopsTable).orderBy(buymeShopsTable.createdAt);
  const sellers = await Promise.all(shops.map(async (shop) => {
    const members = await db.select({ email: buymeMembershipsTable.email, role: buymeMembershipsTable.role })
      .from(buymeMembershipsTable).where(eq(buymeMembershipsTable.shopId, shop.id));
    return { id: shop.id, name: shop.name, premiumApproved: shop.premiumApproved, members };
  }));
  res.json({ sellers });
});

router.patch("/shop/sellers/:id", async (req, res): Promise<void> => {
  const current = await session(req);
  if (!current || !process.env.BUYME_COMPANY_ADMIN_EMAIL || current.email !== process.env.BUYME_COMPANY_ADMIN_EMAIL.trim().toLowerCase()) {
    res.status(403).json({ error: "Company administrator access is required." }); return;
  }
  const parsed = z.object({ premiumApproved: z.boolean() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Choose whether Premium is approved." }); return; }
  const [updated] = await db.update(buymeShopsTable)
    .set({ premiumApproved: parsed.data.premiumApproved, revision: sql`${buymeShopsTable.revision} + 1` })
    .where(eq(buymeShopsTable.id, req.params.id))
    .returning({ id: buymeShopsTable.id, premiumApproved: buymeShopsTable.premiumApproved });
  if (!updated) { res.status(404).json({ error: "Shop not found." }); return; }
  res.json(updated);
});

router.get("/shop/members", async (req, res): Promise<void> => {
  const current = await session(req);
  if (!current) { res.status(401).json({ error: "Sign in to view shop members." }); return; }
  const assigned = await membership(current.userId);
  if (!assigned) { res.status(404).json({ error: "No shop is assigned to this account." }); return; }
  const members = await db.select({ email: buymeMembershipsTable.email, role: buymeMembershipsTable.role })
    .from(buymeMembershipsTable).where(eq(buymeMembershipsTable.shopId, assigned.shop.id));
  res.json({ members });
});

router.post("/shop/invitations", async (req, res): Promise<void> => {
  const current = await session(req);
  if (!current) { res.status(401).json({ error: "Sign in to invite a team member." }); return; }
  const assigned = await membership(current.userId);
  if (!assigned || assigned.role !== "owner") { res.status(403).json({ error: "Only the shop owner can invite team members." }); return; }
  const parsed = z.object({ email: z.string().email().max(320) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Enter a valid email address." }); return; }
  const email = parsed.data.email.trim().toLowerCase();
  if (email === current.email) { res.status(400).json({ error: "That email already owns this session." }); return; }
  const invitation = await clerkClient.invitations.createInvitation({
    emailAddress: email,
    publicMetadata: { buymeShopId: assigned.shop.id },
    notify: true,
  });
  res.status(201).json({ id: invitation.id, email });
});

router.post("/shop/images/upload-url", async (req, res): Promise<void> => {
  const current = await session(req);
  if (!current) { res.status(401).json({ error: "Sign in before uploading an image." }); return; }
  const assigned = await membership(current.userId);
  if (!assigned) { res.status(404).json({ error: "No shop is assigned to this account." }); return; }
  const parsed = z.object({
    contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    byteLength: z.number().int().positive().max(6_000_000),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Use a JPEG, PNG or WebP image under 6 MB." }); return; }
  const imageId = randomUUID();
  const { uploadURL, objectPath } = await storage.createUpload();
  await db.insert(buymeImagesTable).values({
    id: imageId, shopId: assigned.shop.id, objectPath,
    contentType: parsed.data.contentType, byteLength: parsed.data.byteLength,
  });
  res.json({ uploadURL, imageUrl: `/api/shop/images/${imageId}` });
});

router.get("/shop/images/:id", async (req, res): Promise<void> => {
  const current = await session(req);
  if (!current) { res.status(401).json({ error: "Sign in to view this image." }); return; }
  const assigned = await membership(current.userId);
  if (!assigned) { res.status(404).json({ error: "Image not found." }); return; }
  const [image] = await db.select().from(buymeImagesTable).where(and(
    eq(buymeImagesTable.id, req.params.id), eq(buymeImagesTable.shopId, assigned.shop.id),
  )).limit(1);
  if (!image) { res.status(404).json({ error: "Image not found." }); return; }
  try {
    const file = await storage.getObjectEntityFile(image.objectPath);
    const response = await storage.downloadObject(file);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, key.toLowerCase() === "cache-control" ? "private, max-age=3600" : value));
    if (response.body) Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    else res.end();
  } catch (error) {
    if (error instanceof ObjectNotFoundError) { res.status(404).json({ error: "Image not found." }); return; }
    req.log.error({ error }, "Could not serve shop image");
    res.status(500).json({ error: "Could not serve this image." });
  }
});

export default router;