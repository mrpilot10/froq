// Client-side prep for menu uploads. Photos come off phones at 4-12 MB each,
// which no server action wants, but the model still has to read small printed
// prices — so images are downscaled to a legible ceiling rather than a thumbnail.
// PDFs pass through untouched: re-encoding them would only lose text fidelity.

export const ACCEPTED_UPLOAD_TYPES = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf";

export const MAX_UPLOAD_FILES = 8;
/** Per-file ceiling before processing, so a 40 MB PDF fails fast and clearly. */
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
/** Combined ceiling after processing — must stay under the server action limit. */
export const MAX_TOTAL_BYTES = 10 * 1024 * 1024;

/** Long enough for small print to survive; short enough to keep the upload sane. */
const MAX_IMAGE_DIMENSION = 2200;
const IMAGE_QUALITY = 0.85;

export interface PreparedUpload {
  name: string;
  mimeType: string;
  /** Base64 without the `data:` prefix. */
  data: string;
  /** Decoded size, for the combined-size check. */
  bytes: number;
  /** Object URL for the thumbnail; revoke when the sheet closes. */
  previewUrl: string | null;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

function splitDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const [header, payload = ""] = dataUrl.split(",");
  const match = /^data:([^;]+)/.exec(header ?? "");
  return { mimeType: match?.[1] ?? "application/octet-stream", data: payload };
}

function decodedBytes(base64: string): number {
  return Math.floor((base64.length * 3) / 4);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Square dish thumb for the review / edit sheets — small enough for data URLs. */
const THUMB_SIZE = 512;
const THUMB_QUALITY = 0.78;

/**
 * Resize a photo into a square JPEG data URL for a menu dish card.
 * Returns the full `data:image/jpeg;base64,…` string.
 */
export async function prepareDishThumbnail(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose a photo (JPEG, PNG, or WebP).");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error(`That photo is over ${formatBytes(MAX_SOURCE_BYTES)}.`);
  }

  const dataUrl = await readAsDataUrl(file);
  return compressDishDataUrl(dataUrl);
}

/**
 * Squash an AI (or camera) image into a menu-card JPEG. Gemini often returns
 * multi-MB PNGs that blow past the request body limit — this keeps them small.
 */
export async function compressDishDataUrl(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl);
  const { naturalWidth: width, naturalHeight: height } = img;
  if (!width || !height) throw new Error("Couldn't read that photo.");

  const side = Math.min(width, height);
  const sx = Math.floor((width - side) / 2);
  const sy = Math.floor((height - side) / 2);
  const canvas = document.createElement("canvas");
  canvas.width = THUMB_SIZE;
  canvas.height = THUMB_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't process that photo.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, THUMB_SIZE, THUMB_SIZE);
  ctx.drawImage(img, sx, sy, side, side, 0, 0, THUMB_SIZE, THUMB_SIZE);

  let quality = THUMB_QUALITY;
  let out = canvas.toDataURL("image/jpeg", quality);
  // If still huge (rare), step quality down until it fits a single dish save.
  while (out.length > 180_000 && quality > 0.45) {
    quality -= 0.08;
    out = canvas.toDataURL("image/jpeg", quality);
  }
  return out;
}

export async function prepareUpload(file: File): Promise<PreparedUpload> {
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error(`${file.name} is over ${formatBytes(MAX_SOURCE_BYTES)}.`);
  }

  const dataUrl = await readAsDataUrl(file);

  if (file.type === "application/pdf") {
    const { data } = splitDataUrl(dataUrl);
    return {
      name: file.name,
      mimeType: "application/pdf",
      data,
      bytes: decodedBytes(data),
      previewUrl: null,
    };
  }

  try {
    const img = await loadImage(dataUrl);
    const { naturalWidth: width, naturalHeight: height } = img;
    if (!width || !height) throw new Error("empty image");

    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas context");

    // Menus are often photographed on a dark table; a white backdrop keeps
    // transparent PNG exports readable once flattened to JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const { mimeType, data } = splitDataUrl(canvas.toDataURL("image/jpeg", IMAGE_QUALITY));
    return {
      name: file.name,
      mimeType,
      data,
      bytes: decodedBytes(data),
      previewUrl: URL.createObjectURL(file),
    };
  } catch {
    // HEIC and friends that the browser can't rasterize still go up as-is;
    // Gemini reads those formats directly.
    const { mimeType, data } = splitDataUrl(dataUrl);
    return {
      name: file.name,
      mimeType,
      data,
      bytes: decodedBytes(data),
      previewUrl: null,
    };
  }
}
