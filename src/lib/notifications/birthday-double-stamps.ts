import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendCustomerNotification } from "@/lib/notifications/dispatcher";
import { CustomerNotificationTemplate } from "@/lib/notifications/types";
import { requireCustomerPublicToken } from "@/lib/customer/hub";

const TZ = "Asia/Kolkata";
/** Local hour (0–23) to send birthday WhatsApp messages. */
const SEND_HOUR = 9;

function notifLog(
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, unknown>,
) {
  const line = {
    scope: "birthday_bonus_stamps",
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

function firstName(fullName: string): string {
  const part = fullName.trim().split(/\s+/).filter(Boolean)[0];
  return part || "there";
}

/** Today's calendar date + hour in Asia/Kolkata. */
function nowPartsInTz(now = new Date()): {
  year: number;
  month: number;
  day: number;
  hour: number;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  return {
    year: Number(parts.find((p) => p.type === "year")?.value),
    month: Number(parts.find((p) => p.type === "month")?.value),
    day: Number(parts.find((p) => p.type === "day")?.value),
    hour: Number(parts.find((p) => p.type === "hour")?.value),
  };
}

export interface BirthdayBonusStampResult {
  candidates: number;
  sent: number;
  failed: number;
  skipped: number;
  deferred?: boolean;
}

/**
 * At 9:00 AM Asia/Kolkata, send birthday_bonus_stamps to opted-in merchants'
 * customers whose birthday is today. Marks birthday_notify_year so we only
 * send once per year.
 */
export async function processBirthdayBonusStampNotifications(): Promise<BirthdayBonusStampResult> {
  const admin = createAdminClient();
  const { year, month, day, hour } = nowPartsInTz();

  if (hour !== SEND_HOUR) {
    notifLog("info", "deferred_until_9am", { hour, sendHour: SEND_HOUR });
    return { candidates: 0, sent: 0, failed: 0, skipped: 0, deferred: true };
  }

  const { data: merchants, error: merchantsError } = await admin
    .from("merchants")
    .select("id, business_name, reward_name")
    .eq("birthday_double_stamps", true);

  if (merchantsError) {
    notifLog("error", "merchants_query_failed", { error: merchantsError.message });
    throw new Error(merchantsError.message);
  }

  if (!merchants?.length) {
    return { candidates: 0, sent: 0, failed: 0, skipped: 0 };
  }

  const merchantById = new Map(merchants.map((m) => [m.id, m]));
  const merchantIds = merchants.map((m) => m.id);

  const { data: customers, error: customersError } = await admin
    .from("customers")
    .select(
      "id, merchant_id, name, phone, public_token, whatsapp_available, preferred_notification_channel, birthdate, birthday_notify_year, banned",
    )
    .in("merchant_id", merchantIds)
    .eq("banned", false)
    .not("birthdate", "is", null)
    .or(`birthday_notify_year.is.null,birthday_notify_year.neq.${year}`);

  if (customersError) {
    notifLog("error", "customers_query_failed", { error: customersError.message });
    throw new Error(customersError.message);
  }

  const birthdayCustomers = (customers ?? []).filter((c) => {
    if (!c.birthdate) return false;
    const [, bm, bd] = c.birthdate.split("-").map(Number);
    return bm === month && bd === day;
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const customer of birthdayCustomers) {
    const merchant = merchantById.get(customer.merchant_id);
    if (!merchant) {
      skipped += 1;
      continue;
    }

    const rewardName = merchant.reward_name?.trim() || "your reward";

    let publicToken: string;
    try {
      publicToken = requireCustomerPublicToken(customer.public_token);
    } catch {
      skipped += 1;
      continue;
    }

    if (!customer.phone?.trim()) {
      skipped += 1;
      continue;
    }

    const result = await sendCustomerNotification({
      customer: {
        phone: customer.phone,
        name: customer.name,
        whatsappAvailable: customer.whatsapp_available === true,
        preferredNotificationChannel:
          customer.preferred_notification_channel === "whatsapp" ? "whatsapp" : "sms",
        publicToken,
      },
      template: CustomerNotificationTemplate.BirthdayBonusStamps,
      data: {
        businessName: merchant.business_name,
        rewardName,
      },
    });

    if (!result.ok) {
      failed += 1;
      notifLog("warn", "send_failed", {
        customerId: customer.id,
        merchantId: customer.merchant_id,
        error: result.error,
      });
      continue;
    }

    const { error: markError } = await admin
      .from("customers")
      .update({ birthday_notify_year: year })
      .eq("id", customer.id);

    if (markError) {
      notifLog("warn", "mark_year_failed", {
        customerId: customer.id,
        error: markError.message,
      });
    }

    sent += 1;
    notifLog("info", "sent", {
      customerId: customer.id,
      merchantId: customer.merchant_id,
      channel: result.channel,
      firstName: firstName(customer.name),
    });
  }

  notifLog("info", "run_complete", {
    year,
    month,
    day,
    hour,
    candidates: birthdayCustomers.length,
    sent,
    failed,
    skipped,
  });

  return {
    candidates: birthdayCustomers.length,
    sent,
    failed,
    skipped,
  };
}

/** @deprecated Prefer processBirthdayBonusStampNotifications */
export const processBirthdayDoubleStampNotifications =
  processBirthdayBonusStampNotifications;
