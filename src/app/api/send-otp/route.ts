import { NextResponse } from "next/server";
import { z } from "zod";
import {
  MAX_REQUESTS_PER_MINUTE,
  RESEND_SECONDS,
} from "@/lib/auth/otp/config";
import { generateOtp, hashOtp } from "@/lib/auth/otp/hash";
import { sendSmsOtp } from "@/lib/auth/otp/apitxt";
import {
  countRecentRequests,
  lastRequestAt,
  persistOtp,
  purgeExpired,
  clearOtps,
  updateOtpRequestId,
} from "@/lib/auth/otp/store";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { maskPhone, toCanonicalPhone } from "@/lib/auth/otp/phone";
import { otpLog } from "@/lib/auth/otp/logger";
import type { SendOtpResult } from "@/lib/auth/otp/types";

export const runtime = "nodejs";

const bodySchema = z.object({
  phone: z.string().min(8).max(20),
});

function json(body: SendOtpResult, status: number) {
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  let parsed: { phone: string };
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return json({ ok: false, message: "A valid phone number is required." }, 400);
  }

  const phone = toCanonicalPhone(parsed.phone);
  if (!phone) {
    return json({ ok: false, message: "Enter a valid mobile number." }, 400);
  }

  if (!isSupabaseConfigured()) {
    otpLog.error("supabase_misconfigured", { phone: maskPhone(phone) });
    return json(
      {
        ok: false,
        message:
          "Database is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local (or Vercel), then run migration 0004_otp.sql.",
      },
      503,
    );
  }

  await purgeExpired();

  // Resend cooldown — reject requests that arrive before the visible timer ends.
  const last = await lastRequestAt(phone);
  if (last) {
    const elapsed = Date.now() - last;
    const waitMs = RESEND_SECONDS * 1000 - elapsed;
    if (waitMs > 0) {
      const retryAfter = Math.ceil(waitMs / 1000);
      return json(
        { ok: false, message: `Please wait ${retryAfter}s before requesting another code.`, retryAfter },
        429,
      );
    }
  }

  // APITxT limit: at most 3 OTP requests per mobile per minute.
  const recent = await countRecentRequests(phone);
  if (recent >= MAX_REQUESTS_PER_MINUTE) {
    otpLog.warn("rate_limited", { phone: maskPhone(phone), recent });
    return json(
      { ok: false, message: "Too many attempts. Please try again in a minute.", retryAfter: 60 },
      429,
    );
  }

  const otp = generateOtp();
  const otpHash = hashOtp(otp, phone);

  // Store the hash before sending SMS so we never charge APITxT if persistence fails.
  const stored = await persistOtp({ phone, otpHash, requestId: undefined });
  if (!stored.ok) {
    otpLog.error("persist_failed", { phone: maskPhone(phone), reason: stored.error });
    const hint = stored.error?.includes("otp_codes")
      ? " Run supabase/migrations/0004_otp.sql in your Supabase SQL editor."
      : "";
    return json(
      {
        ok: false,
        message: `Could not start verification.${hint} Check Supabase credentials and the otp_codes table.`,
      },
      500,
    );
  }

  const delivery = await sendSmsOtp(phone, otp);
  if (!delivery.ok) {
    await clearOtps(phone);
    return json({ ok: false, message: delivery.message }, 502);
  }

  // Backfill APITxT request_id now that we have it.
  await updateOtpRequestId(phone, delivery.requestId);

  otpLog.info("otp_issued", { phone: maskPhone(phone), requestId: delivery.requestId });
  return json({ ok: true, message: "Verification code sent.", requestId: delivery.requestId }, 200);
}
