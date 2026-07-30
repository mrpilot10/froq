"use client";

import { useEffect, useState } from "react";
import { Toaster } from "sonner";

type ToastPosition = "bottom-center" | "bottom-right";

/**
 * Mobile: centered above the thumb zone.
 * Desktop: bottom-right so toasts don't cover the main content column.
 */
export function AppToaster() {
  const [position, setPosition] = useState<ToastPosition>("bottom-center");

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const sync = () => setPosition(media.matches ? "bottom-right" : "bottom-center");
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return <Toaster position={position} toastOptions={{ className: "froq-toast" }} />;
}
