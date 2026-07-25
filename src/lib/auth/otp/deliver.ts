import "server-only";

import { sendSmsOtp } from "@/lib/auth/otp/apitxt";
import { otpLog } from "@/lib/auth/otp/logger";
import { maskPhone } from "@/lib/auth/otp/phone";
import { sendWhatsAppOTP } from "@/lib/apitxt-otp";

export type OtpDeliveryChannel = "whatsapp" | "sms";
export type OtpDeliveryOrder = "whatsapp-first" | "sms-first";

export interface DeliverOtpResult {
  ok: boolean;
  channel?: OtpDeliveryChannel;
  requestId?: string;
  message: string;
  retryAfter?: number;
}

/** APITxT often returns "Please wait N seconds before requesting another OTP…". */
function parseRetryAfterSeconds(message: string): number | null {
  const match = message.match(/wait\s+(\d+)\s+seconds?/i);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function trySms(
  phone: string,
  otp: string,
  opts?: { retryOnRateLimit?: boolean; fallback?: boolean },
): Promise<{ ok: true; result: DeliverOtpResult } | { ok: false; message: string; retryAfter?: number }> {
  let sms = await sendSmsOtp(phone, otp);

  if (!sms.ok && opts?.retryOnRateLimit) {
    const retryAfter = parseRetryAfterSeconds(sms.message);
    if (retryAfter && retryAfter <= 30) {
      otpLog.warn("sms_rate_limited_retrying", {
        phone: maskPhone(phone),
        retryAfter,
        reason: sms.message,
      });
      await sleep((retryAfter + 1) * 1000);
      sms = await sendSmsOtp(phone, otp);
    }
  }

  if (!sms.ok) {
    return {
      ok: false,
      message: sms.message,
      retryAfter: parseRetryAfterSeconds(sms.message) ?? undefined,
    };
  }

  otpLog.info("otp_delivered", {
    phone: maskPhone(phone),
    channel: "sms",
    requestId: sms.requestId,
    deliveryStatus: "success",
    fallback: opts?.fallback === true,
  });

  return {
    ok: true,
    result: {
      ok: true,
      channel: "sms",
      requestId: sms.requestId,
      message: "We've sent your verification code by SMS.",
    },
  };
}

async function tryWhatsApp(
  phone: string,
  otp: string,
): Promise<{ ok: true; result: DeliverOtpResult } | { ok: false; message: string }> {
  const wa = await sendWhatsAppOTP(phone, otp);
  if (!wa.ok) return { ok: false, message: wa.message };

  otpLog.info("otp_delivered", {
    phone: maskPhone(phone),
    channel: "whatsapp",
    requestId: wa.requestId,
    deliveryStatus: "success",
  });

  return {
    ok: true,
    result: {
      ok: true,
      channel: "whatsapp",
      requestId: wa.requestId,
      message: "We've sent a verification code to your WhatsApp.",
    },
  };
}

/**
 * Delivers an already-generated OTP.
 * Does not generate or store the OTP — callers own that.
 *
 * Default: WhatsApp → SMS.
 * Use `sms-first` for flows where a WhatsApp failure can burn APITxT's
 * per-number cooldown and block the SMS fallback (e.g. account phone change).
 */
export async function deliverOtp(
  phone: string,
  otp: string,
  order: OtpDeliveryOrder = "whatsapp-first",
): Promise<DeliverOtpResult> {
  if (order === "sms-first") {
    const sms = await trySms(phone, otp, { retryOnRateLimit: true });
    if (sms.ok) return sms.result;

    otpLog.warn("sms_delivery_failed_falling_back_whatsapp", {
      phone: maskPhone(phone),
      reason: sms.message,
      channel: "sms",
      deliveryStatus: "failed",
    });

    const wa = await tryWhatsApp(phone, otp);
    if (wa.ok) return wa.result;

    otpLog.error("otp_delivery_failed", {
      phone: maskPhone(phone),
      smsReason: sms.message,
      whatsappReason: wa.message,
      deliveryStatus: "failed",
      retryAfter: sms.retryAfter,
      order,
    });

    return {
      ok: false,
      message: sms.message || wa.message || "Unable to send verification code. Please try again.",
      retryAfter: sms.retryAfter,
    };
  }

  const wa = await tryWhatsApp(phone, otp);
  if (wa.ok) return wa.result;

  otpLog.warn("whatsapp_delivery_failed_falling_back_sms", {
    phone: maskPhone(phone),
    reason: wa.message,
    channel: "whatsapp",
    deliveryStatus: "failed",
  });

  // WA failures often start APITxT's cooldown — retry SMS once if rate-limited.
  const sms = await trySms(phone, otp, { retryOnRateLimit: true, fallback: true });
  if (sms.ok) return sms.result;

  otpLog.error("otp_delivery_failed", {
    phone: maskPhone(phone),
    whatsappReason: wa.message,
    smsReason: sms.message,
    deliveryStatus: "failed",
    retryAfter: sms.retryAfter,
    order,
  });

  return {
    ok: false,
    message: sms.message || wa.message || "Unable to send verification code. Please try again.",
    retryAfter: sms.retryAfter,
  };
}
