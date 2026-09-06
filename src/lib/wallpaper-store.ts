"use client";

/**
 * Device-local storage for a custom wallpaper.
 *
 * A photo belongs on the device that chose it, not in the cloud snapshot: the
 * snapshot is a single JSON row that syncs on every edit, and a megabyte of
 * base64 in there would be pushed over and over. So the blob goes to IndexedDB
 * and only the wallpaper *id* travels with the rest of the appearance settings.
 */

const DB_NAME = "upsc-chronicle-media";
const STORE = "wallpaper";
const KEY = "custom";

/** Longest edge after downscaling, and the JPEG quality used. */
const MAX_EDGE = 1920;
const QUALITY = 0.82;
/** Anything larger than this after compression is refused rather than stored. */
export const MAX_BYTES = 2_500_000;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  try {
    const db = await open();
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return null; // private mode, no quota, unsupported — callers fall back
  }
}

/** Downscale and re-encode in the browser so we never store the raw upload. */
export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY),
  );
  if (!blob) throw new Error("could not encode image");
  return blob;
}

export async function saveCustomWallpaper(blob: Blob): Promise<void> {
  await withStore("readwrite", (store) => store.put(blob, KEY));
}

export async function loadCustomWallpaper(): Promise<Blob | null> {
  return withStore<Blob>("readonly", (store) => store.get(KEY) as IDBRequest<Blob>);
}

export async function clearCustomWallpaper(): Promise<void> {
  await withStore("readwrite", (store) => store.delete(KEY));
}
