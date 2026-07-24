/**
 * Customer notification routing (WhatsApp vs SMS).
 *
 * Always use sendCustomerNotification — do not call WhatsApp helpers directly
 * for customer-facing alerts.
 */

export { sendCustomerNotification } from "./dispatcher";
export type { SendCustomerNotificationResult } from "./dispatcher";

export {
  CustomerNotificationTemplate,
  shouldSendWhatsApp,
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
  type ReservationConfirmedData,
} from "./types";

export {
  markWhatsAppAvailableForPhone,
  applyNotificationPrefsFromAuth,
} from "./prefs";

export { sendTransactionalSms } from "./sms";
