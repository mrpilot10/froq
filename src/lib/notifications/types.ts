import { loyaltyCardUrl } from "@/lib/whatsapp/templates/names";
import { requireCustomerPublicToken } from "@/lib/customer/hub";

/** Notification templates routed by sendCustomerNotification. */
export const CustomerNotificationTemplate = {
  StampVerified: "stamp_verified",
  RewardUnlocked: "reward_unlocked",
  StampCollectedLastWaitTime: "stamp_collected_last_wait_time",
  RewardReadyWaitTime: "reward_ready_wait_time",
  RewardRedeemed: "reward_redeemed",
  WaitlistCalled: "waitlist_called",
  ReservationConfirmed: "reservation_confirmed",
} as const;

export type CustomerNotificationTemplate =
  (typeof CustomerNotificationTemplate)[keyof typeof CustomerNotificationTemplate];

export type NotificationChannel = "sms" | "whatsapp";

export interface NotifiableCustomer {
  phone: string;
  name: string;
  whatsappAvailable: boolean;
  preferredNotificationChannel: NotificationChannel;
  publicToken: string;
}

export type StampVerifiedData = {
  businessName: string;
  currentStamps: number;
  requiredStamps: number;
};

export type RewardUnlockedData = {
  businessName: string;
  currentStamps: number;
  requiredStamps: number;
  rewardTitle: string;
};

export type StampCollectedLastWaitTimeData = {
  businessName: string;
  currentStamps: number;
  requiredStamps: number;
  waitLabel: string;
};

export type RewardReadyWaitTimeData = {
  businessName: string;
  currentStamps: number;
  requiredStamps: number;
  rewardTitle: string;
};

export type RewardRedeemedData = {
  businessName: string;
  rewardTitle: string;
};

export type WaitlistCalledData = {
  businessName: string;
  position?: number | string;
};

export type ReservationConfirmedData = {
  businessName: string;
  when: string;
  partySize?: number | string;
};

export type CustomerNotificationDataMap = {
  stamp_verified: StampVerifiedData;
  reward_unlocked: RewardUnlockedData;
  stamp_collected_last_wait_time: StampCollectedLastWaitTimeData;
  reward_ready_wait_time: RewardReadyWaitTimeData;
  reward_redeemed: RewardRedeemedData;
  waitlist_called: WaitlistCalledData;
  reservation_confirmed: ReservationConfirmedData;
};

export function shouldSendWhatsApp(customer: NotifiableCustomer): boolean {
  return (
    customer.whatsappAvailable === true &&
    customer.preferredNotificationChannel === "whatsapp"
  );
}

/** Plain-text SMS bodies (include hub URL). Keep short for SMS. */
export function buildSmsBody(
  template: CustomerNotificationTemplate,
  customer: NotifiableCustomer,
  data: CustomerNotificationDataMap[CustomerNotificationTemplate],
): string {
  const publicToken = requireCustomerPublicToken(customer.publicToken);
  const hub = loyaltyCardUrl(publicToken);
  const name = customer.name.trim() || "there";

  switch (template) {
    case "stamp_verified": {
      const d = data as StampVerifiedData;
      return `Hi ${name}, stamp verified at ${d.businessName}: ${d.currentStamps}/${d.requiredStamps}. View card: ${hub}`;
    }
    case "reward_unlocked": {
      const d = data as RewardUnlockedData;
      return `Hi ${name}, reward unlocked at ${d.businessName}: ${d.rewardTitle}. Redeem: ${hub}`;
    }
    case "stamp_collected_last_wait_time": {
      const d = data as StampCollectedLastWaitTimeData;
      return `Hi ${name}, last stamp at ${d.businessName}! Reward unlocks in ${d.waitLabel}. Card: ${hub}`;
    }
    case "reward_ready_wait_time": {
      const d = data as RewardReadyWaitTimeData;
      return `Hi ${name}, your reward at ${d.businessName} is ready: ${d.rewardTitle}. Redeem: ${hub}`;
    }
    case "reward_redeemed": {
      const d = data as RewardRedeemedData;
      return `Hi ${name}, ${d.rewardTitle} redeemed at ${d.businessName}. Card: ${hub}`;
    }
    case "waitlist_called": {
      const d = data as WaitlistCalledData;
      const pos = d.position != null ? ` (position ${d.position})` : "";
      return `Hi ${name}, you're up at ${d.businessName}${pos}. Details: ${hub}`;
    }
    case "reservation_confirmed": {
      const d = data as ReservationConfirmedData;
      const party = d.partySize != null ? `, party of ${d.partySize}` : "";
      return `Hi ${name}, reservation confirmed at ${d.businessName} for ${d.when}${party}. Details: ${hub}`;
    }
    default: {
      const _exhaustive: never = template;
      return _exhaustive;
    }
  }
}

export function smsTemplateIdFor(
  template: CustomerNotificationTemplate,
): string | undefined {
  const envKey = {
    stamp_verified: "APITXT_SMS_TEMPLATE_STAMP_VERIFIED",
    reward_unlocked: "APITXT_SMS_TEMPLATE_REWARD_UNLOCKED",
    stamp_collected_last_wait_time: "APITXT_SMS_TEMPLATE_STAMP_COLLECTED_LAST_WAIT_TIME",
    reward_ready_wait_time: "APITXT_SMS_TEMPLATE_REWARD_READY_WAIT_TIME",
    reward_redeemed: "APITXT_SMS_TEMPLATE_REWARD_REDEEMED",
    waitlist_called: "APITXT_SMS_TEMPLATE_WAITLIST_CALLED",
    reservation_confirmed: "APITXT_SMS_TEMPLATE_RESERVATION_CONFIRMED",
  }[template];
  return process.env[envKey]?.trim() || undefined;
}
