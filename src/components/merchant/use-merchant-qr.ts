"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import type { MerchantProfile } from "@/lib/merchant/types";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function joinUrlFor(profile: MerchantProfile) {
  const slug = profile.slug || slugify(profile.businessName) || "shop";
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (typeof window !== "undefined" ? window.location.origin : "https://froq.io");
  return `${base.replace(/\/$/, "")}/join/${slug}`;
}

export function useMerchantQr(profile: MerchantProfile) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const joinUrl = joinUrlFor(profile);

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
    link.download = `${slugify(profile.businessName || "froq") || "froq"}-loyalty-qr.png`;
    link.click();
  }, [qrUrl, profile.businessName]);

  return { qrUrl, joinUrl, download };
}
