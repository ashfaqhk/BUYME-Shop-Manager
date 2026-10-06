import pg from "pg";

if (!process.env.SUPABASE_DATABASE_URL) throw new Error("SUPABASE_DATABASE_URL must be configured.");
const client = new pg.Client({ connectionString: process.env.SUPABASE_DATABASE_URL });
try {
  await client.connect();
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("SET LOCAL statement_timeout = '30s'");
  await client.query("ALTER TABLE buyme_shops ADD COLUMN IF NOT EXISTS access_enabled boolean NOT NULL DEFAULT true");
  await client.query("ALTER TABLE buyme_shops ADD COLUMN IF NOT EXISTS upgrade_requested_at timestamptz");
  await client.query("ALTER TABLE buyme_images ADD COLUMN IF NOT EXISTS image_base64 text");
  await client.query("COMMIT");
  console.log("Supabase shop access and image-copy fields are ready. Existing catalog, sales and settings were not changed.");
} catch {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error("Could not prepare Supabase access fields. No migration was committed.");
  process.exitCode = 1;
} finally { await client.end(); }
