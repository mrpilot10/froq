import { NextResponse } from "next/server";
import { MAX_VERIFY_ATTEMPTS, OTP_LENGTH } from "@/lib/auth/otp/config";
import { verifyOtpHash } from "@/lib/auth/otp/hash";
import {
  clearOtps,
  findActiveOtp,
  incrementAttempts,
} from "@/lib/auth/otp/store";
import { maskPhone, toCanonicalPhone } from "@/lib/auth/otp/phone";
import { otpLog } from "@/lib/auth/otp/logger";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { callerKey, throttle } from "@/lib/menu/guest-throttle";
import {
  captureSpecialOffersGuest,
  resolveMenuBranchId,
  resolveMerchantForMenuSlug,
  SPECIAL_OFFERS_VERIFY_LIMIT,
  specialOffersVerifySchema,
} from "@/lib/menu/special-offers";

export const runtime = "nodejs";
export const maxDuration = 30;

function json(body: { ok: boolean; message: string }, status: number) {
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  try {
    const capped = throttle(
      callerKey(request, "menu-offers-verify"),
      SPECIAL_OFFERS_VERIFY_LIMIT,
    );
    if (!capped.ok) {
      return json(
        {
          ok: false,
          message: `Too many attempts. Try again in ${capped.retryAfter}s.`,
        },
        429,
      );
    }

    let parsed: ReturnType<typeof specialOffersVerifySchema.parse>;
    try {
      parsed = specialOffersVerifySchema.parse(await request.json());
    } catch {
      return json(
        { ok: false, message: `Enter the ${OTP_LENGTH}-digit code we sent you.` },
        400,
      );
    }

    const merchant = await resolveMerchantForMenuSlug(parsed.slug);
    if (!merchant) {
      return json({ ok: false, message: "Menu not found." }, 404);
    }

    const phone = toCanonicalPhone(parsed.phone);
    if (!phone) {
      return json({ ok: false, message: "Enter a valid mobile number." }, 400);
    }

    // Guest sheet no longer collects Turnstile; throttle + OTP attempts gate abuse.

    if (!isSupabaseConfigured()) {
      return json({ ok: false, message: "Service unavailable. Please try again later." }, 503);
    }

    const record = await findActiveOtp(phone);
    if (!record) {
      return json(
        { ok: false, message: "This code has expired. Please request a new one." },
        410,
      );
    }

    if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
      await clearOtps(phone);
      return json(
        { ok: false, message: "Too many incorrect attempts. Please request a new code." },
        429,
      );
    }

    if (!verifyOtpHash(parsed.otp, phone, record.otp_hash)) {
      await incrementAttempts(record.id, record.attempts);
      otpLog.warn("menu_offers_otp_mismatch", {
        phone: maskPhone(phone),
        attempts: record.attempts + 1,
      });
      return json({ ok: false, message: "That code is incorrect. Please try again." }, 401);
    }

    await clearOtps(phone);

    const branchId = await resolveMenuBranchId(
      merchant.merchantId,
      parsed.branchId,
    );

    const saved = await captureSpecialOffersGuest({
      merchantId: merchant.merchantId,
      branchId,
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      phone: parsed.phone,
      email: parsed.email,
      birthdate: parsed.birthdate,
      partySize: parsed.partySize,
      tableNumber: parsed.tableNumber ?? null,
    });
    if (!saved.ok) {
      return json({ ok: false, message: saved.error }, 500);
    }

    otpLog.info("menu_offers_verified", {
      phone: maskPhone(phone),
      merchantId: merchant.merchantId,
      customerId: saved.customerId,
    });

    return json({ ok: true, message: "You're verified — enjoy the menu." }, 200);
  } catch (error) {
    otpLog.error("menu_offers_verify_unhandled", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return json({ ok: false, message: "Something went wrong. Please try again." }, 500);
  }
}
