import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_VERIFY_ATTEMPTS, OTP_LENGTH } from "@/lib/auth/otp/config";
import { verifyOtpHash } from "@/lib/auth/otp/hash";
import {
  clearOtps,
  findActiveOtp,
  incrementAttempts,
} from "@/lib/auth/otp/store";
import { establishPhoneSession } from "@/lib/auth/otp/session";
import { maskPhone, toCanonicalPhone } from "@/lib/auth/otp/phone";
import { otpLog } from "@/lib/auth/otp/logger";
import type { VerifyOtpResult } from "@/lib/auth/otp/types";

export const runtime = "nodejs";

const bodySchema = z.object({
  phone: z.string().min(8).max(20),
  otp: z.string().regex(new RegExp(`^\\d{4,6}$`)),
});

function json(body: VerifyOtpResult, status: number) {
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  let parsed: { phone: string; otp: string };
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return json({ ok: false, message: `Enter the ${OTP_LENGTH}-digit code we sent you.` }, 400);
  }

  const phone = toCanonicalPhone(parsed.phone);
  if (!phone) {
    return json({ ok: false, message: "Enter a valid mobile number." }, 400);
  }

  const record = await findActiveOtp(phone);
  if (!record) {
    return json({ ok: false, message: "This code has expired. Please request a new one." }, 410);
  }

  if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
    await clearOtps(phone);
    otpLog.warn("attempts_exceeded", { phone: maskPhone(phone) });
    return json({ ok: false, message: "Too many incorrect attempts. Please request a new code." }, 429);
  }

  if (!verifyOtpHash(parsed.otp, phone, record.otp_hash)) {
    await incrementAttempts(record.id, record.attempts);
    otpLog.warn("otp_mismatch", { phone: maskPhone(phone), attempts: record.attempts + 1 });
    return json({ ok: false, message: "That code is incorrect. Please try again." }, 401);
  }

  // Correct code — provision/find the account and mint the session.
  const session = await establishPhoneSession(phone);
  if (!session.ok) {
    return json({ ok: false, message: "Could not complete sign in. Please try again." }, 500);
  }

  // Cleanup: the OTP is single-use, so remove it now that login succeeded.
  await clearOtps(phone);

  otpLog.info("otp_verified", { phone: maskPhone(phone), isNewUser: session.isNewUser });
  return json(
    { ok: true, message: "Verified.", isNewUser: session.isNewUser },
    200,
  );
}
