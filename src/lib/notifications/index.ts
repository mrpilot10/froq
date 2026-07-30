/**
 * Customer notification routing (WhatsApp vs SMS).
 *
 * Always use sendCustomerNotification — do not call WhatsApp helpers directly
 * for customer-facing alerts.
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
  buildSmsBody,
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

export {
  markWhatsAppAvailableForPhone,
  applyNotificationPrefsFromAuth,
} from "./prefs";

export { sendTransactionalSms } from "./sms";
