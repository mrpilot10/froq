import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export interface RewardWaitUnlockResult {
  scanned: number;
  unlocked: number;
  failed: number;
}

/**
 * Cron worker: unlock rewards whose precomputed reward_unlock_at has passed.
 *
 * No WhatsApp/SMS is sent here — there is no approved template for wait-end.
 * Unlock time was stored when the final stamp landed; merchant wait changes
 * do not rewrite cards already in `waiting`.
 */
export async function processRewardWaitUnlocks(
  limit = 50,
): Promise<RewardWaitUnlockResult> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: candidates, error } = await admin
    .from("loyalty_cards")
    .select("customer_id")
    .eq("reward_status", "waiting")
    .not("reward_unlock_at", "is", null)
    .lte("reward_unlock_at", nowIso)
    .limit(limit);

  if (error) {
    throw new Error(`reward wait unlock query failed: ${error.message}`);
  }

  const cards = candidates ?? [];
  let unlocked = 0;
  let failed = 0;

  for (const card of cards) {
    const { data: claimed, error: claimError } = await admin
      .from("loyalty_cards")
      .update({
        reward_status: "ready",
        reward_unlocked_at: nowIso,
        // No ready-notification template; mark cycle complete so cron won't revisit.
        reward_ready_message_sent: true,
      })
      .eq("customer_id", card.customer_id)
      .eq("reward_status", "waiting")
      .lte("reward_unlock_at", nowIso)
      .not("reward_unlock_at", "is", null)
      .select("customer_id")
      .maybeSingle();

    if (claimError) {
      failed += 1;
      console.error(
        JSON.stringify({
          scope: "reward_wait_unlock",
          event: "unlock_failed",
          customerId: card.customer_id,
          error: claimError.message,
          at: new Date().toISOString(),
        }),
      );
      continue;
    }

    if (claimed) unlocked += 1;
  }

  return { scanned: cards.length, unlocked, failed };
}
