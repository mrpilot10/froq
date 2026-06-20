import "server-only";

import { otpLog } from "./logger";
import { maskPhone } from "./phone";

const APITXT_SEND_OTP_URL = "https://apitxt.com/api/sendOTP";

// Documented APITxT success response shape for the Unified OTP API.
interface ApitxtResponse {
  status?: number | string;
  message?: string;
  request_id?: string;
  mobile?: string;
  cost?: number | string;
}

export interface SendSmsOtpResult {
  ok: boolean;
  requestId?: string;
  cost?: number | string;
  message: string;
}

/**
 * Sends an OTP over SMS using APITxT's Unified OTP API with the system default
 * SMS template. Per the docs we pass only authkey, mobile and otp and omit
 * template_id so the default template is used.
 *
 * @param mobile  Canonical phone digits incl. country code (e.g. 919876543210).
 * @param otp     The plaintext OTP to deliver (never logged or stored).
 */
export async function sendSmsOtp(mobile: string, otp: string): Promise<SendSmsOtpResult> {
  const authkey = process.env.APITXT_AUTH_KEY;
  if (!authkey) {
    otpLog.error("apitxt_misconfigured", { reason: "APITXT_AUTH_KEY missing" });
    return { ok: false, message: "SMS provider is not configured." };
  }

  // APITxT reads these from the request params; we POST them as a query string,
  // which the endpoint accepts. No template_id → system default SMS template.
  const url = new URL(APITXT_SEND_OTP_URL);
  url.searchParams.set("authkey", authkey);
  url.searchParams.set("mobile", mobile);
  url.searchParams.set("otp", otp);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json" },
      // Don't let a hung provider hold the request open indefinitely.
      signal: AbortSignal.timeout(10_000),
    });

    const raw = await res.text();
    let body: ApitxtResponse = {};
    try {
      body = raw ? (JSON.parse(raw) as ApitxtResponse) : {};
    } catch {
      otpLog.error("apitxt_bad_response", { mobile: maskPhone(mobile), status: res.status, raw: raw.slice(0, 200) });
      return { ok: false, message: "Unexpected response from SMS provider." };
    }

    const isSuccess =
      res.ok && (body.status === 200 || body.status === "200" || body.message === "success");

    if (!isSuccess) {
      otpLog.error("apitxt_send_failed", {
        mobile: maskPhone(mobile),
        httpStatus: res.status,
        providerStatus: body.status,
        providerMessage: body.message,
      });
      return { ok: false, message: body.message ?? "Could not send the verification code." };
    }

    otpLog.info("apitxt_sent", {
      mobile: maskPhone(mobile),
      requestId: body.request_id,
      cost: body.cost,
    });

    return {
      ok: true,
      requestId: body.request_id,
      cost: body.cost,
      message: body.message ?? "success",
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    otpLog.error("apitxt_network_error", { mobile: maskPhone(mobile), reason });
    return { ok: false, message: "Could not reach the SMS provider. Please try again." };
  }
}
