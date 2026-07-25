import { loyaltyCardUrl } from "@/lib/whatsapp/templates/names";
import { requireCustomerPublicToken } from "@/lib/customer/hub";
import { formatBookingSize, formatEstimatedWaitTime } from "@/lib/queue/format";

/** Notification templates routed by sendCustomerNotification. */
export const CustomerNotificationTemplate = {
  StampVerified: "stamp_verified",
  RewardUnlocked: "reward_unlocked",
  StampCollectedLastWaitTime: "stamp_collected_last_wait_time",
  RewardReadyWaitTime: "reward_ready_wait_time",
  RewardClaimed: "reward_redeemed",
  /** @deprecated Prefer RewardClaimed — Meta template is loyaltycard_reward_claimed. */
  RewardRedeemed: "reward_redeemed",
  WaitlistCalled: "waitlist_called",
  ReservationConfirmed: "reservation_confirmed",
  QueueJoined: "queue_first_notify",
  QueueFirstNotify: "queue_first_notify",
  QueueCallNow: "queue_call_now",
  /** @deprecated Prefer QueueCallNow */
  QueueCustomerCalled: "queue_call_now",
  QueueReminders1: "queue_reminders_1",
  QueueReminder2: "queue_reminder_2",
  QueueReminder3: "queue_reminder_3",
  /** @deprecated Prefer QueueReminders1 / QueueReminder2 / QueueReminder3 */
  QueueCustomerCalledReminder1: "queue_reminders_1",
  QueueCustomerCalledReminder2: "queue_reminder_2",
  QueueCustomerCalledReminder3: "queue_reminder_3",
  QueueCustomerSkipped: "queue_customer_skipped",
  QueueSeated: "queue_seated",
  /** @deprecated Prefer QueueSeated */
  QueueCustomerSeated: "queue_seated",
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
  /** Meta body {{5}} — reward being collected toward. */
  rewardTitle: string;
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
  /** Meta body {{6}} — reward title. */
  rewardTitle: string;
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

/** Shared data for queue call / reminder / skipped / seated templates. */
export type QueuePartyData = {
  businessName: string;
  bookingSize: number;
};

export type QueueJoinedData = QueuePartyData & {
  queuePosition: number | string;
  estimatedWaitMinutes: number;
};

export type CustomerNotificationDataMap = {
  stamp_verified: StampVerifiedData;
  reward_unlocked: RewardUnlockedData;
  stamp_collected_last_wait_time: StampCollectedLastWaitTimeData;
  reward_ready_wait_time: RewardReadyWaitTimeData;
  reward_redeemed: RewardRedeemedData;
  waitlist_called: WaitlistCalledData;
  reservation_confirmed: ReservationConfirmedData;
  queue_first_notify: QueueJoinedData;
  queue_call_now: QueuePartyData;
  queue_reminders_1: QueuePartyData;
  queue_reminder_2: QueuePartyData;
  queue_reminder_3: QueuePartyData;
  queue_customer_skipped: QueuePartyData;
  queue_seated: QueuePartyData;
};

export function shouldSendWhatsApp(customer: NotifiableCustomer): boolean {
  return (
    customer.whatsappAvailable === true &&
    customer.preferredNotificationChannel === "whatsapp"
  );
}

/** Queue Meta templates — send on WhatsApp even before OTP confirmed WhatsApp. */
export function isQueueNotificationTemplate(
  template: CustomerNotificationTemplate,
): boolean {
  return (
    template === "queue_first_notify" ||
    template === "queue_call_now" ||
    template === "queue_reminders_1" ||
    template === "queue_reminder_2" ||
    template === "queue_reminder_3" ||
    template === "queue_customer_skipped" ||
    template === "queue_seated"
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
      return `Hi ${name}, stamp verified at ${d.businessName}: ${d.currentStamps}/${d.requiredStamps} toward ${d.rewardTitle}. View card: ${hub}`;
    }
    case "reward_unlocked": {
      const d = data as RewardUnlockedData;
      return `Hi ${name}, reward unlocked at ${d.businessName}: ${d.rewardTitle}. Redeem: ${hub}`;
    }
    case "stamp_collected_last_wait_time": {
      const d = data as StampCollectedLastWaitTimeData;
      return `Hi ${name}, last stamp at ${d.businessName}! ${d.rewardTitle} unlocks in ${d.waitLabel}. Card: ${hub}`;
    }
    case "reward_ready_wait_time": {
      const d = data as RewardReadyWaitTimeData;
      return `Hi ${name}, your reward at ${d.businessName} is ready: ${d.rewardTitle}. Redeem: ${hub}`;
    }
    case "reward_redeemed": {
      const d = data as RewardRedeemedData;
      return `Hi ${name}, your reward ${d.rewardTitle} has been claimed at ${d.businessName}. Card: ${hub}`;
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
    case "queue_first_notify": {
      const d = data as QueueJoinedData;
      const size = formatBookingSize(d.bookingSize);
      const wait = formatEstimatedWaitTime(d.estimatedWaitMinutes);
      return `Hi ${name}, you're #${d.queuePosition} at ${d.businessName} (${size}). Est. wait ${wait}. Details: ${hub}`;
    }
    case "queue_call_now":
    case "queue_reminders_1":
    case "queue_reminder_2":
    case "queue_reminder_3": {
      const d = data as QueuePartyData;
      const size = formatBookingSize(d.bookingSize);
      return `Hi ${name}, ${d.businessName} is ready for your party (${size}). Details: ${hub}`;
    }
    case "queue_customer_skipped": {
      const d = data as QueuePartyData;
      const size = formatBookingSize(d.bookingSize);
      return `Hi ${name}, your spot at ${d.businessName} (${size}) was skipped. Details: ${hub}`;
    }
    case "queue_seated": {
      const d = data as QueuePartyData;
      const size = formatBookingSize(d.bookingSize);
      return `Hi ${name}, welcome — you're seated at ${d.businessName} (${size}). Details: ${hub}`;
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
    queue_first_notify: "APITXT_SMS_TEMPLATE_QUEUE_FIRST_NOTIFY",
    queue_call_now: "APITXT_SMS_TEMPLATE_QUEUE_CALL_NOW",
    queue_reminders_1: "APITXT_SMS_TEMPLATE_QUEUE_REMINDERS_1",
    queue_reminder_2: "APITXT_SMS_TEMPLATE_QUEUE_REMINDER_2",
    queue_reminder_3: "APITXT_SMS_TEMPLATE_QUEUE_REMINDER_3",
    queue_customer_skipped: "APITXT_SMS_TEMPLATE_QUEUE_CUSTOMER_SKIPPED",
    queue_seated: "APITXT_SMS_TEMPLATE_QUEUE_SEATED",
  }[template];
  return process.env[envKey]?.trim() || undefined;
}
