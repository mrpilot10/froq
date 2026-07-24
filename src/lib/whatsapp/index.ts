/**
 * Low-level WhatsApp template sends (APITXT sendWA).
 *
 * Do NOT call these directly for customer alerts — use
 * `sendCustomerNotification` from `@/lib/notifications` so channel routing
 * (WhatsApp vs SMS) is respected.
 */

export {
  sendWhatsAppTemplate,
  sendStampVerified,
  sendRewardUnlocked,
  sendStampCollectedLastWaitTime,
  sendRewardReadyWaitTime,
  sendRewardRedeemed,
  type SendWhatsAppTemplateInput,
  type ApitxtSendWaResponse,
  type SendStampVerifiedInput,
  type SendRewardUnlockedInput,
  type SendStampCollectedLastWaitTimeInput,
  type SendRewardReadyWaitTimeInput,
  type SendRewardRedeemedInput,
} from "./notifications";
