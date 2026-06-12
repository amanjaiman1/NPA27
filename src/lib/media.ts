import type { Attachment } from "./types";
import { uid } from "./utils";

const MAX_DIM = 1280;
const JPEG_QUALITY = 0.72;
/** Skip non-image files larger than this to protect localStorage. */
const MAX_FILE_BYTES = 1_500_000;

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Convert a File into a storable Attachment. Images are downscaled and
 * re-encoded as JPEG so a few screenshots don't blow the localStorage quota.
 * Returns null if the file can't be stored safely.
 */
export async function fileToAttachment(file: File): Promise<Attachment | null> {
  const isImage = file.type.startsWith("image/");

  if (!isImage) {
    if (file.size > MAX_FILE_BYTES) return null;
    const dataUrl = await readAsDataURL(file);
    return {
      id: uid("att"),
      kind: "file",
      name: file.name,
      dataUrl,
      size: file.size,
    };
  }

  try {
    const original = await readAsDataURL(file);
    const img = await loadImage(original);
    const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    return {
      id: uid("att"),
      kind: "image",
      name: file.name,
      dataUrl,
      size: Math.round((dataUrl.length * 3) / 4),
    };
  } catch {
    return null;
  }
}

/** Process several files, dropping any that fail. */
export async function filesToAttachments(files: FileList | File[]): Promise<Attachment[]> {
  const arr = Array.from(files);
  const results = await Promise.all(arr.map((f) => fileToAttachment(f)));
  return results.filter((a): a is Attachment => a !== null);
}
