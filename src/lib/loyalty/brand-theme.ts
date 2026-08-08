/**
 * Merchant brand tokens for guest pages.
 *
 * The default `:root --brand` in globals.css is Froq green. Guest pages used to
 * override it in a client useEffect — so the first paint was always green.
 * These helpers let the server emit the merchant colour in the HTML itself.
 */

/** Hex `#RGB` / `#RRGGBB` only — anything else is discarded, never written into CSS. */
export function sanitizeBrandColor(color?: string | null): string | null {
  if (!color) return null;
  const trimmed = color.trim();
  const match = trimmed.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!match) return null;

  const raw = match[1];
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  return `#${full.toLowerCase()}`;
}

/**
 * Readable foreground (`#fff` or near-black) for text/icons on the brand fill,
 * using WCAG relative luminance.
 */
export function onBrandColor(hex: string): string {
  const full = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return "#ffffff";

  const channel = (start: number) => {
    const v = parseInt(full.slice(start, start + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);

  return luminance > 0.5 ? "#1b1b1d" : "#ffffff";
}

/** CSS to stamp on `:root` before first paint — override the Froq-green default. */
export function brandRootCss(color?: string | null): string | null {
  const safe = sanitizeBrandColor(color);
  if (!safe) return null;
  return `:root{--brand:${safe};--on-brand:${onBrandColor(safe)};}`;
}
