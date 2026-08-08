import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  entitlementsFromRows,
  isTrialActive,
} from "@/lib/merchant/entitlements";
import { MENU_PREVIEW } from "@/lib/merchant/feature-flags";

function aiMenuLog(event: string, fields: Record<string, unknown>) {
  console.info(
    JSON.stringify({
      scope: "queue_ai_menu",
      event,
      ...fields,
      at: new Date().toISOString(),
    }),
  );
}

/**
 * True when Queue ↔ AI Menu integration should run for this merchant:
 * Settings toggle ON + AI Menu available (MENU_PREVIEW unlock, or an active
 * menu plan / unexpired trial).
 */
export async function isQueueAiMenuEnabled(merchantId: string): Promise<boolean> {
  if (!merchantId) return false;
  const admin = createAdminClient();

  const { data: merchant, error: merchantError } = await admin
    .from("merchants")
    .select("queue_ai_menu_enabled")
    .eq("id", merchantId)
    .maybeSingle();
  if (merchantError) {
    aiMenuLog("merchant_lookup_failed", {
      merchantId,
      error: merchantError.message,
    });
    return false;
  }
  if (merchant?.queue_ai_menu_enabled !== true) return false;

  // Preview unlocks AI Menu for every merchant; still require the Queue toggle.
  if (MENU_PREVIEW) return true;

  const { data: rows, error: productError } = await admin
    .from("merchant_products")
    .select("product, plan_id, status, onboarded_at, trial_started_at, trial_ends_at")
    .eq("merchant_id", merchantId)
    .eq("product", "menu");
  if (productError) {
    aiMenuLog("product_lookup_failed", {
      merchantId,
      error: productError.message,
    });
    return false;
  }

  const menu = entitlementsFromRows(rows ?? []).menu;
  if (!menu || menu.status !== "active") return false;
  // Trial row without plan — honour the trial clock.
  if (!menu.planId && menu.trialEndsAt) return isTrialActive(menu);
  return true;
}

export type QueueJoinNotifyTemplate =
  | "queue_first_notify"
  | "queue_first_notify_menu";

export type QueueSeatedNotifyTemplate = "queue_seated" | "seated_menu";

export async function queueJoinNotifyTemplate(
  merchantId: string,
): Promise<QueueJoinNotifyTemplate> {
  const enabled = await isQueueAiMenuEnabled(merchantId);
  const template: QueueJoinNotifyTemplate = enabled
    ? "queue_first_notify_menu"
    : "queue_first_notify";
  aiMenuLog("join_template", { merchantId, enabled, template });
  return template;
}

export async function queueSeatedNotifyTemplate(
  merchantId: string,
): Promise<QueueSeatedNotifyTemplate> {
  const enabled = await isQueueAiMenuEnabled(merchantId);
  const template: QueueSeatedNotifyTemplate = enabled
    ? "seated_menu"
    : "queue_seated";
  aiMenuLog("seated_template", { merchantId, enabled, template });
  return template;
}
