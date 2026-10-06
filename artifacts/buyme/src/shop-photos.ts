import type { Snapshot } from "./shop-types";

const api = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
const walk = (value: unknown, convert: (value: string) => string): unknown => {
  if (typeof value === "string") return convert(value);
  if (Array.isArray(value)) return value.map((item) => walk(item, convert));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, walk(item, convert)]));
  return value;
};
export const displayPhotos = (snapshot: Snapshot, photos: Record<string, string>) =>
  walk(snapshot, (value) => photos[value] ?? value) as Snapshot;
export const canonicalPhotos = (snapshot: Snapshot, photos: Record<string, string>) => {
  const reverse = Object.fromEntries(Object.entries(photos).map(([path, data]) => [data, path]));
  return walk(snapshot, (value) => reverse[value] ?? value) as Snapshot;
};

export async function uploadSellerPhoto(dataUrl: string): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  if (!["image/jpeg", "image/png", "image/webp"].includes(blob.type) || blob.size > 6_000_000) {
    throw new Error("Shop images must be JPEG, PNG or WebP and under 6 MB.");
  }
  // Device storage is the first destination, including when there is no connection.
  return dataUrl;
}

export async function externalizePhotos(snapshot: Snapshot, knownPhotos: Record<string, string>) {
  const photos = { ...knownPhotos };
  const known = new Map(Object.entries(photos).map(([path, data]) => [data, path]));
  const convert = async (value: unknown): Promise<unknown> => {
    if (typeof value === "string" && value.startsWith("data:image/")) {
      if (known.has(value)) return known.get(value);
      const blob = await (await fetch(value)).blob();
      const signed = await fetch(`${api}/shop/images`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: blob.type, base64: value.slice(value.indexOf(",") + 1) }),
      });
      const body = await signed.json().catch(() => null);
      if (!signed.ok) throw new Error(body?.error || "Photo sync failed. Your device copy is still safe.");
      known.set(value, body.imageUrl); photos[body.imageUrl] = value;
      return body.imageUrl;
    }
    if (Array.isArray(value)) return Promise.all(value.map(convert));
    if (value && typeof value === "object") return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, item]) => [key, await convert(item)])));
    return value;
  };
  return { snapshot: await convert(snapshot) as Snapshot, photos };
}

export async function cacheCloudPhotos(snapshot: Snapshot, knownPhotos: Record<string, string>) {
  const paths = new Set<string>();
  walk(snapshot, (value) => { if (value.startsWith(`${api}/shop/images/`) && !knownPhotos[value]) paths.add(value); return value; });
  const photos = { ...knownPhotos };
  for (const path of paths) {
    const response = await fetch(path, { credentials: "include" });
    if (!response.ok) throw new Error("Some photos are not downloaded to this device yet.");
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) throw new Error("A saved photo could not be read.");
    photos[path] = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not keep a device copy of a photo."));
      reader.readAsDataURL(blob);
    });
  }
  return photos;
}
