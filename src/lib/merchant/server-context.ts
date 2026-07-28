import "server-only";

import { createClient } from "@/lib/supabase/server";
import { normalizeMemberRole } from "./roles";
import type { MemberRole } from "./types";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export async function resolveMerchantId(
  supabase: ServerClient,
  userId: string,
): Promise<string | null> {
  // Owned wins if the user also has a membership elsewhere (same as actions.ts).
  const [ownedRes, membershipRes] = await Promise.all([
    supabase.from("merchants").select("id").eq("owner_user_id", userId).maybeSingle(),
    supabase
      .from("merchant_members")
      .select("merchant_id")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (ownedRes.data?.id) return ownedRes.data.id;
  return membershipRes.data?.merchant_id ?? null;
}

/** First non-empty display name from the candidates, or null. */
function pickName(...candidates: (string | null | undefined)[]): string | null {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

export type MerchantContext =
  | {
      ok: true;
      merchantId: string;
      role: MemberRole;
      userId: string;
      /** Display name for audit trails; null when the profile has no name yet. */
      actorName: string | null;
    }
  | { ok: false; error: string };

/**
 * Auth → merchant + role for product server actions. Reads run on the
 * user-scoped client so RLS still applies to the lookup itself.
 */
export async function requireMerchantContext(): Promise<MerchantContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const merchantId = await resolveMerchantId(supabase, user.id);
  if (!merchantId) return { ok: false, error: "Merchant account not found." };

  const { data: merchant } = await supabase
    .from("merchants")
    .select("owner_user_id, owner_first_name, owner_last_name, email")
    .eq("id", merchantId)
    .maybeSingle();

  if (merchant?.owner_user_id === user.id) {
    const actorName = pickName(
      [merchant.owner_first_name, merchant.owner_last_name].filter(Boolean).join(" "),
      merchant.email,
      user.email,
    );
    return { ok: true, merchantId, role: "owner", userId: user.id, actorName };
  }

  const { data: mem } = await supabase
    .from("merchant_members")
    .select("role, name, first_name, last_name, email")
    .eq("merchant_id", merchantId)
    .eq("user_id", user.id)
    .maybeSingle();

  const actorName = pickName(
    mem?.name,
    [mem?.first_name, mem?.last_name].filter(Boolean).join(" "),
    mem?.email,
    user.email,
  );

  return {
    ok: true,
    merchantId,
    role: normalizeMemberRole(mem?.role),
    userId: user.id,
    actorName,
  };
}
