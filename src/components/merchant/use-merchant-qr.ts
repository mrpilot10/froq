"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import type { MerchantProduct, MerchantProfile } from "@/lib/merchant/types";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Origin baked into downloadable / printable merchant QRs.
 * Never localhost — a printed code must keep working after the merchant leaves
 * the laptop that generated it.
 */
function merchantQrOrigin(): string {
  const configured = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    ""
  )
    .trim()
    .replace(/\/$/, "");
  if (configured && !/localhost|127\.0\.0\.1/i.test(configured)) {
    return /^https?:\/\//i.test(configured) ? configured : `https://${configured}`;
  }
  return "https://froq.io";
}

/** Absolute join URL encoded into the QR (and used by Open / Copy). */
export function joinUrlFor(
  profile: MerchantProfile,
  product: MerchantProduct = "loyalty",
  branchSlug?: string | null,
) {
  const slug = profile.slug || slugify(profile.businessName) || "shop";
  const path =
    product === "queue"
      ? `/queue/${slug}`
      : product === "reservation"
        ? `/r/${slug}`
        : `/join/${slug}`;
  const query = branchSlug ? `?b=${encodeURIComponent(branchSlug)}` : "";
  return `${merchantQrOrigin()}${path}${query}`;
}

/** Merchant-facing chip text: `froq.io/join/meer-s-cafe` (no scheme). */
export function displayJoinUrl(absoluteUrl: string): string {
  return absoluteUrl.replace(/^https?:\/\//i, "");
}

export function useMerchantQr(
  profile: MerchantProfile,
  product: MerchantProduct = "loyalty",
  branchSlug?: string | null,
) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const joinUrl = joinUrlFor(profile, product, branchSlug);
  const displayUrl = displayJoinUrl(joinUrl);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(joinUrl, {
      margin: 1,
      width: 640,
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((url) => {
        if (active) setQrUrl(url);
      })
      .catch(() => {
        if (active) setQrUrl(null);
      });
    return () => {
      active = false;
    };
  }, [joinUrl]);

  const fileStem = `${slugify(profile.businessName || "froq") || "froq"}-${
    product === "queue"
      ? "queue-qr"
      : product === "reservation"
        ? "reservation-qr"
        : "loyalty-qr"
  }`;

  const download = useCallback(() => {
    if (!qrUrl) return;
    const link = document.createElement("a");
    link.href = qrUrl;
    link.download = `${fileStem}.png`;
    link.click();
  }, [qrUrl, fileStem]);

  /** Opens a minimal print sheet with the QR — works for every product. */
  const print = useCallback(() => {
    if (!qrUrl) return;
    const title = profile.businessName || "Froq";
    const popup = window.open("", "_blank", "noopener,noreferrer,width=480,height=720");
    if (!popup) return;

    const doc = popup.document;
    doc.title = `${title} QR`;

    const style = doc.createElement("style");
    style.textContent = `
      @page { margin: 16mm; }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: system-ui, -apple-system, sans-serif;
        color: #0f1c18;
      }
      .sheet { text-align: center; max-width: 360px; padding: 24px; }
      h1 { font-size: 20px; font-weight: 700; margin: 0 0 6px; }
      p { font-size: 13px; color: #5b6b66; margin: 0 0 18px; word-break: break-all; }
      img { width: 280px; height: 280px; image-rendering: pixelated; }
    `;
    doc.head.appendChild(style);

    const sheet = doc.createElement("div");
    sheet.className = "sheet";
    const heading = doc.createElement("h1");
    heading.textContent = title;
    const urlLine = doc.createElement("p");
    urlLine.textContent = displayUrl;
    const image = doc.createElement("img");
    image.src = qrUrl;
    image.alt = "QR code";
    image.width = 280;
    image.height = 280;
    sheet.append(heading, urlLine, image);
    doc.body.appendChild(sheet);

    popup.focus();
    // Let the image settle before the print dialog.
    window.setTimeout(() => {
      try {
        popup.print();
      } catch {
        /* popup may be closed by the user */
      }
    }, 250);
  }, [qrUrl, profile.businessName, displayUrl]);

  return { qrUrl, joinUrl, displayUrl, download, print };
}
