import "server-only";

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { OTP_LENGTH } from "./config";

function secret(): string {
  const value = process.env.OTP_HASH_SECRET;
  if (!value || value.length < 16) {
    // Fail loud in production; OTP hashing must not silently use a weak key.
    if (process.env.NODE_ENV === "production") {
      throw new Error("OTP_HASH_SECRET is missing or too short.");
    }
    return "froq-dev-otp-secret-please-override";
  }
  return value;
}

/** Cryptographically random numeric OTP of OTP_LENGTH digits (no modulo bias). */
export function generateOtp(): string {
  let code = "";
  for (let i = 0; i < OTP_LENGTH; i += 1) code += randomInt(0, 10).toString();
  return code;
}

/** HMAC-SHA256 of the OTP, scoped to the phone so a hash can't be replayed elsewhere. */
export function hashOtp(otp: string, phone: string): string {
  return createHmac("sha256", secret()).update(`${phone}:${otp}`).digest("hex");
}

/** Constant-time comparison of a submitted OTP against a stored hash. */
export function verifyOtpHash(otp: string, phone: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashOtp(otp, phone), "hex");
  const stored = Buffer.from(storedHash, "hex");
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}
