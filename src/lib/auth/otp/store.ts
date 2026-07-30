import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { OTP_TTL_MS, RATE_WINDOW_MS } from "./config";

const TABLE = "otp_codes";

export interface OtpRecord {
  id: string;
  phone: string;
  otp_hash: string;
  request_id: string | null;
  channel: string;
  attempts: number;
  consumed_at: string | null;
  expires_at: string;
  created_at: string;
}

function storeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Database request failed";
}

/** Number of OTP requests for this phone within the rate-limit window. */
export async function countRecentRequests(phone: string): Promise<number> {
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
    const { count, error } = await admin
      .from(TABLE)
      .select("*", { count: "exact", head: true })
      .eq("phone", phone)
      .gte("created_at", since);
    // Fail closed — treat lookup errors as "at limit" so we never flood SMS/WA.
    if (error) return Number.MAX_SAFE_INTEGER;
    return count ?? 0;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

/**
 * Reserves a send slot so concurrent requests can't both call the provider.
 * Inserts a short-lived claim row; only the earliest claim in the interval wins.
 */
export async function claimOtpSendSlot(
  phone: string,
  minIntervalSeconds: number,
): Promise<{ ok: true } | { ok: false; retryAfter: number; error?: string }> {
  try {
    const admin = createAdminClient();
    const last = await lastRequestAt(phone);
    if (last) {
      const waitMs = minIntervalSeconds * 1000 - (Date.now() - last);
      if (waitMs > 0) {
        return { ok: false, retryAfter: Math.max(1, Math.ceil(waitMs / 1000)) };
      }
    }

    const claimHash = `claim:${crypto.randomUUID()}`;
    const { error: insertError } = await admin.from(TABLE).insert({
      phone,
      otp_hash: claimHash,
      expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    });
    if (insertError) {
      return { ok: false, retryAfter: minIntervalSeconds, error: insertError.message };
    }

    const since = new Date(Date.now() - minIntervalSeconds * 1000).toISOString();
    const { data: rows, error } = await admin
      .from(TABLE)
      .select("otp_hash, created_at")
      .eq("phone", phone)
      .gte("created_at", since)
      .order("created_at", { ascending: true });

    if (error || !rows?.length) {
      await admin.from(TABLE).delete().eq("otp_hash", claimHash);
      return {
        ok: false,
        retryAfter: minIntervalSeconds,
        error: error?.message ?? "Could not reserve OTP slot.",
      };
    }

    if (rows[0].otp_hash !== claimHash) {
      await admin.from(TABLE).delete().eq("otp_hash", claimHash);
      const age = Date.now() - new Date(rows[0].created_at).getTime();
      const retryAfter = Math.max(
        1,
        Math.ceil((minIntervalSeconds * 1000 - age) / 1000),
      );
      return { ok: false, retryAfter };
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, retryAfter: minIntervalSeconds, error: storeError(error) };
  }
}

/** Timestamp (ms) of the most recent OTP request for this phone, or null. */
export async function lastRequestAt(phone: string): Promise<number | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from(TABLE)
      .select("created_at")
      .eq("phone", phone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return data?.created_at ? new Date(data.created_at).getTime() : null;
  } catch {
    return null;
  }
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
  try {
    const admin = createAdminClient();
    await admin.from(TABLE).delete().eq("phone", input.phone).is("consumed_at", null);

    const { error } = await admin.from(TABLE).insert({
      phone: input.phone,
      otp_hash: input.otpHash,
      request_id: input.requestId ?? null,
      expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (error) {
    return { ok: false, error: storeError(error) };
  }
}

/** Attach delivery metadata after WhatsApp/SMS succeeds. */
export async function updateOtpDelivery(
  phone: string,
  input: { requestId?: string; channel?: string },
): Promise<void> {
  try {
    const admin = createAdminClient();
    const patch: Record<string, string> = {};
    if (input.requestId) patch.request_id = input.requestId;
    if (input.channel) patch.channel = input.channel;
    if (Object.keys(patch).length === 0) return;
    await admin
      .from(TABLE)
      .update(patch)
      .eq("phone", phone)
      .is("consumed_at", null)
      .gt("expires_at", new Date().toISOString());
  } catch {
    // Non-critical — OTP is already stored and delivered.
  }
}

/** @deprecated Prefer updateOtpDelivery. */
export async function updateOtpRequestId(phone: string, requestId?: string): Promise<void> {
  await updateOtpDelivery(phone, { requestId });
}

/** Latest active (unconsumed, unexpired) OTP record for the phone. */
export async function findActiveOtp(phone: string): Promise<OtpRecord | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from(TABLE)
      .select("*")
      .eq("phone", phone)
      .is("consumed_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data as OtpRecord) ?? null;
  } catch {
    return null;
  }
}

export async function incrementAttempts(id: string, current: number): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from(TABLE).update({ attempts: current + 1 }).eq("id", id);
  } catch {
    // Best-effort.
  }
}

/** Removes every OTP row for the phone — called after a successful verification. */
export async function clearOtps(phone: string): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from(TABLE).delete().eq("phone", phone);
  } catch {
    // Best-effort.
  }
}

/** Opportunistic cleanup of expired codes so the table stays small. */
export async function purgeExpired(): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from(TABLE).delete().lt("expires_at", new Date().toISOString());
  } catch {
    // Best-effort — don't block OTP send on cleanup failure.
  }
}
