import { useCallback, useEffect, useRef, useState } from "react";
import { activeOfflineUser, backupDeviceShop, clearOfflineUser, loadDeviceShop, persistDeviceShop, rememberOfflineUser } from "./offline-store";
import { cacheCloudPhotos, canonicalPhotos, displayPhotos, externalizePhotos } from "./shop-photos";
import { mergeSnapshots, sameData, type ConflictChoice } from "./shop-merge";
import { canonicalHistory, historyVisible, hydrateHistory, mergeHistory } from "@workspace/api-zod";
import { snapshotOf, type LocalShop, type ShopState, type Snapshot } from "./shop-types";

const api = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/shop`;
export { activeOfflineUser };
export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  return online;
}
async function readResponse(response: Response): Promise<ShopState> {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || `Could not sync your shop (${response.status}).`);
  if (!body || !Array.isArray(body.catalog) || !Array.isArray(body.sales) || !body.settings) throw new Error("The server returned invalid shop data. The device copy has not been replaced.");
  return body as ShopState;
}

export function useShopSync(userId: string, authenticated: boolean) {
  const [shop, setShop] = useState<ShopState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [resolving, setResolving] = useState(false);
  const record = useRef<LocalShop | null>(null);
  const alive = useRef(true);
  const canSync = useRef(authenticated);
  canSync.current = authenticated;
  const running = useRef(false);
  const ownsDevice = useRef(false);
  const generation = useRef(0);
  const storage = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const conflictChoice = useRef<ConflictChoice | undefined>(undefined);
  const conflictCloud = useRef<ShopState | undefined>(undefined);
  const pumpRef = useRef<() => Promise<ShopState | null>>(async () => null);

  const publish = useCallback(() => {
    if (!alive.current || !record.current) return;
    setShop({ ...record.current.server, ...displayPhotos(record.current.local, record.current.photos) });
  }, []);
  const persist = useCallback(() => {
    const captured = record.current ? structuredClone(record.current) : null;
    storage.current = storage.current.catch(() => undefined).then(async () => {
      if (captured) await persistDeviceShop(captured);
    });
    return storage.current;
  }, []);
  const schedule = useCallback((delay = 450) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void pumpRef.current(), delay);
  }, []);
  const pump = useCallback(async (): Promise<ShopState | null> => {
    if (running.current || !alive.current || !ownsDevice.current) return record.current?.server ?? null;
    if (!navigator.onLine || !canSync.current) {
      setSaveStatus(record.current?.pending ? "Saved on device · waiting for internet" : "Device copy · offline");
      return record.current?.server ?? null;
    }
    running.current = true;
    let photoWarning = false;
    try {
      try { await storage.current; } catch { await persist(); }
      let cloud = await readResponse(await fetch(api, { credentials: "include", cache: "no-store" }));
      if (!alive.current) return null;
      if (cloud.isCompanyAdmin) { clearOfflineUser(); setShop(cloud); return cloud; }
      if (record.current && record.current.server.shopId !== cloud.shopId) throw new Error("Your assigned shop changed. The old device data is preserved. Sign out and contact the company administrator.");
      if (!record.current) {
        record.current = { userId, server: cloud, local: snapshotOf(cloud), pending: false, photos: {}, updatedAt: new Date().toISOString() };
      }
      if (!cloud.accessEnabled) {
        record.current.server = { ...record.current.server, accessEnabled: false, premiumApproved: cloud.premiumApproved };
        publish(); await persist(); setSaveStatus("Access paused · device changes kept"); return cloud;
      }
      if (record.current && cloud.historyStart) {
        const archived = record.current.server.sales.filter((row) => !historyVisible(row, cloud.historyStart!));
        const fingerprints = await Promise.all(archived.flatMap((row) => {
          if (!row || typeof row !== "object" || !("id" in row) || typeof row.id !== "string") return [];
          const id = row.id;
          return [crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalHistory(row))).then((hash) => ({
            id, fingerprint: [...new Uint8Array(hash)].map((n) => n.toString(16).padStart(2, "0")).join(""),
          }))];
        }));
        let changed: unknown[] = [];
        if (fingerprints.length) {
          const response = await fetch(`${api}/history-refresh`, {
            method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ records: fingerprints, revision: cloud.revision }),
          });
          if (response.status === 409) { schedule(800); return record.current.server; }
          if (!response.ok) throw new Error("Could not reconcile older saved bills. Your device copy is kept.");
          const body = await response.json() as { sales: unknown[] };
          if (!Array.isArray(body.sales)) throw new Error("Invalid saved-history response.");
          changed = body.sales;
        }
        cloud = hydrateHistory({ ...cloud, sales: mergeHistory(cloud.sales, changed) }, record.current.server);
      }
      const current = record.current;
      const result = current.pending ? mergeSnapshots(snapshotOf(current.server), current.local, snapshotOf(cloud), conflictChoice.current) :
        { snapshot: snapshotOf(cloud), conflicts: [] as string[] };
      if (result.conflicts.length && !conflictChoice.current) {
        conflictCloud.current = cloud;
        current.server = { ...current.server, accessEnabled: cloud.accessEnabled, premiumApproved: cloud.premiumApproved, mode: cloud.mode, upgradeRequestedAt: cloud.upgradeRequestedAt };
        publish(); setConflicts(result.conflicts);
        setSaveStatus("Saved on device · resolve conflicting edits"); await persist(); return cloud;
      }
      conflictChoice.current = undefined;
      setConflicts([]);
      if (current.pending && !sameData(result.snapshot, snapshotOf(cloud))) {
        setSaveStatus("Saved on device · syncing…");
        const sentGeneration = generation.current;
        const sentLocal = structuredClone(current.local);
        const safe = await externalizePhotos(result.snapshot, current.photos);
        if (!alive.current || !canSync.current) return null;
        // Retain uploaded paths even if the optimistic revision changes.
        record.current!.photos = { ...record.current!.photos, ...safe.photos };
        const response = await fetch(api, {
          method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...safe.snapshot, shopId: cloud.shopId, revision: cloud.revision }),
        });
        if (response.status === 409) { setSaveStatus("Saved on device · checking cloud changes"); schedule(800); return cloud; }
        const downloaded = await readResponse(response);
        const saved = hydrateHistory(downloaded, safe.snapshot);
        if (!alive.current) return null;
        if (saved.shopId !== record.current!.server.shopId) throw new Error("The server returned another shop. Your device copy has not been replaced.");
        const latest = record.current!;
        latest.local = generation.current === sentGeneration ? snapshotOf(saved) :
          canonicalPhotos(mergeSnapshots(sentLocal, latest.local, snapshotOf(saved), "device").snapshot, latest.photos);
        latest.server = saved;
        latest.pending = generation.current !== sentGeneration && !sameData(latest.local, snapshotOf(saved));
      } else {
        current.server = cloud; current.local = result.snapshot; current.pending = false;
      }
      publish(); await persist();
      rememberOfflineUser(userId);
      void navigator.storage?.persist?.().catch(() => undefined);
      if (!record.current!.pending) {
        try {
          const photos = await cacheCloudPhotos(record.current!.local, record.current!.photos);
          if (!alive.current) return null;
          record.current!.photos = { ...photos, ...record.current!.photos };
          publish(); await persist();
        } catch { photoWarning = true; }
      }
      setSaveStatus(record.current!.pending ? "Saved on device · syncing…" : photoWarning ?
        "Data synced · some photos not yet saved on device" : "All changes saved");
      if (record.current!.pending) schedule();
      setError("");
      return record.current!.server;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not sync your shop.";
      if (alive.current) {
        if (record.current) setSaveStatus(`Device copy kept · ${message}`);
        else setError(message);
      }
      return record.current?.server ?? null;
    } finally { running.current = false; }
  }, [persist, publish, schedule, userId]);
  pumpRef.current = pump;

  useEffect(() => {
    alive.current = true;
    let releaseLock: (() => void) | undefined;
    const initialize = async () => {
      try {
        const cached = await loadDeviceShop(userId);
        if (!alive.current) return;
        if (cached) {
          record.current = { ...cached, photos: cached.photos ?? {} };
          publish(); setLoading(false);
          setSaveStatus(cached.pending ? "Saved on device · waiting to sync" : "Device copy loaded");
        }
        if (navigator.onLine && canSync.current) await pump();
        else if (!cached) setError("Connect to the internet and sign in once to save this shop on the device.");
      } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "Device storage is unavailable."); }
      finally { if (alive.current) setLoading(false); }
    };
    if (navigator.locks) {
      void navigator.locks.request(`buyme-edit:${userId}`, { ifAvailable: true }, async (lock) => {
        if (!alive.current) return;
        if (!lock) {
          setError("BUYME is already open for this account in another tab. Close that tab, then try again here so device changes cannot overwrite one another.");
          setLoading(false); return;
        }
        ownsDevice.current = true;
        await initialize();
        if (alive.current) await new Promise<void>((resolve) => { releaseLock = resolve; });
      }).catch(() => { setError("Could not lock device storage safely. Close other BUYME tabs and try again."); setLoading(false); });
    } else {
      setError("This browser cannot safely coordinate offline storage. Open BUYME in a current Chrome, Edge, Firefox or Safari browser.");
      setLoading(false);
    }
    const sync = () => { if (document.visibilityState === "visible") void pump(); };
    const offline = () => setSaveStatus(record.current?.pending ? "Saved on device · waiting for internet" : "Device copy · offline");
    const interval = setInterval(sync, 30000);
    window.addEventListener("online", sync); window.addEventListener("offline", offline);
    window.addEventListener("focus", sync); document.addEventListener("visibilitychange", sync);
    const beforeClose = (event: BeforeUnloadEvent) => {
      if (record.current?.pending) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", beforeClose);
    return () => {
      alive.current = false; clearTimeout(timer.current); clearInterval(interval);
      ownsDevice.current = false; releaseLock?.();
      window.removeEventListener("online", sync); window.removeEventListener("offline", offline);
      window.removeEventListener("focus", sync); document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("beforeunload", beforeClose);
    };
  }, [pump, publish, userId]);

  const updateSnapshot = useCallback(async (update: Snapshot | ((previous: Snapshot) => Snapshot)) => {
    if (!record.current) throw new Error("The shop has not loaded yet.");
    if (!record.current.server.accessEnabled) throw new Error("Shop access is paused.");
    const next = typeof update === "function" ? update(record.current.local) : update;
    const normalized = canonicalPhotos(next, record.current.photos);
    if (sameData(normalized, record.current.local)) return;
    generation.current += 1;
    record.current = { ...record.current, local: normalized, pending: true, updatedAt: new Date().toISOString() };
    publish(); setSaveStatus("Saving to device…");
    try {
      await persist();
      if (!alive.current) return;
      setSaveStatus(navigator.onLine && canSync.current ? "Saved on device · syncing…" : "Saved on device · waiting for internet");
      schedule();
    } catch (cause) {
      setSaveStatus(cause instanceof Error ? cause.message : "Could not save to this device.");
      throw cause;
    }
  }, [persist, publish, schedule]);
  const refresh = useCallback(async () => {
    if (record.current) await persist();
    const result = await pump();
    if (!result) throw new Error("Could not load the shop. Check your connection.");
    return result;
  }, [persist, pump]);
  const requestFull = useCallback(async () => {
    if (!navigator.onLine || !canSync.current) throw new Error("Reconnect and sign in to request Full access.");
    const updated = await readResponse(await fetch(`${api}/upgrade-request`, { method: "POST", credentials: "include" }));
    if (record.current) {
      record.current.server = { ...record.current.server, upgradeRequestedAt: updated.upgradeRequestedAt, premiumApproved: updated.premiumApproved };
      publish(); await persist();
    }
    await refresh();
  }, [persist, publish, refresh]);
  const resolveConflict = useCallback(async (choice: ConflictChoice) => {
    if (!record.current || resolving) return;
    setResolving(true);
    try {
      await storage.current;
      await backupDeviceShop(structuredClone(record.current), conflictCloud.current);
      conflictChoice.current = choice;
      await refresh();
    } catch (cause) { setSaveStatus(cause instanceof Error ? cause.message : "Could not resolve the conflict."); }
    finally { setResolving(false); }
  }, [refresh, resolving]);
  return { shop, loading, error, saveStatus, updateSnapshot, save: updateSnapshot, refresh, requestFull,
    retrySave: () => void refresh().catch(() => undefined), conflicts, resolving, resolveConflict,
    flushDevice: () => storage.current };
}
