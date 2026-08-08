import { notFound, redirect } from "next/navigation";
import { isCustomerPublicToken } from "@/lib/customer/hub";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * WhatsApp Menu CTA destination — Meta: https://froq.io/m/{{1}}
 * {{1}} = customer publicToken (frq_…). Redirects to the merchant AI Menu
 * with ?guest= so verify is skipped for queue guests.
 */
export default async function MenuGuestRedirectPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: raw } = await params;
  const token = decodeURIComponent(raw ?? "").trim();
  if (!isCustomerPublicToken(token)) notFound();

  const admin = createAdminClient();
  const { data: customer } = await admin
    .from("customers")
    .select("merchant_id")
    .eq("public_token", token)
    .maybeSingle();
  if (!customer?.merchant_id) notFound();

  const { data: merchant } = await admin
    .from("merchants")
    .select("slug")
    .eq("id", customer.merchant_id)
    .maybeSingle();
  if (!merchant?.slug) notFound();

  redirect(
    `/menu/${encodeURIComponent(merchant.slug)}?guest=${encodeURIComponent(token)}`,
  );
}
