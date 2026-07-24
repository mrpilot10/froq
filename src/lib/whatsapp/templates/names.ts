import { customerHubUrl as absoluteCustomerHubUrl, getAppOrigin } from "@/lib/app-url";

/**
 * Canonical WhatsApp template names used by Froq loyalty notifications.
 * Values must match the approved template names in APITxT / Meta.
 *
 * Meta template URL button (dynamic):
 *   https://froq.io/c/{{1}}
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
  RewardRedeemed: "reward_redeemed",
  Welcome: "welcome",
  WaitlistCalled: "waitlist_called",
  ReservationConfirmed: "reservation_confirmed",
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
