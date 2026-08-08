import { customerHubUrl as absoluteCustomerHubUrl, getAppOrigin } from "@/lib/app-url";

/**
 * Canonical WhatsApp template names used by Froq notifications.
 * Values must match the approved template names in APITxT / Meta.
 *
 * Meta template URL button (dynamic):
 *   Loyalty:     https://froq.io/c/{{1}}  (also /join/{{1}} and /card/{{1}} redirect here)
 *   Queue:       https://froq.io/queue/{{1}}  (frq_… token — merchant slug uses meer-s-cafe style)
 *   Reservation: https://froq.io/r/{{1}}  (rsv_… reservation token)
 * Runtime sends only the suffix: url_buttons["0"] = customer.publicToken (frq_…),
 * or the reservation's own rsv_… token for reservation templates.
 * Sample values used for Meta approval must never be sent at runtime.
 *
 * Reservation Meta bodies (utility) — 5 body vars + View reservation URL button:
 *   {{1}} name  {{2}} restaurant  {{3}} date  {{4}} time  {{5}} guests (digits)
 *   See reservation-vars.ts for the exact approved body copy per template.
 */
export const WhatsAppTemplateName = {
  /** Fired when merchant verifies / offers a stamp. */
  StampVerified: "loyaltycard_stamp_verified_1",
  /** @deprecated Use StampVerified */
  StampEarned: "loyaltycard_stamp_verified_1",
  /**
   * Birthday bonus — 2 stamps on birthday visit.
   * Body: {{1}} first name, {{2}} café, {{3}} reward name.
   * CTA: View Loyalty Card → https://froq.io/c/{{1}} (publicToken suffix).
   */
  BirthdayBonusStamps: "birthday_bonus_stamps",
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

  /**
   * Reservation lifecycle. Each of these has one URL button —
   * https://froq.io/r/{{1}} — and no quick replies: WhatsApp notifies, the
   * reservation page handles every guest action.
   */
  ReservationRequestReceived: "reservation_request_received",
  ReservationConfirmed: "reservation_confirmed",
  /**
   * Confirmed booking — AI Menu CTA variant.
   * Same body as reservation_confirmed; URL button → https://froq.io/m/{{1}}.
   */
  ReservationConfirmedMenu: "reservation_confirmed_menu",
  ReservationDeclined: "reservation_declined",
  /** Merchant proposed a different slot; the guest answers on their page. */
  ReservationUpdated: "reservation_updated",
  ReservationReminder: "reservation_reminder",

  /** Guest joined the live waitlist (Meta-approved name). CTA → /queue/{{1}}. */
  QueueJoined: "queue_first_notify",
  /** @deprecated Alias — Meta template is queue_first_notify. */
  QueueFirstNotify: "queue_first_notify",
  /**
   * Guest joined — AI Menu CTA variant.
   * Same body as queue_first_notify; URL button → https://froq.io/m/{{1}}.
   */
  QueueFirstNotifyMenu: "queue_first_notify_menu",
  /** Merchant called this party. */
  QueueCallNow: "queue_call_now",
  /** @deprecated Prefer QueueCallNow */
  QueueCustomerCalled: "queue_call_now",
  /** Scheduled call reminders. */
  QueueReminders1: "queue_reminders_1",
  QueueReminder2: "queue_reminder_2",
  /** Meta-approved name is queue_3_reminder (not queue_reminder_3). */
  QueueReminder3: "queue_3_reminder",
  /** @deprecated Prefer QueueReminders1 / QueueReminder2 / QueueReminder3 */
  QueueCustomerCalledReminder1: "queue_reminders_1",
  QueueCustomerCalledReminder2: "queue_reminder_2",
  QueueCustomerCalledReminder3: "queue_3_reminder",
  /** Party skipped / no-show. */
  QueueCustomerSkipped: "queue_customer_skipped",
  /** Party seated. CTA → /queue/{{1}}. */
  QueueSeated: "queue_seated",
  /** @deprecated Prefer QueueSeated */
  QueueCustomerSeated: "queue_seated",
  /**
   * Party seated — AI Menu CTA variant.
   * Same body as queue_seated; URL button → https://froq.io/m/{{1}}.
   */
  SeatedMenu: "seated_menu",
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
