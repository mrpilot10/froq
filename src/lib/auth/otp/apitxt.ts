import "server-only";

import { otpLog } from "./logger";
import { maskPhone } from "./phone";

const APITXT_SEND_OTP_URL = "https://apitxt.com/api/sendOTP";

// Documented APITxT Unified OTP API response shape.
interface ApitxtResponse {
  status?: string;
  message?: string;
  data?: {
    request_id?: string;
    mobile?: string;
    cost?: number;
  };
}

export interface SendSmsOtpResult {
  ok: boolean;
  requestId?: string;
  cost?: number;
  message: string;
}

/**
 * Sends an OTP over SMS using APITxT's Unified OTP API with the system default
 * SMS template. Passes only authkey, mobile, and otp (no template_id) so the
 * admin-configured default SMS OTP template is used.
 *
 * @param mobile  Receiver number with country code, no '+' (e.g. 919876543210).
 * @param otp     The OTP code you generated (never logged or stored).
 */
export async function sendSmsOtp(mobile: string, otp: string): Promise<SendSmsOtpResult> {
  const authkey = process.env.APITXT_AUTH_KEY?.trim();
  if (!authkey) {
    otpLog.error("apitxt_misconfigured", { reason: "APITXT_AUTH_KEY missing or empty" });
    return {
      ok: false,
      message:
        "SMS provider is not configured. Add APITXT_AUTH_KEY in Vercel → Settings → Environment Variables, then redeploy.",
    };
  }

  // Example 1 (system default SMS template):
  // GET https://apitxt.com/api/sendOTP?authkey=YOUR_KEY&mobile=919999999999&otp=4521
  // Only authkey, mobile, otp — no template_id, no channel (sms is the default).
  const url = new URL(APITXT_SEND_OTP_URL);
  url.searchParams.set("authkey", authkey);
  url.searchParams.set("mobile", mobile);
  url.searchParams.set("otp", otp);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });

    const raw = await res.text();
    let parsed: ApitxtResponse = {};
    try {
      parsed = raw ? (JSON.parse(raw) as ApitxtResponse) : {};
    } catch {
      otpLog.error("apitxt_bad_response", { mobile: maskPhone(mobile), status: res.status, raw: raw.slice(0, 200) });
      return { ok: false, message: "Unexpected response from SMS provider." };
    }

    if (parsed.status !== "success") {
      otpLog.error("apitxt_send_failed", {
        mobile: maskPhone(mobile),
        httpStatus: res.status,
        providerStatus: parsed.status,
        providerMessage: parsed.message,
      });
      return { ok: false, message: parsed.message ?? "Could not send the verification code." };
    }

    const { request_id, cost } = parsed.data ?? {};

    otpLog.info("apitxt_sent", {
      mobile: maskPhone(mobile),
      requestId: request_id,
      cost,
    });

    return {
      ok: true,
      requestId: request_id,
      cost,
      message: parsed.message ?? "Sms OTP Sent Successfully",
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    otpLog.error("apitxt_network_error", { mobile: maskPhone(mobile), reason });
    return { ok: false, message: "Could not reach the SMS provider. Please try again." };
  }
}
