import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Branch the caller may query, honouring staff branch restrictions.
 *
 * Returns `null` for "all branches", which only owners and staff without an
 * explicit branch assignment can reach. Restricted staff are always clamped to
 * one of their assigned branches, even when they ask for all or for a branch
 * they cannot see.
 */
export async function resolveBranchFilterForUser(
  supabase: SupabaseClient,
  merchantId: string,
  userId: string,
  requestedBranchId: string | null,
): Promise<string | null> {
  const { data: merchantRow } = await supabase
    .from("merchants")
    .select("owner_user_id")
    .eq("id", merchantId)
    .maybeSingle();

  let allowedBranchIds: Set<string> | null = null;
  if (merchantRow && merchantRow.owner_user_id !== userId) {
    const { data: membership } = await supabase
      .from("merchant_members")
      .select("branch_ids, branch_id")
      .eq("merchant_id", merchantId)
      .eq("user_id", userId)
      .maybeSingle();
    const ids =
      membership?.branch_ids && membership.branch_ids.length > 0
        ? membership.branch_ids
        : membership?.branch_id
          ? [membership.branch_id]
          : [];
    if (ids.length > 0) allowedBranchIds = new Set<string>(ids);
  }

  if (allowedBranchIds) {
    if (requestedBranchId && allowedBranchIds.has(requestedBranchId)) {
      return requestedBranchId;
    }
    return [...allowedBranchIds][0] ?? null;
  }

  if (!requestedBranchId) return null;
  const { data: branch } = await supabase
    .from("branches")
    .select("id")
    .eq("id", requestedBranchId)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  return branch?.id ?? null;
}
