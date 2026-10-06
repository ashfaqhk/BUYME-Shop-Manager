import { defineConfig } from "drizzle-kit";
import path from "path";

const databaseUrl =
  process.env.NODE_ENV === "test"
    ? process.env.DATABASE_URL
    : process.env.SUPABASE_DATABASE_URL;

if (!databaseUrl) {
  throw new Error("Configure SUPABASE_DATABASE_URL for the app, or DATABASE_URL for tests.");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
