import { jsonb, pgTable, text, timestamp, integer, boolean, uniqueIndex } from "drizzle-orm/pg-core";

export const buymeShopsTable = pgTable("buyme_shops", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  premiumApproved: boolean("premium_approved").notNull().default(false),
  catalog: jsonb("catalog").notNull().default([]),
  sales: jsonb("sales").notNull().default([]),
  settings: jsonb("settings").notNull(),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const buymeMembershipsTable = pgTable("buyme_memberships", {
  id: text("id").primaryKey(),
  shopId: text("shop_id").notNull().references(() => buymeShopsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("owner"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("buyme_memberships_user_shop").on(table.userId, table.shopId)]);

export const buymeImagesTable = pgTable("buyme_images", {
  id: text("id").primaryKey(),
  shopId: text("shop_id").notNull().references(() => buymeShopsTable.id, { onDelete: "cascade" }),
  objectPath: text("object_path").notNull(),
  contentType: text("content_type").notNull(),
  byteLength: integer("byte_length").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});