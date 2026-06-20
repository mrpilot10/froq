import "server-only";

import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { otpLog } from "./logger";
import { maskPhone, toSupabaseAuthPhone } from "./phone";

interface EstablishResult {
  ok: boolean;
  isNewUser: boolean;
  userId?: string;
  error?: string;
}

function strongPassword(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Completes login after the OTP has been verified:
 *  1. finds the auth user for this phone, creating one if it doesn't exist;
 *  2. mints a Supabase session (sets the auth cookies on the response).
 *
 * @param phone Canonical digits incl. country code, no '+' (e.g. 919876543210).
 */
export async function establishPhoneSession(phone: string): Promise<EstablishResult> {
  const admin = createAdminClient();
  const password = strongPassword();
  const authPhone = toSupabaseAuthPhone(phone);

  const { data: existingId, error: lookupError } = await admin.rpc("auth_user_id_by_phone", {
    p_phone: phone,
  });
  if (lookupError) {
    otpLog.error("session_lookup_failed", { phone: maskPhone(phone), reason: lookupError.message });
    return { ok: false, isNewUser: false, error: lookupError.message };
  }

  let userId = existingId as string | null;
  let isNewUser = false;

  if (userId) {
    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) {
      otpLog.error("session_update_failed", { phone: maskPhone(phone), reason: error.message });
      return { ok: false, isNewUser: false, error: error.message };
    }
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      phone: authPhone,
      password,
      phone_confirm: true,
    });
    if (error || !data.user) {
      const { data: raced } = await admin.rpc("auth_user_id_by_phone", { p_phone: phone });
      if (raced) {
        userId = raced as string;
        const { error: updateError } = await admin.auth.admin.updateUserById(userId, { password });
        if (updateError) {
          otpLog.error("session_update_failed", { phone: maskPhone(phone), reason: updateError.message });
          return { ok: false, isNewUser: false, error: updateError.message };
        }
      } else {
        otpLog.error("session_create_failed", { phone: maskPhone(phone), reason: error?.message });
        return { ok: false, isNewUser: false, error: error?.message ?? "Could not create account." };
      }
    } else {
      userId = data.user.id;
      isNewUser = true;
    }
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    phone: authPhone,
    password,
  });
  if (signInError) {
    otpLog.error("session_signin_failed", { phone: maskPhone(phone), reason: signInError.message });
    return { ok: false, isNewUser, userId: userId ?? undefined, error: signInError.message };
  }

  otpLog.info("session_established", { phone: maskPhone(phone), isNewUser });
  return { ok: true, isNewUser, userId: userId ?? undefined };
}
