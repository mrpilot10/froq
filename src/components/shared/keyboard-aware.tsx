"use client";

import { useEffect } from "react";

const FIELD_SELECTOR = "input, textarea, select";

/**
 * Keeps the focused form field visible when the mobile keyboard opens. Paired
 * with `interactiveWidget: "resizes-content"`, this scrolls the active field
 * into the centre of the shrunken viewport so it's never hidden behind the
 * keyboard. Mounted once globally.
 */
export function KeyboardAware() {
  useEffect(() => {
    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || !target.matches?.(FIELD_SELECTOR)) return;
      // Defer until the keyboard has begun resizing the viewport.
      window.setTimeout(() => {
        target.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 250);
    };

    document.addEventListener("focusin", handleFocusIn);
    return () => document.removeEventListener("focusin", handleFocusIn);
  }, []);

  return null;
}
