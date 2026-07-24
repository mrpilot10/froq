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
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { maskPhone, toCanonicalPhone } from "@/lib/auth/otp/phone";
import { otpLog } from "@/lib/auth/otp/logger";
import type { VerifyOtpResult } from "@/lib/auth/otp/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  phone: z.string().min(8).max(20),
  otp: z.string().regex(new RegExp(`^\\d{4,6}$`)),
});

function json(body: VerifyOtpResult, status: number) {
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  try {
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

    if (!isSupabaseConfigured()) {
      return json({ ok: false, message: "Database is not configured on the server." }, 503);
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

    const deliveryChannel = record.channel === "whatsapp" ? "whatsapp" : "sms";

    const session = await establishPhoneSession(phone);
    if (!session.ok) {
      const err = session.error ?? "";
      otpLog.error("verify_session_failed", { phone: maskPhone(phone), reason: err });
      const errLower = err.toLowerCase();
      const message = err.includes("auth_user_id_by_phone")
        ? "Database migration missing. Run supabase/migrations/0004_otp.sql in Supabase SQL editor."
        : errLower.includes("phone logins are disabled") || errLower.includes("phone provider")
          ? "Phone auth is disabled in Supabase. Go to Authentication → Providers → Phone, enable it, and allow phone + password sign-in. You do not need a Supabase SMS provider — APITxT sends the OTP."
          : errLower.includes("password")
            ? "Enable phone + password sign-in in Supabase → Authentication → Providers → Phone."
            : err || "Could not complete sign in. Please try again.";
      return json({ ok: false, message }, 500);
    }

    // WhatsApp OTP success → permanently prefer WhatsApp for this customer.
    // SMS OTP success → leave whatsapp_available / preferred channel unchanged.
    if (deliveryChannel === "whatsapp") {
      const { markWhatsAppAvailableForPhone } = await import("@/lib/notifications/prefs");
      await markWhatsAppAvailableForPhone({ phone, userId: session.userId });
    }

    await clearOtps(phone);

    otpLog.info("otp_verified", {
      phone: maskPhone(phone),
      isNewUser: session.isNewUser,
      channel: deliveryChannel,
    });
    return json({ ok: true, message: "Verified.", isNewUser: session.isNewUser }, 200);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    otpLog.error("verify_otp_unhandled", { reason });
    const message =
      reason.includes("OTP_HASH_SECRET")
        ? "OTP_HASH_SECRET is not set on the server."
        : reason.toLowerCase().includes("otp_codes") || reason.includes("auth_user_id_by_phone")
          ? "Database migration missing. Run supabase/migrations/0004_otp.sql in Supabase."
          : "Something went wrong. Please try again.";
    return json({ ok: false, message }, 500);
  }
}
