import "server-only";

import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { otpLog } from "./logger";
import { maskPhone } from "./phone";

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
 * Since APITxT (not Supabase) delivered the code, we authenticate the user by
 * rotating a server-generated password and immediately signing in with it. The
 * password is random and never leaves the server, so it isn't a usable factor.
 *
 * @param phone Canonical digits incl. country code, no '+' (e.g. 919876543210).
 */
export async function establishPhoneSession(phone: string): Promise<EstablishResult> {
  const admin = createAdminClient();
  const password = strongPassword();

  // 1) Resolve (or create) the account for this phone number.
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
      phone,
      password,
      phone_confirm: true, // we already proved ownership via the OTP
    });
    if (error || !data.user) {
      // Likely a race where the user was created between lookup and insert.
      const { data: raced } = await admin.rpc("auth_user_id_by_phone", { p_phone: phone });
      if (raced) {
        await admin.auth.admin.updateUserById(raced as string, { password });
        userId = raced as string;
      } else {
        otpLog.error("session_create_failed", { phone: maskPhone(phone), reason: error?.message });
        return { ok: false, isNewUser: false, error: error?.message ?? "Could not create account." };
      }
    } else {
      userId = data.user.id;
      isNewUser = true;
    }
  }

  // 2) Sign in to set the session cookies on this response.
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ phone, password });
  if (signInError) {
    otpLog.error("session_signin_failed", { phone: maskPhone(phone), reason: signInError.message });
    return { ok: false, isNewUser, userId: userId ?? undefined, error: signInError.message };
  }

  otpLog.info("session_established", { phone: maskPhone(phone), isNewUser });
  return { ok: true, isNewUser, userId: userId ?? undefined };
}
