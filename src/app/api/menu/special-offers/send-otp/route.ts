import { NextResponse } from "next/server";
import {
  MAX_REQUESTS_PER_MINUTE,
  RESEND_SECONDS,
} from "@/lib/auth/otp/config";
import { generateOtp, hashOtp } from "@/lib/auth/otp/hash";
import { deliverOtp } from "@/lib/auth/otp/deliver";
import {
  claimOtpSendSlot,
  clearOtps,
  countRecentRequests,
  persistOtp,
  purgeExpired,
  updateOtpDelivery,
} from "@/lib/auth/otp/store";
import { maskPhone, toCanonicalPhone } from "@/lib/auth/otp/phone";
import { otpLog } from "@/lib/auth/otp/logger";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { callerKey, throttle } from "@/lib/menu/guest-throttle";
import {
  resolveMerchantForMenuSlug,
  SPECIAL_OFFERS_OTP_LIMIT,
  specialOffersFormSchema,
} from "@/lib/menu/special-offers";

export const runtime = "nodejs";
export const maxDuration = 30;

function json(body: { ok: boolean; message: string; resendSeconds?: number }, status: number) {
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  try {
    const capped = throttle(callerKey(request, "menu-offers-otp"), SPECIAL_OFFERS_OTP_LIMIT);
    if (!capped.ok) {
      return json(
        {
          ok: false,
          message: `Too many requests. Try again in ${capped.retryAfter}s.`,
        },
        429,
      );
    }

    let parsed: ReturnType<typeof specialOffersFormSchema.parse>;
    try {
      parsed = specialOffersFormSchema.parse(await request.json());
    } catch {
      return json({ ok: false, message: "Please fill in every field." }, 400);
    }

    const merchant = await resolveMerchantForMenuSlug(parsed.slug);
    if (!merchant) {
      return json({ ok: false, message: "Menu not found." }, 404);
    }

    const phone = toCanonicalPhone(parsed.phone);
    if (!phone) {
      return json({ ok: false, message: "Enter a valid mobile number." }, 400);
    }

    // Rate limits + OTP delivery remain the bot controls for this required guest form.

    if (!isSupabaseConfigured()) {
      return json({ ok: false, message: "Service unavailable. Please try again later." }, 503);
    }

    await purgeExpired();

    const slot = await claimOtpSendSlot(phone, RESEND_SECONDS);
    if (!slot.ok) {
      return json(
        {
          ok: false,
          message: `Please wait ${slot.retryAfter}s before requesting another code.`,
          resendSeconds: slot.retryAfter,
        },
        429,
      );
    }

    const recent = await countRecentRequests(phone);
    if (recent >= MAX_REQUESTS_PER_MINUTE) {
      return json(
        { ok: false, message: "Too many codes sent. Please wait a minute." },
        429,
      );
    }

    const otp = generateOtp();
    const otpHash = hashOtp(otp, phone);
    const stored = await persistOtp({ phone, otpHash });
    if (!stored.ok) {
      otpLog.error("menu_offers_persist_failed", { phone: maskPhone(phone) });
      return json({ ok: false, message: "Could not send a code. Please try again." }, 500);
    }

    const delivery = await deliverOtp(phone, otp);
    if (!delivery.ok) {
      await clearOtps(phone);
      otpLog.error("menu_offers_deliver_failed", {
        phone: maskPhone(phone),
        reason: delivery.message,
      });
      return json(
        { ok: false, message: delivery.message || "Could not send the code." },
        502,
      );
    }

    await updateOtpDelivery(phone, {
      requestId: delivery.requestId,
      channel: delivery.channel,
    });

    otpLog.info("menu_offers_otp_sent", {
      phone: maskPhone(phone),
      merchantId: merchant.merchantId,
      channel: delivery.channel,
    });

    return json(
      {
        ok: true,
        message: "Code sent.",
        resendSeconds: RESEND_SECONDS,
      },
      200,
    );
  } catch (error) {
    otpLog.error("menu_offers_send_unhandled", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return json({ ok: false, message: "Something went wrong. Please try again." }, 500);
  }
}
