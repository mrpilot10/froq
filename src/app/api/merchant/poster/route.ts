import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPublicAppOrigin } from "@/lib/app-url";
import { resolveMerchantId } from "@/lib/merchant/server-context";
import { generatePoster, posterAvailableFor } from "@/lib/merchant/poster";
import type { MerchantProduct } from "@/lib/merchant/types";

export const runtime = "nodejs";
export const maxDuration = 30;

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseProduct(raw: string | null): MerchantProduct {
  if (
    raw === "queue" ||
    raw === "reservation" ||
    raw === "loyalty" ||
    raw === "menu"
  ) {
    return raw;
  }
  return "loyalty";
}

function joinUrlFor(slug: string, product: MerchantProduct, branchSlug?: string | null) {
  const origin = getPublicAppOrigin();
  const path =
    product === "queue"
      ? `/queue/${slug}`
      : product === "reservation"
        ? `/r/${slug}`
        : product === "menu"
          ? `/menu/${slug}`
          : `/join/${slug}`;
  const query = branchSlug ? `?b=${encodeURIComponent(branchSlug)}` : "";
  return `${origin}${path}${query}`;
}

export async function GET(request: NextRequest) {
  try {
    const product = parseProduct(request.nextUrl.searchParams.get("product"));
    const branchSlug =
      request.nextUrl.searchParams.get("branch")?.trim() ||
      request.nextUrl.searchParams.get("b")?.trim() ||
      null;
    if (!posterAvailableFor(product)) {
      return NextResponse.json(
        { error: "Poster is not available for this product." },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    // Owners and invited teammates (staff/managers) both resolve via membership.
    const merchantId = await resolveMerchantId(supabase, user.id);
    if (!merchantId) {
      return NextResponse.json({ error: "Merchant account not found." }, { status: 404 });
    }

    const { data: merchant } = await supabase
      .from("merchants")
      .select("slug, business_name")
      .eq("id", merchantId)
      .maybeSingle();
    if (!merchant) {
      return NextResponse.json({ error: "Merchant account not found." }, { status: 404 });
    }

    const slug = merchant.slug || slugify(merchant.business_name ?? "") || "shop";
    const joinUrl = joinUrlFor(slug, product, branchSlug);
    const poster = await generatePoster(joinUrl, product);

    // Copy into a clean ArrayBuffer-backed view so the PNG is streamed byte-for
    // byte; handing a Node Buffer straight to the Web Response can truncate it
    // and produce a "broken image".
    const body = new Uint8Array(poster);
    const stem =
      product === "queue"
        ? "queue-qr-poster"
        : product === "reservation"
          ? "reservation-qr-poster"
          : product === "menu"
            ? "menu-qr-poster"
            : "qr-poster";

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(body.byteLength),
        "Content-Disposition": `attachment; filename="${slug}-${stem}.png"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not generate the poster.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
