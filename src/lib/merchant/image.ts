// Client-side logo processing. Logos are stored inline as data URLs on the
// merchant row, so we downscale + recompress before upload to keep the payload
// well under the server-action body size limit (and keep public reads fast).

const MAX_LOGO_DIMENSION = 256;
const WEBP_QUALITY = 0.9;

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

/**
 * Reads a logo file and returns a downscaled data URL (max 256px on the longest
 * edge, WebP when supported). Falls back to the original data URL if the browser
 * cannot rasterize the source (e.g. some SVGs).
 */
export async function fileToLogoDataUrl(file: File): Promise<string> {
  const originalDataUrl = await readAsDataUrl(file);

  try {
    const img = await loadImage(originalDataUrl);
    const { naturalWidth: width, naturalHeight: height } = img;
    if (!width || !height) return originalDataUrl;

    const scale = Math.min(1, MAX_LOGO_DIMENSION / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return originalDataUrl;

    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const webp = canvas.toDataURL("image/webp", WEBP_QUALITY);
    if (webp.startsWith("data:image/webp")) return webp;
    return canvas.toDataURL("image/png");
  } catch {
    return originalDataUrl;
  }
}
