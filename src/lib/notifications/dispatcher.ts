import "server-only";

import {
  sendRewardReadyWaitTime,
  sendRewardRedeemed,
  sendRewardUnlocked,
  sendStampCollectedLastWaitTime,
  sendStampVerified,
  sendWhatsAppTemplate,
} from "@/lib/whatsapp/notifications";
import { sendTransactionalSms } from "@/lib/notifications/sms";
import {
  buildSmsBody,
  shouldSendWhatsApp,
  smsTemplateIdFor,
  type CustomerNotificationDataMap,
  type CustomerNotificationTemplate,
  type NotifiableCustomer,
  type NotificationChannel,
} from "@/lib/notifications/types";

export interface SendCustomerNotificationResult {
  ok: boolean;
  channel: NotificationChannel;
  error?: string;
}

function notifLog(
  level: "info" | "error" | "warn",
  event: string,
  fields: Record<string, unknown>,
) {
  const line = {
    scope: "customer_notifications",
    level,
    event,
    ...fields,
    at: new Date().toISOString(),
  };
  const payload = JSON.stringify(line);
  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.info(payload);
}

async function sendWhatsAppForTemplate<T extends CustomerNotificationTemplate>(
  template: T,
  customer: NotifiableCustomer,
  data: CustomerNotificationDataMap[T],
): Promise<void> {
  switch (template) {
    case "stamp_verified": {
      const d = data as CustomerNotificationDataMap["stamp_verified"];
      await sendStampVerified({
        mobile: customer.phone,
        customerName: customer.name,
        businessName: d.businessName,
        currentStamps: d.currentStamps,
        requiredStamps: d.requiredStamps,
        publicToken: customer.publicToken,
      });
      return;
    }
    case "reward_unlocked": {
      const d = data as CustomerNotificationDataMap["reward_unlocked"];
      await sendRewardUnlocked({
        mobile: customer.phone,
        customerName: customer.name,
        businessName: d.businessName,
        currentStamps: d.currentStamps,
        requiredStamps: d.requiredStamps,
        rewardTitle: d.rewardTitle,
        publicToken: customer.publicToken,
      });
      return;
    }
    case "stamp_collected_last_wait_time": {
      const d = data as CustomerNotificationDataMap["stamp_collected_last_wait_time"];
      await sendStampCollectedLastWaitTime({
        mobile: customer.phone,
        customerName: customer.name,
        businessName: d.businessName,
        currentStamps: d.currentStamps,
        requiredStamps: d.requiredStamps,
        waitLabel: d.waitLabel,
        publicToken: customer.publicToken,
      });
      return;
    }
    case "reward_ready_wait_time": {
      const d = data as CustomerNotificationDataMap["reward_ready_wait_time"];
      await sendRewardReadyWaitTime({
        mobile: customer.phone,
        customerName: customer.name,
        businessName: d.businessName,
        currentStamps: d.currentStamps,
        requiredStamps: d.requiredStamps,
        rewardTitle: d.rewardTitle,
        publicToken: customer.publicToken,
      });
      return;
    }
    case "reward_redeemed": {
      const d = data as CustomerNotificationDataMap["reward_redeemed"];
      await sendRewardRedeemed({
        mobile: customer.phone,
        customerName: customer.name,
        businessName: d.businessName,
        rewardTitle: d.rewardTitle,
        publicToken: customer.publicToken,
      });
      return;
    }
    case "waitlist_called": {
      const d = data as CustomerNotificationDataMap["waitlist_called"];
      const body = [
        customer.name,
        d.businessName,
        d.position != null ? String(d.position) : "now",
      ];
      await sendWhatsAppTemplate({
        templateName: "waitlist_called",
        mobile: customer.phone,
        bodyParams: body,
        publicToken: customer.publicToken,
      });
      return;
    }
    case "reservation_confirmed": {
      const d = data as CustomerNotificationDataMap["reservation_confirmed"];
      await sendWhatsAppTemplate({
        templateName: "reservation_confirmed",
        mobile: customer.phone,
        bodyParams: [
          customer.name,
          d.businessName,
          d.when,
          d.partySize != null ? String(d.partySize) : "1",
        ],
        publicToken: customer.publicToken,
      });
      return;
    }
    default: {
      const _exhaustive: never = template;
      throw new Error(`Unsupported WhatsApp template: ${_exhaustive}`);
    }
  }
}

/**
 * Single entry point for all customer notifications.
 * Routes to WhatsApp only when the customer is known to have WhatsApp and prefers it;
 * otherwise sends SMS. Never attempts WhatsApp when whatsappAvailable is false.
 */
export async function sendCustomerNotification<T extends CustomerNotificationTemplate>(input: {
  customer: NotifiableCustomer;
  template: T;
  data: CustomerNotificationDataMap[T];
}): Promise<SendCustomerNotificationResult> {
  const { customer, template, data } = input;
  const useWhatsApp = shouldSendWhatsApp(customer);
  const channel: NotificationChannel = useWhatsApp ? "whatsapp" : "sms";

  notifLog("info", "dispatch", {
    template,
    channel,
    whatsappAvailable: customer.whatsappAvailable,
    preferred: customer.preferredNotificationChannel,
    publicToken: customer.publicToken,
  });

  // Fail fast if a non-token slipped through (slug / uuid / sample).
  try {
    const { requireCustomerPublicToken } = await import("@/lib/customer/hub");
    requireCustomerPublicToken(customer.publicToken);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "invalid publicToken";
    notifLog("error", "invalid_public_token", { template, reason });
    return { ok: false, channel, error: reason };
  }

  try {
    if (useWhatsApp) {
      await sendWhatsAppForTemplate(template, customer, data);
      return { ok: true, channel: "whatsapp" };
    }

    const message = buildSmsBody(
      template,
      customer,
      data as CustomerNotificationDataMap[CustomerNotificationTemplate],
    );
    const sms = await sendTransactionalSms({
      mobile: customer.phone,
      message,
      templateId: smsTemplateIdFor(template),
    });
    if (!sms.ok) {
      notifLog("error", "sms_dispatch_failed", { template, error: sms.message });
      return { ok: false, channel: "sms", error: sms.message };
    }
    return { ok: true, channel: "sms" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    notifLog("error", "dispatch_failed", { template, channel, reason });
    return { ok: false, channel, error: reason };
  }
}
