// Browser-side helpers used by the auth UIs to talk to the OTP route handlers.
// Re-exports the shared constants so components keep a single import source.

import type { SendOtpResult, VerifyOtpResult } from "./types";

export { OTP_LENGTH, RESEND_SECONDS } from "./config";
export type { SendOtpResult, VerifyOtpResult } from "./types";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

/** Requests an OTP for a 10-digit phone. Resending is just calling this again. */
export async function sendOtp(phone: string): Promise<SendOtpResult> {
  try {
    return await postJson<SendOtpResult>("/api/send-otp", { phone });
  } catch {
    return { ok: false, message: "Network error. Please try again." };
  }
}

/** Verifies the submitted code; on success the auth session cookie is set. */
export async function verifyOtp(phone: string, otp: string): Promise<VerifyOtpResult> {
  try {
    return await postJson<VerifyOtpResult>("/api/verify-otp", { phone, otp });
  } catch {
    return { ok: false, message: "Network error. Please try again." };
  }
}
