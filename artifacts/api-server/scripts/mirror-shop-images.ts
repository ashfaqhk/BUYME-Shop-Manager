import { eq, isNull } from "drizzle-orm";
import { db, pool, buymeImagesTable } from "@workspace/db";
import { ObjectStorageService } from "../src/lib/objectStorage";

const storage = new ObjectStorageService();
try {
  const images = await db.select().from(buymeImagesTable).where(isNull(buymeImagesTable.imageBase64));
  let copied = 0;
  for (const image of images) {
    const file = await storage.getObjectEntityFile(image.objectPath);
    const response = await storage.downloadObject(file);
    if (!response.ok) throw new Error("A source image could not be downloaded.");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== image.byteLength || bytes.length > 6_000_000) throw new Error("A source image failed its length check.");
    await db.update(buymeImagesTable).set({ imageBase64: bytes.toString("base64") }).where(eq(buymeImagesTable.id, image.id));
    copied++;
  }
  console.log(`Copied ${copied} existing images into Supabase. Original App Storage files were retained.`);
} catch {
  console.error("Image copy did not finish. Existing files were not removed; rerun safely to complete remaining images.");
  process.exitCode = 1;
} finally { await pool.end(); }
