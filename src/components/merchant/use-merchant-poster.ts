"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Fetches the merchant's QR poster (generated server-side) once, keeps a blob
 * object URL for preview, and reuses the same blob for download so we never
 * hit the endpoint twice. The object URL is revoked on unmount / reload.
 */
export function useMerchantPoster() {
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/merchant/poster", { cache: "no-store" });
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
  }, []);

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
    link.download = "qr-poster.png";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, [posterUrl]);

  return { posterUrl, isLoading, error, download, reload: load };
}
