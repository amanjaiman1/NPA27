"use client";

/* A screenshot for feedback, made small enough to send: at most 1600 px on
   its longest side and 2 MB, re-saved on the device first. Re-saving
   through a canvas also drops the file's metadata (camera, location). */

export const SCREENSHOT_LIMIT = 2 * 1024 * 1024;
const MAX_SIDE = 1600;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

export interface Screenshot {
  type: "image/webp" | "image/jpeg" | "image/png";
  /** Base64, without the `data:` prefix. */
  data: string;
  /** An object URL for the preview. Revoke it when done. */
  preview: string;
  bytes: number;
}

function load(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That image couldn't be opened."));
    };
    img.src = url;
  });
}

const encode = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(new Error("That image couldn't be read."));
    reader.readAsDataURL(blob);
  });
}

/** Shrinks and re-saves an image for sending. Throws an Error with a message to show. */
export async function prepareScreenshot(file: File): Promise<Screenshot> {
  if (!ACCEPTED.includes(file.type)) throw new Error("Attach a PNG, JPEG or WebP image.");
  if (file.size > 20 * 1024 * 1024) throw new Error("That image is over 20 MB. Try a smaller screenshot.");
  const img = await load(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't prepare images.");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // WebP where the browser can write it (it hands back PNG when it can't), then JPEG.
  let blob = await encode(canvas, "image/webp", 0.85);
  if (!blob || blob.type !== "image/webp" || blob.size > SCREENSHOT_LIMIT) blob = await encode(canvas, "image/jpeg", 0.85);
  if (blob && blob.size > SCREENSHOT_LIMIT) blob = await encode(canvas, "image/jpeg", 0.65);
  if (!blob) throw new Error("That image couldn't be prepared.");
  if (blob.size > SCREENSHOT_LIMIT) throw new Error("Even made smaller, that image is over 2 MB.");
  const type = (blob.type === "image/webp" ? "image/webp" : blob.type === "image/png" ? "image/png" : "image/jpeg") as Screenshot["type"];
  return { type, data: await base64(blob), preview: URL.createObjectURL(blob), bytes: blob.size };
}
