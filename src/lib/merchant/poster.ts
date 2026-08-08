import "server-only";

import path from "node:path";
import sharp from "sharp";
import QRCode from "qrcode";
import type { MerchantProduct } from "@/lib/merchant/types";
import { posterAvailableFor } from "@/lib/merchant/poster-availability";

export { posterAvailableFor };

/**
 * Server-side QR poster generation. The QR code is rendered on demand and
 * composited onto the shipped template — nothing is persisted to storage.
 *
 * Loyalty, queue, reservation and menu posters share the same phone-frame
 * layout (≈723×1024) with a mint square ≈ x:168–552, y:423–789 where the QR
 * belongs. Templates: `default-poster.png`, `queue-poster.png`,
 * `reservation-poster.png`, `menu-poster.png`.
 * We size the QR to sit centered inside that square with a comfortable quiet
 * zone so it stays scannable while preserving every existing design element.
 */
const TEMPLATES: Partial<Record<MerchantProduct, string>> = {
  loyalty: path.join(process.cwd(), "public", "posters", "default-poster.png"),
  queue: path.join(process.cwd(), "public", "posters", "queue-poster.png"),
  reservation: path.join(process.cwd(), "public", "posters", "reservation-poster.png"),
  menu: path.join(process.cwd(), "public", "posters", "menu-poster.png"),
};

const QR_SIZE = 260;

// Centered inside the template's light-green square (center ≈ 360, 606).
export const QR_AREA = {
  x: Math.round(360 - QR_SIZE / 2),
  y: Math.round(606 - QR_SIZE / 2),
  width: QR_SIZE,
  height: QR_SIZE,
} as const;

export async function generatePoster(
  joinUrl: string,
  product: MerchantProduct = "loyalty",
): Promise<Buffer> {
  const url = joinUrl?.trim();
  if (!url) throw new Error("A join URL is required to generate the poster.");

  const templatePath = TEMPLATES[product];
  if (!templatePath || !posterAvailableFor(product)) {
    throw new Error(`No poster template for product "${product}".`);
  }

  const qrBuffer = await QRCode.toBuffer(url, {
    width: QR_AREA.width,
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: "#0a0a0a", light: "#ffffff" },
  });

  return sharp(templatePath)
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
