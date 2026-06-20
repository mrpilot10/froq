// Browser-side helpers used by the auth UIs to talk to the OTP route handlers.
// Re-exports the shared constants so components keep a single import source.

import type { SendOtpResult, VerifyOtpResult } from "./types";

export { OTP_LENGTH, RESEND_SECONDS } from "./config";
export type { SendOtpResult, VerifyOtpResult } from "./types";

async function postJson<T extends { ok: boolean; message: string }>(
  url: string,
  body: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Could not reach the server. Check your connection and try again.");
  }

  const raw = await res.text();
  try {
    const parsed = raw ? (JSON.parse(raw) as T) : ({ ok: false, message: "Empty response." } as T);
    // Always surface the server's message when we got valid JSON back.
    if (!parsed.ok && parsed.message) return parsed;
    if (!res.ok && !parsed.message) {
      return { ...parsed, ok: false, message: `Request failed (${res.status}). Please try again.` } as T;
    }
    return parsed;
  } catch {
    if (res.status === 504) {
      throw new Error("The server timed out. Please try again — your code may still arrive.");
    }
    throw new Error(`Unexpected server response (${res.status}). Please try again.`);
  }
}

/** Requests an OTP for a 10-digit phone. Resending is just calling this again. */
export async function sendOtp(phone: string): Promise<SendOtpResult> {
  try {
    return await postJson<SendOtpResult>("/api/send-otp", { phone });
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Network error. Please try again.",
    };
  }
}

/** Verifies the submitted code; on success the auth session cookie is set. */
export async function verifyOtp(phone: string, otp: string): Promise<VerifyOtpResult> {
  try {
    return await postJson<VerifyOtpResult>("/api/verify-otp", { phone, otp });
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Network error. Please try again.",
    };
  }
}
