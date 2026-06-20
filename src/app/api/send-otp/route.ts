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
} from "@/lib/auth/otp/store";
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
  const delivery = await sendSmsOtp(phone, otp);
  if (!delivery.ok) {
    return json({ ok: false, message: delivery.message }, 502);
  }

  const stored = await persistOtp({ phone, otpHash: hashOtp(otp, phone), requestId: delivery.requestId });
  if (!stored.ok) {
    otpLog.error("persist_failed", { phone: maskPhone(phone), reason: stored.error });
    return json({ ok: false, message: "Could not start verification. Please try again." }, 500);
  }

  otpLog.info("otp_issued", { phone: maskPhone(phone), requestId: delivery.requestId });
  return json({ ok: true, message: "Verification code sent.", requestId: delivery.requestId }, 200);
}
