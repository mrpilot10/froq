"use client";

import { useLayoutEffect } from "react";
import {
  brandRootCss,
  onBrandColor,
  sanitizeBrandColor,
} from "@/lib/loyalty/brand-theme";

/**
 * Applies a merchant's brand colour before paint.
 *
 * 1. A `<style>` tag ships in the HTML so the first frame is never Froq-green.
 * 2. `useLayoutEffect` mirrors the same vars onto `documentElement` for portaled
 *    overlays (bottom sheets) and cleans up when the guest leaves the page.
 *
 * `--brand-dark` / `--brand-deep` stay derived in CSS via `color-mix`.
 */
export function BrandTheme({ color }: { color?: string | null }) {
  const safe = sanitizeBrandColor(color);
  const css = brandRootCss(safe);

  useLayoutEffect(() => {
    if (!safe) return;
    const root = document.documentElement;
    const previousBrand = root.style.getPropertyValue("--brand");
    const previousOnBrand = root.style.getPropertyValue("--on-brand");
    root.style.setProperty("--brand", safe);
    root.style.setProperty("--on-brand", onBrandColor(safe));
    return () => {
      if (previousBrand) root.style.setProperty("--brand", previousBrand);
      else root.style.removeProperty("--brand");
      if (previousOnBrand) root.style.setProperty("--on-brand", previousOnBrand);
      else root.style.removeProperty("--on-brand");
    };
  }, [safe]);

  if (!css) return null;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

/**
 * @deprecated Prefer `<BrandTheme color={…} />` — the hook alone paints after
 * hydration and flashes the default green.
 */
export function useBrandTheme(color?: string | null) {
  const safe = sanitizeBrandColor(color);
  useLayoutEffect(() => {
    if (!safe) return;
    const root = document.documentElement;
    const previousBrand = root.style.getPropertyValue("--brand");
    const previousOnBrand = root.style.getPropertyValue("--on-brand");
    root.style.setProperty("--brand", safe);
    root.style.setProperty("--on-brand", onBrandColor(safe));
    return () => {
      if (previousBrand) root.style.setProperty("--brand", previousBrand);
      else root.style.removeProperty("--brand");
      if (previousOnBrand) root.style.setProperty("--on-brand", previousOnBrand);
      else root.style.removeProperty("--on-brand");
    };
  }, [safe]);
}
