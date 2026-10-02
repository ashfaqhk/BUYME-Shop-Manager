import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { Storage } from "@google-cloud/storage";

const SIDECAR = "http://127.0.0.1:1106";
const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR}/token`,
    type: "external_account",
    credential_source: { url: `${SIDECAR}/credential`, format: { type: "json", subject_token_field_name: "access_token" } },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

function parseBucketObject(fullPath: string) {
  const [bucket, ...rest] = fullPath.replace(/^\/+/, "").split("/");
  if (!bucket || !rest.length) throw new Error("Invalid private object directory");
  return { bucket, objectName: rest.join("/") };
}

export class ObjectNotFoundError extends Error {}

export class ObjectStorageService {
  private privateDir() {
    const dir = process.env.PRIVATE_OBJECT_DIR;
    if (!dir) throw new Error("App Storage is not configured.");
    return dir;
  }

  async createUpload() {
    const id = randomUUID();
    const fullPath = `${this.privateDir()}/buyme/${id}`;
    const { bucket, objectName } = parseBucketObject(fullPath);
    const response = await fetch(`${SIDECAR}/object-storage/signed-object-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bucket_name: bucket, object_name: objectName, method: "PUT", expires_at: new Date(Date.now() + 900_000).toISOString() }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Could not create upload URL (${response.status}).`);
    const payload = await response.json() as { signed_url?: string };
    if (!payload.signed_url) throw new Error("App Storage returned no upload URL.");
    return { uploadURL: payload.signed_url, objectPath: `/objects/buyme/${id}` };
  }

  async getObjectEntityFile(objectPath: string) {
    const match = /^\/objects\/buyme\/([0-9a-f-]{36})$/i.exec(objectPath);
    if (!match) throw new ObjectNotFoundError();
    const { bucket, objectName } = parseBucketObject(`${this.privateDir()}/buyme/${match[1]}`);
    const file = storage.bucket(bucket).file(objectName);
    const [exists] = await file.exists();
    if (!exists) throw new ObjectNotFoundError();
    return file;
  }

  async downloadObject(file: Awaited<ReturnType<ObjectStorageService["getObjectEntityFile"]>>) {
    const [metadata] = await file.getMetadata();
    const body = Readable.toWeb(file.createReadStream()) as ReadableStream;
    return new Response(body, {
      headers: {
        "Content-Type": String(metadata.contentType || "application/octet-stream"),
        "Content-Length": String(metadata.size || ""),
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
}