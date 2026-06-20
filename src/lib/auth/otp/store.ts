import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { OTP_TTL_MS, RATE_WINDOW_MS } from "./config";

const TABLE = "otp_codes";

export interface OtpRecord {
  id: string;
  phone: string;
  otp_hash: string;
  request_id: string | null;
  attempts: number;
  consumed_at: string | null;
  expires_at: string;
  created_at: string;
}

/** Number of OTP requests for this phone within the rate-limit window. */
export async function countRecentRequests(phone: string): Promise<number> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const { count } = await admin
    .from(TABLE)
    .select("*", { count: "exact", head: true })
    .eq("phone", phone)
    .gte("created_at", since);
  return count ?? 0;
}

/** Timestamp (ms) of the most recent OTP request for this phone, or null. */
export async function lastRequestAt(phone: string): Promise<number | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from(TABLE)
    .select("created_at")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.created_at ? new Date(data.created_at).getTime() : null;
}

/**
 * Stores a freshly generated OTP hash. Any prior unconsumed codes for the phone
 * are removed first so only the latest code is ever valid.
 */
export async function persistOtp(input: {
  phone: string;
  otpHash: string;
  requestId?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  await admin.from(TABLE).delete().eq("phone", input.phone).is("consumed_at", null);

  const { error } = await admin.from(TABLE).insert({
    phone: input.phone,
    otp_hash: input.otpHash,
    request_id: input.requestId ?? null,
    expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Latest active (unconsumed, unexpired) OTP record for the phone. */
export async function findActiveOtp(phone: string): Promise<OtpRecord | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from(TABLE)
    .select("*")
    .eq("phone", phone)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as OtpRecord) ?? null;
}

export async function incrementAttempts(id: string, current: number): Promise<void> {
  const admin = createAdminClient();
  await admin.from(TABLE).update({ attempts: current + 1 }).eq("id", id);
}

/** Removes every OTP row for the phone — called after a successful verification. */
export async function clearOtps(phone: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from(TABLE).delete().eq("phone", phone);
}

/** Opportunistic cleanup of expired codes so the table stays small. */
export async function purgeExpired(): Promise<void> {
  const admin = createAdminClient();
  await admin.from(TABLE).delete().lt("expires_at", new Date().toISOString());
}
