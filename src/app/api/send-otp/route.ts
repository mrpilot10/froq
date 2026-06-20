import { after, NextResponse } from "next/server";
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
// APITxT can be slow (~15s); allow headroom on Vercel Pro. Background `after()` keeps
// the client response fast even on the 10s Hobby limit.
export const maxDuration = 30;

const bodySchema = z.object({
  phone: z.string().min(8).max(20),
});

function json(body: SendOtpResult, status: number) {
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  try {
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
            "Database is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel, then run migration 0004_otp.sql.",
        },
        503,
      );
    }

    if (!process.env.APITXT_AUTH_KEY?.trim()) {
      otpLog.error("apitxt_misconfigured", { phone: maskPhone(phone) });
      return json(
        {
          ok: false,
          message:
            "SMS provider is not configured. Add APITXT_AUTH_KEY in Vercel → Environment Variables, then redeploy.",
        },
        503,
      );
    }

    await purgeExpired();

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

    // Return immediately; send SMS in the background so Vercel's 10s limit isn't hit
    // while waiting on APITxT (often 10–15s). The OTP screen shows right away.
    after(async () => {
      const delivery = await sendSmsOtp(phone, otp);
      if (delivery.ok) {
        await updateOtpRequestId(phone, delivery.requestId);
        otpLog.info("otp_issued", { phone: maskPhone(phone), requestId: delivery.requestId });
      } else {
        await clearOtps(phone);
        otpLog.error("apitxt_async_failed", { phone: maskPhone(phone), reason: delivery.message });
      }
    });

    return json({ ok: true, message: "Verification code sent." }, 200);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    otpLog.error("send_otp_unhandled", { reason });
    return json({ ok: false, message: "Something went wrong. Please try again." }, 500);
  }
}
