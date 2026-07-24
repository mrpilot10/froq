import { NextResponse } from "next/server";
import { z } from "zod";
import {
  MAX_REQUESTS_PER_MINUTE,
  RESEND_SECONDS,
} from "@/lib/auth/otp/config";
import { generateOtp, hashOtp } from "@/lib/auth/otp/hash";
import { deliverOtp } from "@/lib/auth/otp/deliver";
import {
  countRecentRequests,
  lastRequestAt,
  persistOtp,
  purgeExpired,
  clearOtps,
  updateOtpDelivery,
} from "@/lib/auth/otp/store";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { maskPhone, toCanonicalPhone } from "@/lib/auth/otp/phone";
import { otpLog } from "@/lib/auth/otp/logger";
import type { SendOtpResult } from "@/lib/auth/otp/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  phone: z.string().min(8).max(20),
});

function json(body: SendOtpResult, status: number) {
  return NextResponse.json(body, { status });
}

function otpTableHint(error?: string): string {
  if (!error) return "";
  const lower = error.toLowerCase();
  if (lower.includes("otp_codes") || lower.includes("does not exist") || lower.includes("42p01")) {
    return " Run supabase/migrations/0004_otp.sql in your Supabase SQL editor.";
  }
  return "";
}

function userFacingError(error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error);
  if (reason.includes("OTP_HASH_SECRET")) {
    return "OTP_HASH_SECRET is not set in Vercel environment variables. Add a random string (32+ chars) and redeploy.";
  }
  if (reason.toLowerCase().includes("otp_codes") || reason.includes("42P01")) {
    return `Database table missing.${otpTableHint(reason)}`;
  }
  return "Something went wrong. Please try again.";
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

    const hashSecret = process.env.OTP_HASH_SECRET?.trim();
    if (!hashSecret || hashSecret.length < 16) {
      otpLog.error("otp_hash_misconfigured", { phone: maskPhone(phone) });
      return json(
        {
          ok: false,
          message:
            "OTP_HASH_SECRET is not configured. Add a random 32+ character string in Vercel → Environment Variables, then redeploy.",
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
      return json(
        {
          ok: false,
          message: `Could not start verification.${otpTableHint(stored.error)} Check Supabase credentials and the otp_codes table.`,
        },
        500,
      );
    }

    // WhatsApp first, SMS fallback. Await so the client gets the real channel.
    const delivery = await deliverOtp(phone, otp);
    if (!delivery.ok) {
      await clearOtps(phone);
      return json({ ok: false, message: delivery.message }, 502);
    }

    await updateOtpDelivery(phone, {
      requestId: delivery.requestId,
      channel: delivery.channel,
    });

    otpLog.info("otp_issued", {
      phone: maskPhone(phone),
      channel: delivery.channel,
      requestId: delivery.requestId,
    });

    return json(
      {
        ok: true,
        message: delivery.message,
        channel: delivery.channel,
        requestId: delivery.requestId,
      },
      200,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    otpLog.error("send_otp_unhandled", { reason });
    return json({ ok: false, message: userFacingError(error) }, 500);
  }
}
