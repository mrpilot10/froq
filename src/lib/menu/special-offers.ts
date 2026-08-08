import "server-only";

import { z } from "zod";
import { OTP_LENGTH } from "@/lib/auth/otp/config";
import { ensureGuestCustomer } from "@/lib/merchant/guest-customer";
import { createAdminClient } from "@/lib/supabase/admin";

export const SPECIAL_OFFERS_OTP_LIMIT = { limit: 6, windowMs: 60_000 } as const;
export const SPECIAL_OFFERS_VERIFY_LIMIT = { limit: 12, windowMs: 60_000 } as const;

export const specialOffersFormSchema = z.object({
  slug: z.string().min(1).max(80),
  branchId: z.string().uuid().nullish(),
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  phone: z.string().min(8).max(20),
  email: z.string().trim().email().max(120),
  birthdate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date of birth."),
  partySize: z.coerce.number().int().min(1).max(20),
  tableNumber: z.coerce.number().int().min(1).max(999).nullish(),
  captchaToken: z.string().nullish(),
});

export const specialOffersVerifySchema = specialOffersFormSchema.extend({
  otp: z.string().regex(new RegExp(`^\\d{${OTP_LENGTH}}$`)),
});

export type SpecialOffersForm = z.infer<typeof specialOffersFormSchema>;

export async function resolveMerchantForMenuSlug(slug: string): Promise<{
  merchantId: string;
  businessName: string;
} | null> {
  const admin = createAdminClient();
  const { data: merchant } = await admin
    .from("merchants")
    .select("id, business_name")
    .eq("slug", slug)
    .maybeSingle();
  if (!merchant?.id) return null;
  return {
    merchantId: merchant.id,
    businessName: merchant.business_name ?? "Restaurant",
  };
}

/** Confirm branch belongs to the merchant (or return null). */
export async function resolveMenuBranchId(
  merchantId: string,
  branchId: string | null | undefined,
): Promise<string | null> {
  if (!branchId) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("branches")
    .select("id")
    .eq("id", branchId)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  return data?.id ?? null;
}

/** Persist guest + optional dining cover after OTP succeeds. */
export async function captureSpecialOffersGuest(input: {
  merchantId: string;
  branchId: string | null;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  birthdate: string;
  partySize: number;
  tableNumber?: number | null;
}): Promise<{ ok: true; customerId: string } | { ok: false; error: string }> {
  const name = `${input.firstName} ${input.lastName}`.trim();
  const customer = await ensureGuestCustomer({
    merchantId: input.merchantId,
    branchId: input.branchId,
    name,
    phone: input.phone,
    email: input.email,
    birthdate: input.birthdate,
  });
  if (!customer) {
    return { ok: false, error: "Could not save your details. Please try again." };
  }

  // Dining sessions require a branch — fall back to the merchant's first branch
  // so verified guest sign-ins still land in Menu → Customers.
  let branchId = input.branchId;
  if (!branchId) {
    const admin = createAdminClient();
    const { data: branch } = await admin
      .from("branches")
      .select("id")
      .eq("merchant_id", input.merchantId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    branchId = branch?.id ?? null;
  }

  if (branchId) {
    const admin = createAdminClient();
    await admin.from("menu_dining_sessions").insert({
      merchant_id: input.merchantId,
      branch_id: branchId,
      customer_id: customer.id,
      guest_name: name,
      guest_phone: customer.phone,
      party_size: input.partySize,
      table_number: input.tableNumber ?? null,
      status: "open",
      notes: "special_offers_capture",
    });
  }

  return { ok: true, customerId: customer.id };
}
