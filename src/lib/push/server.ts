import "server-only";

import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:hello@froq.io";

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  if (!PUBLIC_KEY || !PRIVATE_KEY) return false;
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/**
 * Sends a web-push notification to every registered device for a merchant.
 * Uses the service-role client so it works from any server context (e.g. the
 * customer's stamp-request action). Best-effort: failures never throw, and
 * stale subscriptions (404/410) are pruned.
 */
export async function sendPushToMerchant(merchantId: string, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return;

  const admin = createAdminClient();
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("merchant_id", merchantId);

  if (!subs?.length) return;

  const body = JSON.stringify(payload);
  const staleEndpoints: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        );
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) staleEndpoints.push(sub.endpoint);
      }
    }),
  );

  if (staleEndpoints.length) {
    await admin.from("push_subscriptions").delete().in("endpoint", staleEndpoints);
  }
}
