/**
 * Customer notification routing (WhatsApp + parallel email).
 *
 * Always use sendCustomerNotification — do not call WhatsApp or email helpers
 * directly for customer-facing product alerts. No SMS fallback for product
 * alerts (OTP SMS is separate).
 */

export { sendCustomerNotification } from "./dispatcher";
export type { SendCustomerNotificationResult } from "./dispatcher";

export { processQueueCallReminders } from "./queue-call-reminders";
export type { QueueCallReminderResult } from "./queue-call-reminders";

export {
  CustomerNotificationTemplate,
  shouldSendWhatsApp,
  isLoyaltyNotificationTemplate,
  isQueueNotificationTemplate,
  type NotifiableCustomer,
  type NotificationChannel,
  type CustomerNotificationTemplate as CustomerNotificationTemplateName,
  type CustomerNotificationDataMap,
  type StampVerifiedData,
  type RewardUnlockedData,
  type StampCollectedLastWaitTimeData,
  type RewardReadyWaitTimeData,
  type RewardRedeemedData,
  type WaitlistCalledData,
  type ReservationData,
  type ReservationDeclinedData,
} from "./types";

export { buildCustomerNotificationEmail } from "./customer-email";
export { sendCustomerNotificationEmail } from "./customer-email-channel";

export {
  markWhatsAppAvailableForPhone,
  applyNotificationPrefsFromAuth,
} from "./prefs";
