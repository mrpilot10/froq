import { resolveMenuPage } from "@/app/menu/actions";
import { isCustomerPublicToken } from "@/lib/customer/hub";
import {
  GUEST_MENU_PROPS,
  GUEST_MENU_TEMPLATE,
} from "@/lib/menu/guest-app/bundle.generated";
import { buildGuestMenuApp } from "@/lib/menu/guest-app/data";
import { renderSpecialOffersSheet } from "@/lib/menu/guest-app/special-offers-sheet";
import { guestCookieHeader } from "@/lib/menu/ai-replies";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Public destination for the Menu QR / Open Menu link.
 * `/menu/{slug}` · optional `?b=` branch · optional `?t=` table number.
 *
 * The page is the AI Menu design artifact served verbatim: its own template
 * runtime, fonts and React, with the merchant's live dishes handed over in
 * `window.__FROQ_MENU__`. That is why this is a route handler and not a page —
 * the artifact owns the whole document, so nothing from the app shell applies.
 */

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** A literal `</script>` inside inline JSON would close the block early. */
function inlineJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function notFound(): Response {
  const body = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Menu not found</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#F5F7F5;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#0C1A14}
div{text-align:center;padding:24px}p{color:#5A6E62;margin:8px 0 0}</style></head>
<body><div><strong>Menu not found</strong><p>This menu link is invalid or has been removed.</p></div></body></html>`;
  return new Response(body, {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const url = new URL(request.url);
  // The whole page is rendered in the guest's language rather than swapped in
  // the browser, so nothing can be left behind in English. Picking a language
  // reloads with `?lang=`.
  const resolved = await resolveMenuPage(
    slug,
    url.searchParams.get("b"),
    url.searchParams.get("t"),
    url.searchParams.get("lang"),
  );
  if (!resolved.ok) return notFound();

  const { page } = resolved;
  const guestTokenRaw = (url.searchParams.get("guest") ?? "").trim();
  let skipVerifyToken: string | null = null;
  if (guestTokenRaw && isCustomerPublicToken(guestTokenRaw)) {
    const admin = createAdminClient();
    const { data: guestCustomer } = await admin
      .from("customers")
      .select("id, merchant_id")
      .eq("public_token", guestTokenRaw)
      .maybeSingle();
    if (guestCustomer?.merchant_id === page.merchantId) {
      skipVerifyToken = guestTokenRaw;
    }
  }

  const app = buildGuestMenuApp({
    slug: page.merchant.slug,
    branchSlug: url.searchParams.get("b"),
    businessName: page.merchant.businessName,
    brandColor: page.merchant.brandColor,
    logoUrl: page.merchant.logoUrl,
    tableNumber: page.tableNumber,
    categories: page.categories,
    recentOrders: page.recentOrders,
    openTime: page.openTime,
    closeTime: page.closeTime,
    socialLinks: page.merchant.socialLinks,
    loyalty: page.loyalty,
    offers: page.offers,
    tax: page.tax,
    lang: page.lang,
    englishNames: page.englishNames,
  });

  // The artifact reads its own prop defaults out of `data-props`, so the
  // merchant's values go in as the new defaults rather than as overrides.
  const props: Record<string, unknown> = {};
  for (const [key, meta] of Object.entries(GUEST_MENU_PROPS)) {
    props[key] = key in app.props ? { ...meta, default: app.props[key] } : meta;
  }
  // Extra props the artifact does not declare (logo, etc.) still need a default
  // slot so SoftUI exposes them on `this.props`.
  for (const [key, value] of Object.entries(app.props)) {
    if (!(key in props)) props[key] = { default: value };
  }

  const title = `${page.merchant.businessName} — Menu`;
  const head = [
    `<title>${escapeText(title)}</title>`,
    `<meta name="description" content="${escapeAttribute(
      `Browse the menu at ${page.merchant.businessName}.`,
    )}">`,
    `<meta name="theme-color" content="${escapeAttribute(String(app.props.accent))}">`,
    `<script>window.__FROQ_MENU__=${inlineJson(app.data)};</script>`,
  ].join("");

  const offersSheet = renderSpecialOffersSheet({
    slug: page.merchant.slug,
    branchId: page.branchId,
    tableNumber: page.tableNumber,
    businessName: page.merchant.businessName,
    accent: String(app.props.accent ?? "#16593F"),
    delayMs: 400,
    skipVerifyToken,
  });

  const html = GUEST_MENU_TEMPLATE.replace("__FROQ_PROPS__", () =>
    escapeAttribute(JSON.stringify(props)),
  )
    .replace("<!--FROQ_HEAD-->", () => head)
    .replace("</body>", `${offersSheet}</body>`);

  const headers = new Headers({
    "content-type": "text/html; charset=utf-8",
    // Menus change when the merchant publishes, so never hand back a stale one.
    "cache-control": "no-store",
    // Mic for Need something? voice questions (Chrome / Safari SpeechRecognition).
    "permissions-policy": "microphone=(self)",
  });
  // Queue guests reuse the same publicToken for AI reply rate limits / identity.
  if (skipVerifyToken) {
    headers.append("set-cookie", guestCookieHeader(skipVerifyToken));
  }

  return new Response(html, { headers });
}
