"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MerchantCustomer, MerchantProfile, PendingApproval } from "@/lib/merchant/types";
import { slugify, toCustomer, toMerchantProfile, toMerchantRowPatch } from "@/lib/merchant/mappers";

export interface MerchantStatsData {
  totalCustomers: number;
  activeCards: number;
  stampsToday: number;
  pendingApprovals: number;
  rewardsRedeemed: number;
  avgLifetimeVisits: number;
  weeklyVisits: number[];
}

export type MerchantBundle =
  | { status: "unauthenticated" }
  | { status: "not_registered" }
  | { status: "needs_setup" }
  | {
      status: "ready";
      profile: MerchantProfile;
      stats: MerchantStatsData;
      customers: MerchantCustomer[];
      approvals: PendingApproval[];
    };

function hasMerchantOnboarding(user: { app_metadata?: Record<string, unknown> }) {
  return user.app_metadata?.merchant_onboarding === true;
}

// Visits over the trailing 7 days bucketed Mon..Sun for the dashboard chart.
function weeklyBuckets(rows: { created_at: string }[]): number[] {
  const buckets = [0, 0, 0, 0, 0, 0, 0];
  const cutoff = Date.now() - 7 * 86_400_000;
  for (const row of rows) {
    const date = new Date(row.created_at);
    if (date.getTime() < cutoff) continue;
    const jsDay = date.getDay(); // 0 Sun .. 6 Sat
    const monIndex = (jsDay + 6) % 7; // 0 Mon .. 6 Sun
    buckets[monIndex] += 1;
  }
  return buckets;
}

export async function getMerchantBundle(): Promise<MerchantBundle> {
  try {
    return await loadMerchantBundle();
  } catch {
    // Network / config errors fall back to the login screen rather than crashing.
    return { status: "unauthenticated" };
  }
}

async function loadMerchantBundle(): Promise<MerchantBundle> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthenticated" };

  const { data: merchantRow } = await supabase
    .from("merchants")
    .select("*")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (!merchantRow) {
    return hasMerchantOnboarding(user) ? { status: "needs_setup" } : { status: "not_registered" };
  }

  const merchantId = merchantRow.id;
  const profile = toMerchantProfile(merchantRow);

  const [statsRes, customersRes, approvalsRes, visitsRes] = await Promise.all([
    supabase.from("merchant_stats").select("*").eq("merchant_id", merchantId).maybeSingle(),
    supabase
      .from("customer_overview")
      .select("*")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false }),
    supabase
      .from("approvals")
      .select("id, customer_id, stamps_before, requested_at")
      .eq("merchant_id", merchantId)
      .eq("status", "pending")
      .order("requested_at", { ascending: true }),
    supabase
      .from("visits")
      .select("created_at")
      .eq("merchant_id", merchantId)
      .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString()),
  ]);

  const statsRow = statsRes.data;
  const stats: MerchantStatsData = {
    totalCustomers: statsRow?.total_customers ?? 0,
    activeCards: statsRow?.active_cards ?? 0,
    stampsToday: statsRow?.stamps_today ?? 0,
    pendingApprovals: statsRow?.pending_approvals ?? 0,
    rewardsRedeemed: statsRow?.rewards_redeemed ?? 0,
    avgLifetimeVisits: Number(statsRow?.avg_lifetime_visits ?? 0),
    weeklyVisits: weeklyBuckets(visitsRes.data ?? []),
  };

  const customers = (customersRes.data ?? []).map(toCustomer);
  const customerById = new Map(customers.map((c) => [c.id, c]));

  const approvals: PendingApproval[] = (approvalsRes.data ?? []).map((row) => {
    const customer = customerById.get(row.customer_id);
    return {
      id: row.id,
      customerId: row.customer_id,
      customerName: customer?.name ?? "Customer",
      phone: customer?.phone ?? "",
      requestedAt: new Date(row.requested_at).toLocaleString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      }),
      stampsBefore: row.stamps_before,
      totalStamps: profile.totalStamps,
    };
  });

  return { status: "ready", profile, stats, customers, approvals };
}

/** Called after checkout payment — allows this user to access the store setup wizard. */
export async function markMerchantOnboarding(): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated" };

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: { ...user.app_metadata, merchant_onboarding: true },
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not complete checkout.",
    };
  }
}

export async function savePushSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated" };

    const { data: merchant } = await supabase
      .from("merchants")
      .select("id")
      .eq("owner_user_id", user.id)
      .maybeSingle();
    if (!merchant) return { ok: false, error: "Merchant not found" };

    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        merchant_id: merchant.id,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
      },
      { onConflict: "endpoint" },
    );
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not save subscription.",
    };
  }
}

export async function removePushSubscription(
  endpoint: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function createMerchant(input: {
  businessName: string;
  brandColor: string;
  logoDataUrl?: string;
  rewardTitle?: string;
  rewardName: string;
  avgOrderValue?: number;
  address?: string;
  // Optional override; a sensible default is derived when omitted.
  totalStamps?: number;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated. Please log in again." };

    const businessName = input.businessName.trim();
    if (!businessName) return { ok: false, error: "Business name is required." };

    const base = slugify(businessName) || "shop";

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const slug = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
      const { error } = await supabase.from("merchants").insert({
        owner_user_id: user.id,
        business_name: businessName,
        short_name: businessName,
        slug,
        brand_color: input.brandColor,
        logo_url: input.logoDataUrl ?? null,
        address: input.address?.trim() || null,
        reward_title: input.rewardTitle?.trim() || "Free reward",
        reward_name: input.rewardName.trim() || "Free reward",
        total_stamps: input.totalStamps ?? 5,
        avg_order_value: input.avgOrderValue ?? 0,
        email: user.email ?? null,
        phone: user.phone ?? null,
      });
      if (!error) return { ok: true };
      // 23505 = unique violation on slug; retry with a suffix.
      if (error.code !== "23505") return { ok: false, error: error.message };
    }
    return { ok: false, error: "Could not generate a unique store link. Please try again." };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not create your store. Please try again.",
    };
  }
}

export async function updateMerchantProfile(
  patch: Partial<MerchantProfile>,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { error } = await supabase
    .from("merchants")
    .update(toMerchantRowPatch(patch))
    .eq("owner_user_id", user.id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function approveStamp(approvalId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_stamp", { p_approval_id: approvalId });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function rejectStamp(approvalId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_stamp", { p_approval_id: approvalId });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function redeemReward(customerId: string, code: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("redeem_reward", {
    p_customer_id: customerId,
    p_code: code,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Resolves a customer-presented reward code (the `FROQ-XXXXX` shown on the
 * customer's card, optionally wrapped in a `?code=` URL) to a real reward-ready
 * card in the current merchant's shop, then persists the redemption.
 */
export async function redeemRewardByCode(
  rawCode: string,
): Promise<{ ok: boolean; error?: string; customerName?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated. Please log in again." };

    const { data: merchant } = await supabase
      .from("merchants")
      .select("id")
      .eq("owner_user_id", user.id)
      .maybeSingle();
    if (!merchant) return { ok: false, error: "Merchant account not found." };

    const urlMatch = rawCode.match(/code=([A-Za-z0-9-]+)/i);
    const parsed = (urlMatch ? urlMatch[1] : rawCode).trim().toUpperCase();
    if (!parsed) return { ok: false, error: "Enter a reward code." };

    // Match against reward-ready cards in this shop. The customer's displayed
    // code is FROQ-{first 5 of customer id}; we also accept the full id.
    const { data: cards } = await supabase
      .from("loyalty_cards")
      .select("customer_id")
      .eq("merchant_id", merchant.id)
      .eq("status", "reward_ready");

    const target = (cards ?? []).find(
      (card) =>
        `FROQ-${card.customer_id.slice(0, 5).toUpperCase()}` === parsed ||
        card.customer_id.toUpperCase() === parsed,
    );
    if (!target) {
      return { ok: false, error: "No reward-ready card matches that code." };
    }

    const { data: customer } = await supabase
      .from("customers")
      .select("name")
      .eq("id", target.customer_id)
      .maybeSingle();

    // Unique per-merchant redemption code (allows the same customer to redeem
    // again on a future card without colliding on redemptions.code).
    const redemptionCode = `${parsed}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const { error } = await supabase.rpc("redeem_reward", {
      p_customer_id: target.customer_id,
      p_code: redemptionCode,
    });
    if (error) return { ok: false, error: error.message };

    return { ok: true, customerName: customer?.name ?? "Customer" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not redeem the reward.",
    };
  }
}

export async function setCustomerBanned(customerId: string, banned: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("customers").update({ banned }).eq("id", customerId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteCustomer(customerId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("customers").delete().eq("id", customerId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
