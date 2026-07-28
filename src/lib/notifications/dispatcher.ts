import "server-only";

import {
  sendQueueCustomerCalled,
  sendQueueCustomerCalledReminder1,
  sendQueueCustomerCalledReminder2,
  sendQueueCustomerCalledReminder3,
  sendQueueCustomerSeated,
  sendQueueCustomerSkipped,
  sendQueueJoined,
  sendRewardReadyWaitTime,
  sendRewardRedeemed,
  sendRewardUnlocked,
  sendStampCollectedLastWaitTime,
  sendStampVerified,
  sendWhatsAppTemplate,
} from "@/lib/whatsapp/notifications";
import {
  isTransactionalSmsConfigured,
  sendTransactionalSms,
} from "@/lib/notifications/sms";
import {
  buildSmsBody,
  isQueueNotificationTemplate,
  isReservationNotificationTemplate,
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
        rewardTitle: d.rewardTitle,
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
        rewardTitle: d.rewardTitle,
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
    // Reservation Meta body: {{1}} name, {{2}} restaurant, {{3}} date,
    // {{4}} time, {{5}} party size. URL button {{1}} is the rsv_… token.
    case "reservation_request_received":
    case "reservation_confirmed":
    case "reservation_updated":
    case "reservation_reminder":
    case "reservation_declined": {
      const d = data as CustomerNotificationDataMap["reservation_confirmed"];
      await sendWhatsAppTemplate({
        templateName: template,
        mobile: customer.phone,
        bodyParams: [
          customer.name,
          d.businessName,
          d.date,
          d.time,
          d.partySize != null ? String(d.partySize) : "1",
        ],
        reservationToken: d.reservationToken,
      });
      return;
    }
    case "queue_first_notify": {
      const d = data as CustomerNotificationDataMap["queue_first_notify"];
      await sendQueueJoined({
        mobile: customer.phone,
        customerName: customer.name,
        businessName: d.businessName,
        bookingSize: d.bookingSize,
        queuePosition: d.queuePosition,
        estimatedWaitMinutes: d.estimatedWaitMinutes,
        publicToken: customer.publicToken,
      });
      return;
    }
    case "queue_call_now": {
      const d = data as CustomerNotificationDataMap["queue_call_now"];
      await sendQueueCustomerCalled({
        mobile: customer.phone,
        customerName: customer.name,
        businessName: d.businessName,
        bookingSize: d.bookingSize,
        publicToken: customer.publicToken,
      });
      return;
    }
    case "queue_reminders_1": {
      const d = data as CustomerNotificationDataMap["queue_reminders_1"];
      await sendQueueCustomerCalledReminder1({
        mobile: customer.phone,
        customerName: customer.name,
        businessName: d.businessName,
        bookingSize: d.bookingSize,
        publicToken: customer.publicToken,
      });
      return;
    }
    case "queue_reminder_2": {
      const d = data as CustomerNotificationDataMap["queue_reminder_2"];
      await sendQueueCustomerCalledReminder2({
        mobile: customer.phone,
        customerName: customer.name,
        businessName: d.businessName,
        bookingSize: d.bookingSize,
        publicToken: customer.publicToken,
      });
      return;
    }
    case "queue_reminder_3": {
      const d = data as CustomerNotificationDataMap["queue_reminder_3"];
      await sendQueueCustomerCalledReminder3({
        mobile: customer.phone,
        customerName: customer.name,
        businessName: d.businessName,
        bookingSize: d.bookingSize,
        publicToken: customer.publicToken,
      });
      return;
    }
    case "queue_customer_skipped": {
      const d = data as CustomerNotificationDataMap["queue_customer_skipped"];
      await sendQueueCustomerSkipped({
        mobile: customer.phone,
        customerName: customer.name,
        businessName: d.businessName,
        bookingSize: d.bookingSize,
        publicToken: customer.publicToken,
      });
      return;
    }
    case "queue_seated": {
      const d = data as CustomerNotificationDataMap["queue_seated"];
      await sendQueueCustomerSeated({
        mobile: customer.phone,
        customerName: customer.name,
        businessName: d.businessName,
        bookingSize: d.bookingSize,
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
 *
 * - Loyalty / general: WhatsApp only when whatsappAvailable + preferred WhatsApp.
 * - Queue templates: WhatsApp only (Meta templates; no SMS fallback).
 * - Other templates: SMS fallback when transactional SMS env is configured.
 */
export async function sendCustomerNotification<T extends CustomerNotificationTemplate>(input: {
  customer: NotifiableCustomer;
  template: T;
  data: CustomerNotificationDataMap[T];
}): Promise<SendCustomerNotificationResult> {
  const { customer, template, data } = input;
  const queueTemplate = isQueueNotificationTemplate(template);
  // Reservation guests are messaged on WhatsApp by default (that is the product
  // promise), but unlike queue they keep the SMS fallback.
  const useWhatsApp =
    shouldSendWhatsApp(customer) ||
    queueTemplate ||
    isReservationNotificationTemplate(template);
  const channel: NotificationChannel = useWhatsApp ? "whatsapp" : "sms";

  notifLog("info", "dispatch", {
    template,
    channel,
    queueTemplate,
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
      try {
        await sendWhatsAppForTemplate(template, customer, data);
        return { ok: true, channel: "whatsapp" };
      } catch (waError) {
        const waReason = waError instanceof Error ? waError.message : "whatsapp_failed";
        notifLog("warn", "whatsapp_dispatch_failed", { template, error: waReason });

        if (queueTemplate) {
          return { ok: false, channel: "whatsapp", error: waReason };
        }

        if (!isTransactionalSmsConfigured()) {
          return { ok: false, channel: "whatsapp", error: waReason };
        }
        // Fall through to SMS when configured.
        notifLog("info", "fallback_to_sms", { template });
      }
    }

    if (!isTransactionalSmsConfigured()) {
      return {
        ok: false,
        channel: "sms",
        error:
          "No delivery channel available. WhatsApp was not used and transactional SMS is not configured.",
      };
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
