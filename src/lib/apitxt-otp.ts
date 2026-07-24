import "server-only";

import { otpLog } from "@/lib/auth/otp/logger";
import { maskPhone, toCanonicalPhone } from "@/lib/auth/otp/phone";

const APITXT_SEND_OTP_URL = "https://apitxt.com/api/sendOTP";

/** Known dial codes (longest match wins). */
const DIAL_CODES = ["971", "91", "65", "44", "1"] as const;

interface ApitxtOtpResponse {
  status?: string;
  message?: string;
  data?: {
    request_id?: string;
    mobile?: string;
    cost?: number;
  };
}

export interface SendWhatsAppOtpResult {
  ok: boolean;
  requestId?: string;
  cost?: number;
  message: string;
}

/**
 * APITxT WhatsApp OTP expects `country` as the numeric dialing code
 * (e.g. "91"), not an ISO alpha-2 like "IN".
 */
function countryDialForMobile(mobile: string): string {
  const fromEnv = process.env.APITXT_WHATSAPP_COUNTRY?.trim();
  if (fromEnv) {
    const digits = fromEnv.replace(/\D/g, "");
    return digits || fromEnv;
  }

  for (const dial of DIAL_CODES) {
    if (mobile.startsWith(dial)) return dial;
  }
  return process.env.OTP_COUNTRY_CODE?.replace(/\D/g, "") || "91";
}

/**
 * Sends an OTP over WhatsApp via APITxT Unified OTP API.
 *
 * POST application/x-www-form-urlencoded to /api/sendOTP with channel=whatsapp.
 * Success only when response body status === "success".
 */
export async function sendWhatsAppOTP(
  phone: string,
  otp: string,
): Promise<SendWhatsAppOtpResult> {
  const authkey = process.env.APITXT_AUTH_KEY?.trim();
  const projectRefId =
    process.env.APITXT_PROJECT_REF_ID?.trim() || "PROJ_1c54b9ef2a44";
  const templateName =
    process.env.APITXT_WHATSAPP_TEMPLATE_NAME?.trim() || "otp";

  const mobile = toCanonicalPhone(phone);
  if (!mobile) {
    otpLog.error("apitxt_wa_invalid_phone", { reason: "phone failed canonicalization" });
    return { ok: false, message: "Enter a valid mobile number." };
  }

  if (!authkey) {
    otpLog.error("apitxt_wa_misconfigured", { reason: "APITXT_AUTH_KEY missing or empty" });
    return { ok: false, message: "WhatsApp provider is not configured." };
  }

  const country = countryDialForMobile(mobile);

  const body = new URLSearchParams({
    authkey,
    mobile,
    otp,
    channel: "whatsapp",
    template_name: templateName,
    project_ref_id: projectRefId,
    // Required by APITxT for WhatsApp OTP per-country billing (dial code, e.g. "91").
    country,
  });

  try {
    const res = await fetch(APITXT_SEND_OTP_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });

    const raw = await res.text();
    let parsed: ApitxtOtpResponse = {};
    try {
      parsed = raw ? (JSON.parse(raw) as ApitxtOtpResponse) : {};
    } catch {
      otpLog.error("apitxt_wa_bad_response", {
        mobile: maskPhone(mobile),
        httpStatus: res.status,
        raw: raw.slice(0, 200),
        channel: "whatsapp",
        deliveryStatus: "invalid_json",
      });
      return { ok: false, message: "Unexpected response from WhatsApp provider." };
    }

    if (parsed.status !== "success") {
      otpLog.error("apitxt_wa_send_failed", {
        mobile: maskPhone(mobile),
        httpStatus: res.status,
        providerStatus: parsed.status,
        providerMessage: parsed.message,
        requestId: parsed.data?.request_id,
        channel: "whatsapp",
        country,
        deliveryStatus: "failed",
      });
      return {
        ok: false,
        message: parsed.message ?? "Could not send the WhatsApp verification code.",
      };
    }

    const requestId = parsed.data?.request_id;
    const cost = parsed.data?.cost;

    otpLog.info("apitxt_wa_sent", {
      mobile: maskPhone(mobile),
      requestId,
      cost,
      channel: "whatsapp",
      country,
      deliveryStatus: "success",
    });

    return {
      ok: true,
      requestId,
      cost,
      message: "We've sent a verification code to your WhatsApp.",
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    otpLog.error("apitxt_wa_network_error", {
      mobile: maskPhone(mobile),
      reason,
      channel: "whatsapp",
      deliveryStatus: "network_error",
    });
    return { ok: false, message: "Could not reach the WhatsApp provider." };
  }
}
