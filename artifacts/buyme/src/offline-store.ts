import type { LocalShop, ShopState } from "./shop-types";

const ACTIVE = "buyme-active-offline-user";
let database: Promise<IDBDatabase> | undefined;

function openDatabase() {
  if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("buyme-device-data", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("shops", { keyPath: "userId" });
      request.result.createObjectStore("backups", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(new Error("Device storage is unavailable. Do not close BUYME until your changes are synced.")); };
  });
  return database;
}

export async function loadDeviceShop(userId: string): Promise<LocalShop | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction("shops").objectStore("shops").get(userId);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(new Error("Could not read this device's saved shop."));
  });
}

export async function persistDeviceShop(record: LocalShop): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("shops", "readwrite");
    transaction.objectStore("shops").put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () => reject(new Error("Device storage is full or unavailable. Keep BUYME open and retry syncing before closing."));
  });
}

export async function backupDeviceShop(record: LocalShop, cloud?: ShopState): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("backups", "readwrite");
    transaction.objectStore("backups").put({ ...record, cloud, key: `${record.userId}:${Date.now()}:${crypto.randomUUID()}` });
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () => reject(new Error("Could not preserve the device copy. Conflict resolution was not applied."));
  });
}

export function activeOfflineUser(): string | null {
  try { return localStorage.getItem(ACTIVE); } catch { return null; }
}
export function rememberOfflineUser(userId: string) {
  try { localStorage.setItem(ACTIVE, userId); } catch { /* IndexedDB still retains the data. */ }
}
export function clearOfflineUser() {
  try { localStorage.removeItem(ACTIVE); } catch { /* Signing out still removes authentication. */ }
}
