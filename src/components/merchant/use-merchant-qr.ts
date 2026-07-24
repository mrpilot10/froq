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

export function joinUrlFor(
  profile: MerchantProfile,
  product: MerchantProduct = "loyalty",
  branchSlug?: string | null,
) {
  // Merchant acquisition QR: new customers have no publicToken yet, so they
  // join via /join/{slug} (or /queue/{slug}). After join they land on
  // /c/{publicToken} — the permanent customer hub for that relationship.
  const slug = profile.slug || slugify(profile.businessName) || "shop";
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (typeof window !== "undefined" ? window.location.origin : "https://froq.io");
  const path = product === "queue" ? `/queue/${slug}` : `/join/${slug}`;
  const query = branchSlug ? `?b=${encodeURIComponent(branchSlug)}` : "";
  return `${base.replace(/\/$/, "")}${path}${query}`;
}

export function useMerchantQr(
  profile: MerchantProfile,
  product: MerchantProduct = "loyalty",
  branchSlug?: string | null,
) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const joinUrl = joinUrlFor(profile, product, branchSlug);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(joinUrl, {
      margin: 1,
      width: 520,
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

  const download = useCallback(() => {
    if (!qrUrl) return;
    const link = document.createElement("a");
    link.href = qrUrl;
    const suffix = product === "queue" ? "queue-qr" : "loyalty-qr";
    link.download = `${slugify(profile.businessName || "froq") || "froq"}-${suffix}.png`;
    link.click();
  }, [qrUrl, profile.businessName, product]);

  return { qrUrl, joinUrl, download };
}
