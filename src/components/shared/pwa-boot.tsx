"use client";

import { useEffect } from "react";

/**
 * Loads the PWA boot script once on the client (no React <script> render).
 * Captures beforeinstallprompt + registers /sw.js.
 */
export function PwaBoot() {
  useEffect(() => {
    const existing = document.querySelector('script[data-froq-pwa-boot="1"]');
    if (existing) return;

    const script = document.createElement("script");
    script.src = "/froq-pwa-boot.js";
    script.async = false;
    script.dataset.froqPwaBoot = "1";
    document.head.appendChild(script);
  }, []);

  return null;
}
