import "server-only";

import { sendSmsOtp } from "@/lib/auth/otp/apitxt";
import { otpLog } from "@/lib/auth/otp/logger";
import { maskPhone } from "@/lib/auth/otp/phone";
import { sendWhatsAppOTP } from "@/lib/apitxt-otp";

export type OtpDeliveryChannel = "whatsapp" | "sms";

export interface DeliverOtpResult {
  ok: boolean;
  channel?: OtpDeliveryChannel;
  requestId?: string;
  message: string;
}

/**
 * Delivers an already-generated OTP: WhatsApp first, SMS fallback.
 * Does not generate or store the OTP — callers own that.
 */
export async function deliverOtp(phone: string, otp: string): Promise<DeliverOtpResult> {
  const wa = await sendWhatsAppOTP(phone, otp);
  if (wa.ok) {
    otpLog.info("otp_delivered", {
      phone: maskPhone(phone),
      channel: "whatsapp",
      requestId: wa.requestId,
      deliveryStatus: "success",
    });
    return {
      ok: true,
      channel: "whatsapp",
      requestId: wa.requestId,
      message: "We've sent a verification code to your WhatsApp.",
    };
  }

  otpLog.warn("whatsapp_delivery_failed_falling_back_sms", {
    phone: maskPhone(phone),
    reason: wa.message,
    channel: "whatsapp",
    deliveryStatus: "failed",
  });

  const sms = await sendSmsOtp(phone, otp);
  if (sms.ok) {
    otpLog.info("otp_delivered", {
      phone: maskPhone(phone),
      channel: "sms",
      requestId: sms.requestId,
      deliveryStatus: "success",
      fallback: true,
    });
    return {
      ok: true,
      channel: "sms",
      requestId: sms.requestId,
      message: "We've sent your verification code by SMS.",
    };
  }

  otpLog.error("otp_delivery_failed", {
    phone: maskPhone(phone),
    whatsappReason: wa.message,
    smsReason: sms.message,
    deliveryStatus: "failed",
  });

  return {
    ok: false,
    message: "Unable to send verification code. Please try again.",
  };
}
