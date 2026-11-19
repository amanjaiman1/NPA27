"use client";

import { supabase } from "./supabase";
import { isDemo } from "./demo/mode";
import {
  FILE_BUCKET,
  MAX_FILE_BYTES,
  cleanFileName,
  extensionOf,
  formatBytes,
  storagePath,
  type FileTypeDef,
} from "./files";

/* ════════════════════════════════════════════════════════════════
   THE NETWORK SIDE OF ATTACHED FILES
   Talks to Supabase Storage as the signed-in user. The bucket is private
   and its row-level security only lets an account read, write and delete
   objects under its own `<user id>/` folder, so nothing here can reach
   another account's files even if asked to.

   Uploads go through XMLHttpRequest rather than supabase-js because only
   XHR reports upload progress.
   ════════════════════════════════════════════════════════════════ */

export class FileError extends Error {
  constructor(
    message: string,
    readonly kind: "offline" | "auth" | "too-large" | "type" | "quota" | "network" | "server" | "cancelled",
  ) {
    super(message);
  }
}

export const filesAvailable = Boolean(supabase);

/* ── preparing a file ──────────────────────────────────────────── */

export interface PreparedFile {
  blob: Blob;
  name: string;
  type: string;
  size: number;
  sha256: string;
  width?: number;
  height?: number;
}

const MAX_EDGE = 2048;
const KEEP_IF_UNDER = 1.2 * 1024 * 1024;

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function decode(file: Blob): Promise<{ draw: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file);
      return { draw: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* fall through to an <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { draw: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new FileError("This image couldn't be read. Try saving it as a JPEG or PNG first.", "type");
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

const EXT_FOR: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };

function renamed(name: string, type: string): string {
  const ext = EXT_FOR[type];
  const clean = cleanFileName(name);
  if (!ext) return clean;
  const current = extensionOf(clean);
  if (current === ext || (ext === "jpg" && current === "jpeg")) return clean;
  return current ? `${clean.slice(0, -(current.length + 1))}.${ext}` : `${clean}.${ext}`;
}

/**
 * Photos are scaled to at most 2048 px on the long edge and re-encoded (WebP
 * where the browser can, JPEG otherwise), which turns a 6 MB phone photo into a
 * few hundred KB with no visible loss. GIFs are left alone so they keep moving;
 * other files are stored exactly as they are.
 */
export async function prepareFile(file: File, def: FileTypeDef): Promise<PreparedFile> {
  let blob: Blob = file;
  let type = def.type;
  let name = cleanFileName(file.name);
  let width: number | undefined;
  let height: number | undefined;

  if (def.kind === "image") {
    const img = await decode(file);
    try {
      width = img.width;
      height = img.height;
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height, 1));
      const shrink = def.type !== "image/gif" && (scale < 1 || file.size > KEEP_IF_UNDER);
      if (shrink) {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img.draw, 0, 0, canvas.width, canvas.height);
          let out = await toBlob(canvas, "image/webp", 0.85);
          if (!out || out.type !== "image/webp") {
            // No WebP encoder (older Safari): keep PNGs lossless, everything else JPEG.
            out = def.type === "image/png" ? await toBlob(canvas, "image/png") : await toBlob(canvas, "image/jpeg", 0.86);
          }
          if (out && (out.size < file.size || file.size > MAX_FILE_BYTES)) {
            blob = out;
            type = out.type;
            name = renamed(file.name, type);
            width = canvas.width;
            height = canvas.height;
          }
        }
      }
    } finally {
      img.close();
    }
  }

  if (blob.size > MAX_FILE_BYTES) {
    throw new FileError(
      `“${name}” is ${formatBytes(blob.size)}${def.kind === "image" ? " even after resizing" : ""}. Files can be up to ${formatBytes(MAX_FILE_BYTES)}.`,
      "too-large",
    );
  }
  return { blob, name, type, size: blob.size, sha256: await sha256Hex(blob), width, height };
}

/* ── uploading ─────────────────────────────────────────────────── */

const DEMO_FILES = "The demo saves nothing, so it has no files. Create a free account to attach them.";

async function accessToken(): Promise<string> {
  if (isDemo()) throw new FileError(DEMO_FILES, "server");
  if (!supabase) throw new FileError("Attachments need cloud sync, which isn't set up in this build.", "server");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new FileError("Your session has ended. Sign in again to attach files.", "auth");
  return token;
}

function objectUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/+$/, "");
  return `${base}/storage/v1/object/${FILE_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export interface UploadOutcome {
  path: string;
  /** False when the bucket already held these exact bytes: nothing was sent twice. */
  created: boolean;
}

/**
 * Uploads to `<user id>/<sha256>`. If that object already exists — the same
 * file attached before, perhaps on another device — Storage refuses the
 * duplicate, which is exactly what we want: the existing copy is used.
 */
export async function uploadFile(
  prepared: PreparedFile,
  userId: string,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<UploadOutcome> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new FileError("You're offline. Attach the file again once you're connected.", "offline");
  }
  const token = await accessToken();
  const path = storagePath(userId, prepared.sha256);
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  return new Promise<UploadOutcome>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", objectUrl(path));
    xhr.setRequestHeader("authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", anon);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("content-type", prepared.type);
    // Content-addressed, so a stored object never changes: let browsers keep it.
    xhr.setRequestHeader("cache-control", "max-age=31536000");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(Math.min(0.99, e.loaded / e.total));
    };
    xhr.onerror = () => reject(new FileError("The upload didn't go through. Check your connection and try again.", "network"));
    xhr.onabort = () => reject(new FileError("Upload cancelled.", "cancelled"));
    xhr.onload = () => {
      let body: { statusCode?: string | number; error?: string; message?: string } = {};
      try {
        body = JSON.parse(xhr.responseText || "{}");
      } catch {
        /* not JSON */
      }
      const duplicate =
        xhr.status === 409 ||
        String(body.statusCode) === "409" ||
        /already exists|duplicate/i.test(`${body.error ?? ""} ${body.message ?? ""}`);
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve({ path, created: true });
      } else if (duplicate) {
        onProgress(1);
        resolve({ path, created: false });
      } else if (xhr.status === 401 || xhr.status === 403) {
        reject(new FileError("This upload wasn't allowed. Sign out and in again, then retry.", "auth"));
      } else if (xhr.status === 413 || /too large|exceeded the maximum/i.test(`${body.error ?? ""} ${body.message ?? ""}`)) {
        reject(new FileError(`That file is larger than the ${formatBytes(MAX_FILE_BYTES)} limit.`, "too-large"));
      } else if (/mime|type/i.test(`${body.error ?? ""} ${body.message ?? ""}`) && xhr.status === 400) {
        reject(new FileError("That type of file can't be attached.", "type"));
      } else {
        reject(new FileError("The file couldn't be stored right now. Try again in a moment.", "server"));
      }
    };
    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(prepared.blob);
  });
}

/* ── reading ───────────────────────────────────────────────────── */

const LINK_TTL_SECONDS = 60 * 60;
const links = new Map<string, { url: string; expires: number }>();

/**
 * A short-lived link to one of the account's own files. Kept in memory and
 * reused until shortly before it expires, so a page of thumbnails doesn't ask
 * for new links (or download the images again) on every render.
 */
export async function fileLink(path: string, download?: string): Promise<string> {
  if (isDemo()) throw new FileError(DEMO_FILES, "server");
  if (!supabase) throw new FileError("Attachments need cloud sync.", "server");
  const key = download ? `${path}|${download}` : path;
  const cached = links.get(key);
  if (cached && cached.expires - Date.now() > 5 * 60_000) return cached.url;
  const { data, error } = await supabase.storage
    .from(FILE_BUCKET)
    .createSignedUrl(path, LINK_TTL_SECONDS, download ? { download } : undefined);
  if (error || !data?.signedUrl) {
    throw new FileError(
      /not found/i.test(error?.message ?? "") ? "This file is no longer stored." : "The file couldn't be opened right now.",
      /not found/i.test(error?.message ?? "") ? "server" : "network",
    );
  }
  links.set(key, { url: data.signedUrl, expires: Date.now() + LINK_TTL_SECONDS * 1000 });
  return data.signedUrl;
}

/** The first `maxBytes` of a text file, for the preview. */
export async function fileText(path: string, maxBytes = 200_000): Promise<{ text: string; truncated: boolean }> {
  const url = await fileLink(path);
  const res = await fetch(url);
  if (!res.ok) throw new FileError("The file couldn't be read.", "network");
  const buf = await res.arrayBuffer();
  const truncated = buf.byteLength > maxBytes;
  const text = new TextDecoder().decode(truncated ? buf.slice(0, maxBytes) : buf);
  return { text, truncated };
}

/* ── deleting ──────────────────────────────────────────────────── */

/** Deletes objects from the account's own folder. Missing objects count as deleted. */
export async function removeStoredPaths(paths: string[]): Promise<boolean> {
  // Never on someone's real storage from the demo: report "not done", so nothing is forgotten either.
  if (isDemo()) return false;
  if (!supabase || !paths.length) return true;
  for (const p of paths) {
    links.delete(p);
    for (const k of [...links.keys()]) if (k.startsWith(`${p}|`)) links.delete(k);
  }
  const { error } = await supabase.storage.from(FILE_BUCKET).remove(paths);
  return !error;
}

/** Objects in the account's folder, oldest pages first, for the occasional sweep. */
export async function listStoredObjects(userId: string): Promise<{ path: string; createdAt: string | null }[]> {
  if (!supabase || isDemo()) return [];
  const out: { path: string; createdAt: string | null }[] = [];
  for (let offset = 0; offset < 5000; offset += 1000) {
    const { data, error } = await supabase.storage
      .from(FILE_BUCKET)
      .list(userId, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    if (error || !data) break;
    for (const o of data) {
      // Folders come back without an id; there are none under a user's folder.
      if (!o.id) continue;
      out.push({ path: `${userId}/${o.name}`, createdAt: o.created_at ?? null });
    }
    if (data.length < 1000) break;
  }
  return out;
}
