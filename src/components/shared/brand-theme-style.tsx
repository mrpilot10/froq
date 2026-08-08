import { brandRootCss } from "@/lib/loyalty/brand-theme";

/**
 * Server-side brand paint. Render this as the first child of a public page so
 * the merchant colour lands in the HTML stream before any guest shell that
 * reads `--brand` — no Froq-green flash.
 */
export function BrandThemeStyle({ color }: { color?: string | null }) {
  const css = brandRootCss(color);
  if (!css) return null;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
