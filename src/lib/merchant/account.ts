import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * True when this auth user belongs in the merchant dashboard — they own a store,
 * or they paid and are mid-onboarding.
 *
 * Froq's merchant and customer dashboards share one auth pool, so every merchant
 * sign-in path (password and Google) has to check this before letting a session
 * into /merchant.
 */
export async function userIsMerchantAccount(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  // limit(1): owning more than one store must not error out and read as "not a
  // merchant", which would lock the owner out of sign-in entirely.
  const { data: merchant } = await admin
    .from("merchants")
    .select("id")
    .eq("owner_user_id", userId)
    .limit(1)
    .maybeSingle();
  if (merchant) return true;

  const { data: userRes } = await admin.auth.admin.getUserById(userId);
  if (userRes?.user?.app_metadata?.merchant_onboarding === true) return true;

  // Staff invited to someone else's store.
  const { data: member } = await admin
    .from("merchant_members")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return member != null;
}
