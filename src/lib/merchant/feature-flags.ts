/**
 * Build-time feature flags. `NEXT_PUBLIC_*` values are inlined at build, so the
 * same answer is given on the server and in the browser.
 */

/**
 * AI Menu is still being built. While this is off the product is absent from the
 * rail, its routes 404, and it stays a coming-soon tile.
 */
export const MENU_PREVIEW = process.env.NEXT_PUBLIC_MENU_PREVIEW === "true";
