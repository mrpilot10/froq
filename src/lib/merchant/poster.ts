import path from "node:path";
import sharp from "sharp";
import QRCode from "qrcode";

/**
 * Server-side QR poster generation. The QR code is rendered on demand and
 * composited onto the shipped template — nothing is persisted to storage.
 *
 * The template (`public/posters/default-poster.png`) is 721×1024 and contains a
 * light-green square (≈ x:168–552, y:423–789) where the QR belongs. We size the
 * QR to sit centered inside that square with a comfortable quiet zone so it
 * stays scannable while preserving every existing design element.
 */
const TEMPLATE_PATH = path.join(process.cwd(), "public", "posters", "default-poster.png");

const QR_SIZE = 260;

// Centered inside the template's light-green square (center ≈ 360, 606).
export const QR_AREA = {
  x: Math.round(360 - QR_SIZE / 2),
  y: Math.round(606 - QR_SIZE / 2),
  width: QR_SIZE,
  height: QR_SIZE,
} as const;

export async function generatePoster(loyaltyUrl: string): Promise<Buffer> {
  const url = loyaltyUrl?.trim();
  if (!url) throw new Error("A loyalty URL is required to generate the poster.");

  const qrBuffer = await QRCode.toBuffer(url, {
    width: QR_AREA.width,
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: "#0a0a0a", light: "#ffffff" },
  });

  return sharp(TEMPLATE_PATH)
    .composite([
      {
        input: qrBuffer,
        left: QR_AREA.x,
        top: QR_AREA.y,
      },
    ])
    .png()
    .toBuffer();
}
