import { customerHubUrl as absoluteCustomerHubUrl, getAppOrigin } from "@/lib/app-url";

/**
 * Canonical WhatsApp template names used by Froq notifications.
 * Values must match the approved template names in APITxT / Meta.
 *
 * Meta template URL button (dynamic):
 *   Loyalty: https://froq.io/c/{{1}}
 *   Queue:   https://a-t.cc/{{1}}
 * Runtime sends only the suffix: url_buttons["0"] = customer.publicToken (frq_…).
 * Sample values used for Meta approval must never be sent at runtime.
 */
export const WhatsAppTemplateName = {
  /** Fired when merchant verifies / offers a stamp. */
  StampVerified: "loyaltycard_stamp_verified",
  /** @deprecated Use StampVerified */
  StampEarned: "loyaltycard_stamp_verified",
  /** Last stamp collected with no wait — QR ready now. */
  RewardUnlocked: "loyaltycard_reward_unlocked_no_wait_time",
  /** Last stamp collected while a wait before QR unlock is configured. */
  StampCollectedLastWaitTime: "loyaltycard_stamp_collected_last_wait_time",
  /** Wait finished — reward QR is now ready to redeem. */
  RewardReadyWaitTime: "loyaltycard_reward_ready_wait_time",
  /** Fired immediately after a reward QR is scanned / claimed. */
  RewardClaimed: "loyaltycard_reward_claimed",
  /** @deprecated Prefer RewardClaimed */
  RewardRedeemed: "loyaltycard_reward_claimed",
  Welcome: "welcome",
  WaitlistCalled: "waitlist_called",
  ReservationConfirmed: "reservation_confirmed",

  /** Guest joined the live waitlist (Meta-approved name). */
  QueueJoined: "queue_first_notify",
  /** @deprecated Alias — Meta template is queue_first_notify. */
  QueueFirstNotify: "queue_first_notify",
  /** Merchant called this party. */
  QueueCallNow: "queue_call_now",
  /** @deprecated Prefer QueueCallNow */
  QueueCustomerCalled: "queue_call_now",
  /** Scheduled call reminders. */
  QueueReminders1: "queue_reminders_1",
  QueueReminder2: "queue_reminder_2",
  QueueReminder3: "queue_reminder_3",
  /** @deprecated Prefer QueueReminders1 / QueueReminder2 / QueueReminder3 */
  QueueCustomerCalledReminder1: "queue_reminders_1",
  QueueCustomerCalledReminder2: "queue_reminder_2",
  QueueCustomerCalledReminder3: "queue_reminder_3",
  /** Party skipped / no-show. */
  QueueCustomerSkipped: "queue_customer_skipped",
  /** Party seated. */
  QueueSeated: "queue_seated",
  /** @deprecated Prefer QueueSeated */
  QueueCustomerSeated: "queue_seated",
} as const;

export type WhatsAppTemplateName =
  (typeof WhatsAppTemplateName)[keyof typeof WhatsAppTemplateName];

/** @deprecated Prefer getAppOrigin from @/lib/app-url */
export function froqPublicOrigin(): string {
  return getAppOrigin();
}

/**
 * Absolute customer hub URL for SMS / in-app links.
 * Uses APP_URL (localhost in dev, production domain when deployed).
 * WhatsApp Meta buttons use the registered template base + publicToken suffix.
 */
export function loyaltyCardUrl(publicToken: string): string {
  return absoluteCustomerHubUrl(publicToken);
}

/** @deprecated Use loyaltyCardUrl — same permanent hub URL. */
export const customerHubUrl = loyaltyCardUrl;
