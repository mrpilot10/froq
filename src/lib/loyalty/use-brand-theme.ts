"use client";

import { useEffect } from "react";

/**
 * Returns a readable foreground color (`#fff` or a near-black ink) for text/icons
 * placed on top of the given brand color, using WCAG relative luminance.
 */
function onBrandColor(hex: string): string {
  const raw = hex.replace("#", "").trim();
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return "#ffffff";

  const channel = (start: number) => {
    const v = parseInt(full.slice(start, start + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);

  // Light brand → dark text, dark brand → white text.
  return luminance > 0.5 ? "#1b1b1d" : "#ffffff";
}

/**
 * Applies a merchant's brand color to the customer-facing UI by overriding the
 * `--brand` custom property on the document root. The darker shades
 * (`--brand-dark`, `--brand-deep`) derive from it in CSS, and because the
 * property is set on the root it also reaches portaled overlays (bottom sheets).
 *
 * Also sets `--on-brand`: a contrast-aware foreground color for text/icons that
 * sit on a brand-colored background, so they stay legible on dark or light brands.
 */
export function useBrandTheme(color?: string | null) {
  useEffect(() => {
    if (!color) return;
    const root = document.documentElement;
    const previousBrand = root.style.getPropertyValue("--brand");
    const previousOnBrand = root.style.getPropertyValue("--on-brand");
    root.style.setProperty("--brand", color);
    root.style.setProperty("--on-brand", onBrandColor(color));
    return () => {
      if (previousBrand) root.style.setProperty("--brand", previousBrand);
      else root.style.removeProperty("--brand");
      if (previousOnBrand) root.style.setProperty("--on-brand", previousOnBrand);
      else root.style.removeProperty("--on-brand");
    };
  }, [color]);
}
