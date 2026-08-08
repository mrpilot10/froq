import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { MENU_PREVIEW } from "@/lib/merchant/feature-flags";

/**
 * True when Queue ↔ AI Menu integration should run for this merchant:
 * Settings toggle ON + AI Menu available (preview unlock, or active menu plan/trial).
 */
export async function isQueueAiMenuEnabled(merchantId: string): Promise<boolean> {
  if (!merchantId) return false;
  const admin = createAdminClient();

  const { data: merchant } = await admin
    .from("merchants")
    .select("queue_ai_menu_enabled")
    .eq("id", merchantId)
    .maybeSingle();
  if (merchant?.queue_ai_menu_enabled !== true) return false;

  // Preview unlocks AI Menu for every merchant; still require the Queue toggle.
  if (MENU_PREVIEW) return true;

  const { data: product } = await admin
    .from("merchant_products")
    .select("status, plan_id, trial_ends_at")
    .eq("merchant_id", merchantId)
    .eq("product", "menu")
    .maybeSingle();
  if (!product || product.status !== "active") return false;
  if (!product.plan_id && product.trial_ends_at) {
    const ends = Date.parse(product.trial_ends_at);
    return Number.isFinite(ends) && ends > Date.now();
  }
  return true;
}

export type QueueJoinNotifyTemplate =
  | "queue_first_notify"
  | "queue_first_notify_menu";

export type QueueSeatedNotifyTemplate = "queue_seated" | "seated_menu";

export async function queueJoinNotifyTemplate(
  merchantId: string,
): Promise<QueueJoinNotifyTemplate> {
  return (await isQueueAiMenuEnabled(merchantId))
    ? "queue_first_notify_menu"
    : "queue_first_notify";
}

export async function queueSeatedNotifyTemplate(
  merchantId: string,
): Promise<QueueSeatedNotifyTemplate> {
  return (await isQueueAiMenuEnabled(merchantId)) ? "seated_menu" : "queue_seated";
}
