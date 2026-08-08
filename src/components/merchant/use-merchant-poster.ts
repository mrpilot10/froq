"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MerchantProduct } from "@/lib/merchant/types";

/**
 * Fetches the merchant's QR poster (generated server-side) once, keeps a blob
 * object URL for preview, and reuses the same blob for download so we never
 * hit the endpoint twice. The object URL is revoked on unmount / reload.
 */
export function useMerchantPoster(
  product: MerchantProduct = "loyalty",
  branchSlug?: string | null,
) {
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ product });
      if (branchSlug) params.set("branch", branchSlug);
      const res = await fetch(`/api/merchant/poster?${params}`, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Could not generate the poster.");
      }
      const blob = await res.blob();
      const next = URL.createObjectURL(blob);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = next;
      setPosterUrl(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate the poster.");
    } finally {
      setIsLoading(false);
    }
  }, [product, branchSlug]);

  useEffect(() => {
    void load();
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [load]);

  const download = useCallback(() => {
    if (!posterUrl) return;
    const link = document.createElement("a");
    link.href = posterUrl;
    link.download =
      product === "queue"
        ? "queue-qr-poster.png"
        : product === "reservation"
          ? "reservation-qr-poster.png"
          : product === "menu"
            ? "menu-qr-poster.png"
            : "qr-poster.png";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, [posterUrl, product]);

  return { posterUrl, isLoading, error, download, reload: load };
}
