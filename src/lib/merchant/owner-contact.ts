import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type MerchantOwnerContact = {
  merchantId: string;
  businessName: string;
  email: string;
  name: string | null;
};

/**
 * Owner inbox for billing / capacity emails. Prefers `merchants.email`, then
 * the owner member row, then Auth Admin for `owner_user_id`.
 */
export async function resolveMerchantOwnerContact(
  merchantId: string,
): Promise<MerchantOwnerContact | null> {
  const admin = createAdminClient();
  const { data: merchant } = await admin
    .from("merchants")
    .select("id, business_name, email, owner_user_id")
    .eq("id", merchantId)
    .maybeSingle();
  if (!merchant) return null;

  const businessName =
    typeof merchant.business_name === "string" && merchant.business_name.trim()
      ? merchant.business_name.trim()
      : "your business";

  let email =
    typeof merchant.email === "string" ? merchant.email.trim().toLowerCase() : "";
  let name: string | null = null;

  if (!email || !name) {
    const { data: ownerMember } = await admin
      .from("merchant_members")
      .select("email, name")
      .eq("merchant_id", merchantId)
      .eq("user_id", merchant.owner_user_id)
      .maybeSingle();
    if (!email && typeof ownerMember?.email === "string") {
      email = ownerMember.email.trim().toLowerCase();
    }
    if (typeof ownerMember?.name === "string" && ownerMember.name.trim()) {
      name = ownerMember.name.trim();
    }
  }

  if (!email && typeof merchant.owner_user_id === "string") {
    try {
      const { data } = await admin.auth.admin.getUserById(merchant.owner_user_id);
      const authEmail = data.user?.email?.trim().toLowerCase() ?? "";
      if (authEmail) email = authEmail;
      const metaName =
        typeof data.user?.user_metadata?.full_name === "string"
          ? data.user.user_metadata.full_name.trim()
          : typeof data.user?.user_metadata?.name === "string"
            ? data.user.user_metadata.name.trim()
            : "";
      if (!name && metaName) name = metaName;
    } catch {
      // Auth lookup is best-effort — skip if Admin API unavailable.
    }
  }

  if (!email || !email.includes("@")) return null;
  return {
    merchantId: merchant.id as string,
    businessName,
    email,
    name,
  };
}
