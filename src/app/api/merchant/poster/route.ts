import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPublicAppOrigin } from "@/lib/app-url";
import { resolveMerchantId } from "@/lib/merchant/server-context";
import { generatePoster } from "@/lib/merchant/poster";

export const runtime = "nodejs";
export const maxDuration = 30;

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function loyaltyUrlFor(slug: string) {
  return `${getPublicAppOrigin()}/join/${slug}`;
}

export async function GET() {
  try {
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
    const loyaltyUrl = loyaltyUrlFor(slug);
    const poster = await generatePoster(loyaltyUrl);

    // Copy into a clean ArrayBuffer-backed view so the PNG is streamed byte-for
    // byte; handing a Node Buffer straight to the Web Response can truncate it
    // and produce a "broken image".
    const body = new Uint8Array(poster);

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(body.byteLength),
        "Content-Disposition": `attachment; filename="${slug}-qr-poster.png"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not generate the poster.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
