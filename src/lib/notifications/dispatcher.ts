import "server-only";

import {
  sendQueueCustomerCalled,
  sendQueueCustomerCalledReminder1,
  sendQueueCustomerCalledReminder2,
  sendQueueCustomerCalledReminder3,
  sendQueueCustomerSeated,
  sendQueueCustomerSkipped,
  sendQueueJoined,
  sendQueueJoinedMenu,
  sendSeatedMenu,
  sendRewardReadyWaitTime,
  sendRewardRedeemed,
  sendRewardUnlocked,
  sendStampCollectedLastWaitTime,
  sendStampVerified,
  sendBirthdayBonusStamps,
  sendWhatsAppTemplate,
} from "@/lib/whatsapp/notifications";
import { buildReservationWhatsAppVars } from "@/lib/whatsapp/templates";
import {
  type CustomerNotificationDataMap,
  type CustomerNotificationTemplate,
  type NotifiableCustomer,
  type NotificationChannel,
} from "@/lib/notifications/types";
import {
  sendCustomerNotificationEmail,
  type CustomerEmailSendResult,
} from "@/lib/notifications/customer-email-channel";

export interface SendCustomerNotificationResult {
  ok: boolean;
  /** Primary messaging channel attempted (WhatsApp). */
  channel: NotificationChannel;
  error?: string;
  /** Parallel email attempt (independent of WhatsApp outcome). */
  email?: CustomerEmailSendResult;
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
    case "reservation_request_received":
    case "reservation_confirmed":
    case "reservation_updated":
    case "reservation_reminder":
    case "reservation_declined": {
      const d = data as CustomerNotificationDataMap["reservation_confirmed"];
      const vars = buildReservationWhatsAppVars({
        customerName: customer.name,
        businessName: d.businessName,
        date: d.date,
        time: d.time,
        partySize: d.partySize ?? 1,
        reservationToken: d.reservationToken,
      });
      await sendWhatsAppTemplate({
        templateName: template,
        mobile: customer.phone,
        bodyParams: [...vars.body],
        reservationToken: vars.reservationToken,
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
    case "queue_first_notify_menu": {
      const d = data as CustomerNotificationDataMap["queue_first_notify_menu"];
      await sendQueueJoinedMenu({
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
    case "queue_3_reminder": {
      const d = data as CustomerNotificationDataMap["queue_3_reminder"];
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
    case "seated_menu": {
      const d = data as CustomerNotificationDataMap["seated_menu"];
      await sendSeatedMenu({
        mobile: customer.phone,
        customerName: customer.name,
        businessName: d.businessName,
        bookingSize: d.bookingSize,
        publicToken: customer.publicToken,
      });
      return;
    }
    case "birthday_bonus_stamps": {
      const d = data as CustomerNotificationDataMap["birthday_bonus_stamps"];
      const firstName =
        customer.name.trim().split(/\s+/).filter(Boolean)[0] || customer.name || "there";
      await sendBirthdayBonusStamps({
        mobile: customer.phone,
        customerFirstName: firstName,
        businessName: d.businessName,
        rewardName: d.rewardName,
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
 * - WhatsApp always (product Meta templates).
 * - Email in parallel when `customer.email` is set — independent of WhatsApp.
 * - No SMS fallback for product alerts (OTP SMS remains separate).
 */
export async function sendCustomerNotification<T extends CustomerNotificationTemplate>(input: {
  customer: NotifiableCustomer;
  template: T;
  data: CustomerNotificationDataMap[T];
  /** Optional stable key so retries don't double-email. Auto-derived when omitted. */
  dedupeKey?: string;
}): Promise<SendCustomerNotificationResult> {
  const { customer, template, data } = input;
  const channel: NotificationChannel = "whatsapp";

  notifLog("info", "dispatch", {
    template,
    channel,
    whatsappAvailable: customer.whatsappAvailable,
    preferred: customer.preferredNotificationChannel,
    hasEmail: Boolean(customer.email?.trim()),
    publicToken: customer.publicToken,
  });

  const emailTask = sendCustomerNotificationEmail({
    customer,
    template,
    data,
    dedupeKey: input.dedupeKey,
  });

  const withEmail = async (
    primary: SendCustomerNotificationResult,
  ): Promise<SendCustomerNotificationResult> => {
    const email = await emailTask.catch(
      (err): CustomerEmailSendResult => ({
        ok: false,
        error: err instanceof Error ? err.message : "email_failed",
      }),
    );
    notifLog(email.ok ? "info" : "warn", "email_dispatch", {
      template,
      ok: email.ok,
      skipped: "skipped" in email ? email.skipped : false,
      reason:
        "skipped" in email && email.skipped
          ? email.reason
          : "error" in email
            ? email.error
            : null,
    });
    return { ...primary, email };
  };

  const needsPublicToken = template !== "reward_redeemed";
  if (needsPublicToken) {
    try {
      const { requireCustomerPublicToken } = await import("@/lib/customer/hub");
      requireCustomerPublicToken(customer.publicToken);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "invalid publicToken";
      notifLog("error", "invalid_public_token", { template, reason });
      return withEmail({ ok: false, channel, error: reason });
    }
  }

  try {
    await sendWhatsAppForTemplate(template, customer, data);
    return withEmail({ ok: true, channel: "whatsapp" });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "whatsapp_failed";
    notifLog("warn", "whatsapp_dispatch_failed", { template, error: reason });
    return withEmail({ ok: false, channel: "whatsapp", error: reason });
  }
}
