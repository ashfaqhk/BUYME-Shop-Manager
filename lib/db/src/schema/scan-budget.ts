import { integer, pgTable, text } from "drizzle-orm/pg-core";

// One global budget for all billable photo and document scans.
export const scanBudgetTable = pgTable("scan_budget", {
  id: integer("id").primaryKey(),
  day: text("day").notNull(),
  month: text("month").notNull(),
  dailyCount: integer("daily_count").notNull(),
  monthlyCount: integer("monthly_count").notNull(),
});