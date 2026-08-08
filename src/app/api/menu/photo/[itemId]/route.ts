import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

/**
 * Serves a published dish photo without embedding the data URL in the HTML.
 * Guest menu pages link here so a 40-dish menu doesn't ship megabytes of base64.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await context.params;
  if (!itemId || !/^[0-9a-f-]{36}$/i.test(itemId)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("menu_items")
    .select("image_url, status, is_available")
    .eq("id", itemId)
    .maybeSingle();

  if (!data?.image_url || data.status !== "live" || !data.is_available) {
    return new NextResponse("Not found", { status: 404 });
  }

  const url = data.image_url;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return NextResponse.redirect(url, 302);
  }

  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(url);
  if (!match) {
    return new NextResponse("Not found", { status: 404 });
  }

  const mime = match[1];
  const bytes = Buffer.from(match[2], "base64");
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
