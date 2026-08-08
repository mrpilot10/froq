import { loyaltyCardUrl } from "@/lib/whatsapp/templates/names";
import { requireCustomerPublicToken } from "@/lib/customer/hub";
import { reservationUrl } from "@/lib/reservations/link";
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
  ReservationRequestReceived: "reservation_request_received",
  ReservationConfirmed: "reservation_confirmed",
  ReservationDeclined: "reservation_declined",
  ReservationUpdated: "reservation_updated",
  ReservationReminder: "reservation_reminder",
  QueueJoined: "queue_first_notify",
  QueueFirstNotify: "queue_first_notify",
  QueueFirstNotifyMenu: "queue_first_notify_menu",
  QueueCallNow: "queue_call_now",
  /** @deprecated Prefer QueueCallNow */
  QueueCustomerCalled: "queue_call_now",
  QueueReminders1: "queue_reminders_1",
  QueueReminder2: "queue_reminder_2",
  QueueReminder3: "queue_3_reminder",
  /** @deprecated Prefer QueueReminders1 / QueueReminder2 / QueueReminder3 */
  QueueCustomerCalledReminder1: "queue_reminders_1",
  QueueCustomerCalledReminder2: "queue_reminder_2",
  QueueCustomerCalledReminder3: "queue_3_reminder",
  QueueCustomerSkipped: "queue_customer_skipped",
  QueueSeated: "queue_seated",
  SeatedMenu: "seated_menu",
  /** @deprecated Prefer QueueSeated */
  QueueCustomerSeated: "queue_seated",
  /** Birthday bonus — 2 stamps on birthday (WhatsApp template birthday_bonus_stamps). */
  BirthdayBonusStamps: "birthday_bonus_stamps",
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

/**
 * Shared shape for every reservation lifecycle template.
 *
 * WhatsApp only notifies — the single CTA opens the guest's reservation page,
 * where all actions live. `reservationToken` is that page's `rsv_…` token.
 */
export type ReservationData = {
  businessName: string;
  /**
   * Combined absolute date + time for SMS / in-app copy.
   * WhatsApp Meta templates use `date` + `time` as separate body vars instead.
   */
  when: string;
  /** Meta {{3}} — e.g. "15 Aug 2026". */
  date: string;
  /** Meta {{4}} — e.g. "7:30 PM". */
  time: string;
  partySize?: number | string;
  reservationToken: string;
};

export type ReservationDeclinedData = ReservationData & {
  /** Optional merchant reason; falls back to a neutral line. */
  reason?: string;
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

export type BirthdayBonusStampsData = {
  businessName: string;
  /** Reward the customer is collecting toward (Meta {{3}}). */
  rewardName: string;
};

export type CustomerNotificationDataMap = {
  stamp_verified: StampVerifiedData;
  reward_unlocked: RewardUnlockedData;
  stamp_collected_last_wait_time: StampCollectedLastWaitTimeData;
  reward_ready_wait_time: RewardReadyWaitTimeData;
  reward_redeemed: RewardRedeemedData;
  waitlist_called: WaitlistCalledData;
  reservation_request_received: ReservationData;
  reservation_confirmed: ReservationData;
  reservation_declined: ReservationDeclinedData;
  reservation_updated: ReservationData;
  reservation_reminder: ReservationData;
  queue_first_notify: QueueJoinedData;
  queue_first_notify_menu: QueueJoinedData;
  queue_call_now: QueuePartyData;
  queue_reminders_1: QueuePartyData;
  queue_reminder_2: QueuePartyData;
  queue_3_reminder: QueuePartyData;
  queue_customer_skipped: QueuePartyData;
  queue_seated: QueuePartyData;
  seated_menu: QueuePartyData;
  birthday_bonus_stamps: BirthdayBonusStampsData;
};

export function shouldSendWhatsApp(customer: NotifiableCustomer): boolean {
  return (
    customer.whatsappAvailable === true &&
    customer.preferredNotificationChannel === "whatsapp"
  );
}

/** Loyalty Meta templates — always attempt WhatsApp (SMS fallback when configured). */
export function isLoyaltyNotificationTemplate(
  template: CustomerNotificationTemplate,
): boolean {
  return (
    template === "stamp_verified" ||
    template === "reward_unlocked" ||
    template === "stamp_collected_last_wait_time" ||
    template === "reward_ready_wait_time" ||
    template === "reward_redeemed" ||
    template === "birthday_bonus_stamps"
  );
}

/** Queue Meta templates — WhatsApp only (no SMS fallback). */
export function isQueueNotificationTemplate(
  template: CustomerNotificationTemplate,
): boolean {
  return (
    template === "queue_first_notify" ||
    template === "queue_first_notify_menu" ||
    template === "queue_call_now" ||
    template === "queue_reminders_1" ||
    template === "queue_reminder_2" ||
    template === "queue_3_reminder" ||
    template === "queue_customer_skipped" ||
    template === "queue_seated" ||
    template === "seated_menu"
  );
}

/** Reservation Meta templates — WhatsApp-first, same as queue. */
export function isReservationNotificationTemplate(
  template: CustomerNotificationTemplate,
): boolean {
  return template.startsWith("reservation_");
}

/** Plain-text SMS bodies (include hub URL when a public token exists). Keep short for SMS. */
export function buildSmsBody(
  template: CustomerNotificationTemplate,
  customer: NotifiableCustomer,
  data: CustomerNotificationDataMap[CustomerNotificationTemplate],
): string {
  const name = customer.name.trim() || "there";
  let hub = "";
  try {
    hub = loyaltyCardUrl(requireCustomerPublicToken(customer.publicToken));
  } catch {
    hub = "";
  }

  switch (template) {
    case "stamp_verified": {
      const d = data as StampVerifiedData;
      return hub
        ? `Hi ${name}, stamp verified at ${d.businessName}: ${d.currentStamps}/${d.requiredStamps} toward ${d.rewardTitle}. View card: ${hub}`
        : `Hi ${name}, stamp verified at ${d.businessName}: ${d.currentStamps}/${d.requiredStamps} toward ${d.rewardTitle}.`;
    }
    case "reward_unlocked": {
      const d = data as RewardUnlockedData;
      return hub
        ? `Hi ${name}, reward unlocked at ${d.businessName}: ${d.rewardTitle}. Redeem: ${hub}`
        : `Hi ${name}, reward unlocked at ${d.businessName}: ${d.rewardTitle}.`;
    }
    case "stamp_collected_last_wait_time": {
      const d = data as StampCollectedLastWaitTimeData;
      return hub
        ? `Hi ${name}, last stamp at ${d.businessName}! ${d.rewardTitle} unlocks in ${d.waitLabel}. Card: ${hub}`
        : `Hi ${name}, last stamp at ${d.businessName}! ${d.rewardTitle} unlocks in ${d.waitLabel}.`;
    }
    case "reward_ready_wait_time": {
      const d = data as RewardReadyWaitTimeData;
      return hub
        ? `Hi ${name}, your reward at ${d.businessName} is ready: ${d.rewardTitle}. Redeem: ${hub}`
        : `Hi ${name}, your reward at ${d.businessName} is ready: ${d.rewardTitle}.`;
    }
    case "reward_redeemed": {
      const d = data as RewardRedeemedData;
      return hub
        ? `Hi ${name}, your reward ${d.rewardTitle} has been claimed at ${d.businessName}. Card: ${hub}`
        : `Hi ${name}, your reward ${d.rewardTitle} has been claimed at ${d.businessName}.`;
    }
    case "waitlist_called": {
      const d = data as WaitlistCalledData;
      const pos = d.position != null ? ` (position ${d.position})` : "";
      return `Hi ${name}, you're up at ${d.businessName}${pos}. Details: ${hub}`;
    }
    case "reservation_request_received": {
      const d = data as ReservationData;
      const party = d.partySize != null ? `, party of ${d.partySize}` : "";
      return `Hi ${name}, we've received your table request at ${d.businessName} for ${d.when}${party}. We'll confirm shortly. View reservation: ${reservationUrl(d.reservationToken)}`;
    }
    case "reservation_confirmed": {
      const d = data as ReservationData;
      const party = d.partySize != null ? `, party of ${d.partySize}` : "";
      return `Hi ${name}, reservation confirmed at ${d.businessName} for ${d.when}${party}. View reservation: ${reservationUrl(d.reservationToken)}`;
    }
    case "reservation_declined": {
      const d = data as ReservationDeclinedData;
      const reason = d.reason?.trim() ? ` ${d.reason.trim()}` : "";
      return `Hi ${name}, sorry — ${d.businessName} can't take your table for ${d.when}.${reason} View reservation: ${reservationUrl(d.reservationToken)}`;
    }
    case "reservation_updated": {
      const d = data as ReservationData;
      return `Hi ${name}, ${d.businessName} proposed a new time for your table: ${d.when}. Accept or decline here: ${reservationUrl(d.reservationToken)}`;
    }
    case "reservation_reminder": {
      const d = data as ReservationData;
      const party = d.partySize != null ? ` for ${d.partySize}` : "";
      return `Hi ${name}, reminder: your table${party} at ${d.businessName} is booked for ${d.when}. View reservation: ${reservationUrl(d.reservationToken)}`;
    }
    case "queue_first_notify":
    case "queue_first_notify_menu": {
      const d = data as QueueJoinedData;
      const size = formatBookingSize(d.bookingSize);
      const wait = formatEstimatedWaitTime(d.estimatedWaitMinutes);
      return `Hi ${name}, you're #${d.queuePosition} at ${d.businessName} (${size}). Est. wait ${wait}. Details: ${hub}`;
    }
    case "queue_call_now":
    case "queue_reminders_1":
    case "queue_reminder_2":
    case "queue_3_reminder": {
      const d = data as QueuePartyData;
      const size = formatBookingSize(d.bookingSize);
      return `Hi ${name}, ${d.businessName} is ready for your party (${size}). Details: ${hub}`;
    }
    case "queue_customer_skipped": {
      const d = data as QueuePartyData;
      const size = formatBookingSize(d.bookingSize);
      return `Hi ${name}, your spot at ${d.businessName} (${size}) was skipped. Details: ${hub}`;
    }
    case "queue_seated":
    case "seated_menu": {
      const d = data as QueuePartyData;
      const size = formatBookingSize(d.bookingSize);
      return `Hi ${name}, you're seated at ${d.businessName} (${size}). Details: ${hub}`;
    }
    case "birthday_bonus_stamps": {
      const d = data as BirthdayBonusStampsData;
      return `Happy birthday ${name}! Visit ${d.businessName} today for 2 loyalty stamps toward ${d.rewardName} (usually 1). Card: ${hub}`;
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
    reservation_request_received: "APITXT_SMS_TEMPLATE_RESERVATION_REQUEST_RECEIVED",
    reservation_confirmed: "APITXT_SMS_TEMPLATE_RESERVATION_CONFIRMED",
    reservation_declined: "APITXT_SMS_TEMPLATE_RESERVATION_DECLINED",
    reservation_updated: "APITXT_SMS_TEMPLATE_RESERVATION_UPDATED",
    reservation_reminder: "APITXT_SMS_TEMPLATE_RESERVATION_REMINDER",
    queue_first_notify: "APITXT_SMS_TEMPLATE_QUEUE_FIRST_NOTIFY",
    queue_first_notify_menu: "APITXT_SMS_TEMPLATE_QUEUE_FIRST_NOTIFY",
    queue_call_now: "APITXT_SMS_TEMPLATE_QUEUE_CALL_NOW",
    queue_reminders_1: "APITXT_SMS_TEMPLATE_QUEUE_REMINDERS_1",
    queue_reminder_2: "APITXT_SMS_TEMPLATE_QUEUE_REMINDER_2",
    queue_3_reminder: "APITXT_SMS_TEMPLATE_QUEUE_REMINDER_3",
    queue_customer_skipped: "APITXT_SMS_TEMPLATE_QUEUE_CUSTOMER_SKIPPED",
    queue_seated: "APITXT_SMS_TEMPLATE_QUEUE_SEATED",
    seated_menu: "APITXT_SMS_TEMPLATE_QUEUE_SEATED",
    birthday_bonus_stamps: "APITXT_SMS_TEMPLATE_BIRTHDAY_BONUS_STAMPS",
  }[template];
  return process.env[envKey]?.trim() || undefined;
}
