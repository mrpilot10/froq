import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { isValidPhone } from "@/lib/auth/format";
import { toCanonicalPhone, toSupabaseAuthPhone } from "@/lib/auth/otp/phone";

export interface GuestCustomer {
  id: string;
  publicToken: string;
  phone: string;
  name: string;
  whatsappAvailable: boolean;
  preferred: "sms" | "whatsapp";
}

/** 10-digit Indian mobile → E.164, or null when it isn't usable. */
export function normalizeGuestPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "").slice(-10);
  if (!isValidPhone(digits)) return null;
  const canonical = toCanonicalPhone(digits);
  return canonical ? toSupabaseAuthPhone(canonical) : null;
}

/**
 * Find or create a customers row for this merchant + phone so guest-facing
 * products (queue, reservations) can reuse the existing public_token for
 * WhatsApp URL buttons.
 */
export async function ensureGuestCustomer(input: {
  merchantId: string;
  branchId?: string | null;
  name: string;
  phone: string;
}): Promise<GuestCustomer | null> {
  const phoneE164 = normalizeGuestPhone(input.phone);
  if (!phoneE164) return null;

  const admin = createAdminClient();
  const national = phoneE164.replace(/\D/g, "").slice(-10);
  const variants = [phoneE164, national, `91${national}`, `+91${national}`];
  const givenName = input.name.trim();

  const { data: existing } = await admin
    .from("customers")
    .select(
      "id, name, phone, public_token, whatsapp_available, preferred_notification_channel",
    )
    .eq("merchant_id", input.merchantId)
    .in("phone", variants)
    .limit(1)
    .maybeSingle();

  if (existing?.public_token) {
    // The name given for this visit wins over whatever is on file: a shared or
    // recycled phone number would otherwise greet the guest by someone else's
    // name in every WhatsApp message.
    if (givenName && givenName !== existing.name) {
      await admin.from("customers").update({ name: givenName }).eq("id", existing.id);
    }
    return {
      id: existing.id,
      publicToken: existing.public_token,
      phone: existing.phone,
      name: givenName || existing.name,
      whatsappAvailable: existing.whatsapp_available === true,
      preferred:
        existing.preferred_notification_channel === "whatsapp" ? "whatsapp" : "sms",
    };
  }

  const { data: inserted, error } = await admin
    .from("customers")
    .insert({
      merchant_id: input.merchantId,
      branch_id: input.branchId ?? null,
      name: givenName || "Guest",
      phone: phoneE164,
    })
    .select(
      "id, name, phone, public_token, whatsapp_available, preferred_notification_channel",
    )
    .single();

  if (error || !inserted?.public_token) {
    console.error("ensureGuestCustomer insert failed", error?.message);
    return null;
  }

  // Seed an empty loyalty card so the customer hub stays consistent.
  await admin.from("loyalty_cards").upsert(
    {
      customer_id: inserted.id,
      merchant_id: input.merchantId,
      branch_id: input.branchId ?? null,
      stamps: 0,
      status: "active",
    },
    { onConflict: "customer_id", ignoreDuplicates: true },
  );

  return {
    id: inserted.id,
    publicToken: inserted.public_token,
    phone: inserted.phone,
    name: inserted.name,
    whatsappAvailable: inserted.whatsapp_available === true,
    preferred:
      inserted.preferred_notification_channel === "whatsapp" ? "whatsapp" : "sms",
  };
}
