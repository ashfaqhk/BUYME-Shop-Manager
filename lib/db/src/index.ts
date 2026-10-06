import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const databaseUrl =
  process.env.NODE_ENV === "test"
    ? process.env.DATABASE_URL
    : process.env.SUPABASE_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "Configure SUPABASE_DATABASE_URL for the app, or DATABASE_URL for tests.",
  );
}

export const pool = new Pool({ connectionString: databaseUrl });
export const db = drizzle(pool, { schema });

export * from "./schema";
