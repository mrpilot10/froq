"use client";

import { useEffect } from "react";

/**
 * Applies a merchant's brand color to the customer-facing UI by overriding the
 * `--brand` custom property on the document root. The darker shades
 * (`--brand-dark`, `--brand-deep`) derive from it in CSS, and because the
 * property is set on the root it also reaches portaled overlays (bottom sheets).
 */
export function useBrandTheme(color?: string | null) {
  useEffect(() => {
    if (!color) return;
    const root = document.documentElement;
    const previous = root.style.getPropertyValue("--brand");
    root.style.setProperty("--brand", color);
    return () => {
      if (previous) root.style.setProperty("--brand", previous);
      else root.style.removeProperty("--brand");
    };
  }, [color]);
}
