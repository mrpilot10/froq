"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  DashboardChartBucket,
  DashboardDateRange,
  DashboardFilteredStats,
  MerchantCustomer,
  MerchantProfile,
  PendingApproval,
} from "@/lib/merchant/types";
import { slugify, toCustomer, toMerchantProfile, toMerchantRowPatch } from "@/lib/merchant/mappers";
import { parseRedeemCode } from "@/lib/merchant/parse-redeem-code";
import { toCanonicalPhone } from "@/lib/auth/otp/phone";

export interface MerchantStatsData {
  totalCustomers: number;
  activeCards: number;
  stampsToday: number;
  pendingApprovals: number;
  rewardsRedeemed: number;
  avgLifetimeVisits: number;
  weeklyVisits: number[];
}

function buildDashboardStats(
  range: DashboardDateRange,
  statsRow: {
    total_customers?: number | null;
    active_cards?: number | null;
    pending_approvals?: number | null;
    rewards_redeemed?: number | null;
    avg_lifetime_visits?: number | null;
  } | null,
  visits: { created_at: string }[],
  redemptions: { customer_id: string | null; redeemed_at: string }[],
  allTimeRedeemers: { customer_id: string | null }[],
): DashboardFilteredStats {
  const rangeStart = dashboardRangeStart(range);
  const filteredVisits = rangeStart
    ? visits.filter((row) => new Date(row.created_at) >= rangeStart)
    : visits;
  const filteredRedemptions = rangeStart
    ? redemptions.filter((row) => new Date(row.redeemed_at) >= rangeStart)
    : redemptions;
  const chart = chartBucketsForRange(range, filteredVisits);

  const totalCustomers = statsRow?.total_customers ?? 0;
  const allTimeRedeemingCustomers = new Set(
    allTimeRedeemers.map((row) => row.customer_id).filter(Boolean) as string[],
  );
  const conversionRate =
    totalCustomers > 0
      ? Math.round((allTimeRedeemingCustomers.size / totalCustomers) * 100)
      : 0;

  return {
    range,
    rangeLabel: DASHBOARD_RANGE_LABELS[range],
    totalCustomers,
    activeCards: statsRow?.active_cards ?? 0,
    stampsInRange: filteredVisits.length,
    pendingApprovals: statsRow?.pending_approvals ?? 0,
    rewardsInRange: filteredRedemptions.length,
    rewardsRedeemedAllTime: statsRow?.rewards_redeemed ?? 0,
    avgLifetimeVisits: Number(statsRow?.avg_lifetime_visits ?? 0),
    conversionRate,
    chartBuckets: chart.buckets,
    chartTitle: chart.title,
    chartSub: chart.sub,
  };
}

export type MerchantBundle =
  | { status: "unauthenticated" }
  | { status: "error" }
  | { status: "not_registered" }
  | { status: "needs_setup" }
  | {
      status: "ready";
      profile: MerchantProfile;
      stats: MerchantStatsData;
      dashboardStats: DashboardFilteredStats;
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

const DASHBOARD_RANGE_LABELS: Record<DashboardDateRange, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  all: "All time",
};

function dashboardRangeStart(range: DashboardDateRange): Date | null {
  const now = new Date();
  if (range === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (range === "7d") {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (range === "30d") {
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  return null;
}

function chartBucketsForRange(
  range: DashboardDateRange,
  visits: { created_at: string }[],
): { title: string; sub: string; buckets: DashboardChartBucket[] } {
  if (range === "today") {
    const labels = ["12–6a", "6–12p", "12–6p", "6–12a"];
    const values = [0, 0, 0, 0];
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    for (const row of visits) {
      const date = new Date(row.created_at);
      if (date < startOfDay) continue;
      const hour = date.getHours();
      const idx = hour < 6 ? 0 : hour < 12 ? 1 : hour < 18 ? 2 : 3;
      values[idx] += 1;
    }
    return {
      title: "Today's visits",
      sub: "Stamps approved by time of day",
      buckets: labels.map((label, index) => ({ label, value: values[index] })),
    };
  }

  if (range === "7d") {
    const days: { label: string; value: number; start: Date; end: Date }[] = [];
    const now = new Date();
    for (let offset = 6; offset >= 0; offset -= 1) {
      const start = new Date(now);
      start.setDate(start.getDate() - offset);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      days.push({
        label: start.toLocaleDateString("en-US", { weekday: "narrow" }),
        value: 0,
        start,
        end,
      });
    }
    for (const row of visits) {
      const date = new Date(row.created_at);
      for (const day of days) {
        if (date >= day.start && date < day.end) {
          day.value += 1;
          break;
        }
      }
    }
    return {
      title: "Daily visits",
      sub: "Stamps approved per day",
      buckets: days.map(({ label, value }) => ({ label, value })),
    };
  }

  if (range === "30d") {
    const weeks: { label: string; value: number; start: Date; end: Date }[] = [];
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    for (let week = 3; week >= 0; week -= 1) {
      const end = new Date(now);
      end.setDate(end.getDate() - week * 7);
      end.setHours(23, 59, 59, 999);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      weeks.push({
        label: week === 0 ? "Now" : `-${week * 7}d`,
        value: 0,
        start,
        end,
      });
    }
    for (const row of visits) {
      const date = new Date(row.created_at);
      for (const week of weeks) {
        if (date >= week.start && date <= week.end) {
          week.value += 1;
          break;
        }
      }
    }
    return {
      title: "Weekly visits",
      sub: "Stamps approved per week",
      buckets: weeks.map(({ label, value }) => ({ label, value })),
    };
  }

  const months: { label: string; value: number; start: Date; end: Date }[] = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    start.setMonth(start.getMonth() - offset);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    months.push({
      label: start.toLocaleDateString("en-US", { month: "short" }),
      value: 0,
      start,
      end,
    });
  }
  for (const row of visits) {
    const date = new Date(row.created_at);
    for (const month of months) {
      if (date >= month.start && date < month.end) {
        month.value += 1;
        break;
      }
    }
  }
  return {
    title: "Monthly visits",
    sub: "Stamps approved per month",
    buckets: months.map(({ label, value }) => ({ label, value })),
  };
}

export async function getDashboardStats(
  range: DashboardDateRange = "today",
): Promise<DashboardFilteredStats | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: merchantRow } = await supabase
      .from("merchants")
      .select("id")
      .eq("owner_user_id", user.id)
      .maybeSingle();
    if (!merchantRow) return null;

    const merchantId = merchantRow.id;
    const rangeStart = dashboardRangeStart(range);

    let visitsQuery = supabase.from("visits").select("created_at").eq("merchant_id", merchantId);
    let redemptionsQuery = supabase
      .from("redemptions")
      .select("customer_id, redeemed_at")
      .eq("merchant_id", merchantId);

    if (rangeStart) {
      const iso = rangeStart.toISOString();
      visitsQuery = visitsQuery.gte("created_at", iso);
      redemptionsQuery = redemptionsQuery.gte("redeemed_at", iso);
    }

    const [statsRes, visitsRes, redemptionsRes, allRedemptionsRes] = await Promise.all([
      supabase.from("merchant_stats").select("*").eq("merchant_id", merchantId).maybeSingle(),
      visitsQuery,
      redemptionsQuery,
      supabase.from("redemptions").select("customer_id").eq("merchant_id", merchantId),
    ]);

    const statsRow = statsRes.data;
    const visits = visitsRes.data ?? [];
    const redemptions = redemptionsRes.data ?? [];

    return buildDashboardStats(
      range,
      statsRow,
      visits,
      redemptions,
      allRedemptionsRes.data ?? [],
    );
  } catch {
    return null;
  }
}

export async function getMerchantBundle(): Promise<MerchantBundle> {
  try {
    return await loadMerchantBundle();
  } catch {
    // Transient network/query errors must NOT look like a sign-out, otherwise a
    // single failed realtime refresh would bounce the merchant to the login
    // screen. Callers keep the last good state when they receive "error".
    return { status: "error" };
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

  const [statsRes, customersRes, approvalsRes, visitsRes, redemptionsRes] = await Promise.all([
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
    supabase.from("visits").select("created_at").eq("merchant_id", merchantId),
    supabase
      .from("redemptions")
      .select("customer_id, redeemed_at")
      .eq("merchant_id", merchantId),
  ]);

  const statsRow = statsRes.data;
  const visits = visitsRes.data ?? [];
  const redemptions = redemptionsRes.data ?? [];
  const stats: MerchantStatsData = {
    totalCustomers: statsRow?.total_customers ?? 0,
    activeCards: statsRow?.active_cards ?? 0,
    stampsToday: statsRow?.stamps_today ?? 0,
    pendingApprovals: statsRow?.pending_approvals ?? 0,
    rewardsRedeemed: statsRow?.rewards_redeemed ?? 0,
    avgLifetimeVisits: Number(statsRow?.avg_lifetime_visits ?? 0),
    weeklyVisits: weeklyBuckets(visits),
  };
  const dashboardStats = buildDashboardStats(
    "today",
    statsRow,
    visits,
    redemptions,
    redemptions,
  );

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

  return { status: "ready", profile, stats, dashboardStats, customers, approvals };
}

/**
 * Verifies a phone belongs to a Froq merchant (a registered store, or someone
 * mid-onboarding) BEFORE we spend an SMS OTP on it. Customers and unknown
 * numbers are rejected so the merchant login never texts non-merchants.
 */
export async function merchantExistsForPhone(
  phone: string,
): Promise<{ exists: boolean; error?: string }> {
  try {
    const canonical = toCanonicalPhone(phone);
    if (!canonical) return { exists: false, error: "Enter a valid mobile number." };

    const admin = createAdminClient();
    const { data: userId } = await admin.rpc("auth_user_id_by_phone", { p_phone: canonical });
    if (!userId) return { exists: false };

    const { data: merchant } = await admin
      .from("merchants")
      .select("id")
      .eq("owner_user_id", userId)
      .maybeSingle();
    if (merchant) return { exists: true };

    // Paid via checkout but hasn't built their store yet — still a merchant.
    const { data: userRes } = await admin.auth.admin.getUserById(userId as string);
    if (userRes?.user?.app_metadata?.merchant_onboarding === true) return { exists: true };

    return { exists: false };
  } catch {
    // On lookup failure, don't hard-block login — let the OTP flow proceed.
    return { exists: true };
  }
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
  rewardImageDataUrl?: string;
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
        reward_image_url: input.rewardImageDataUrl ?? null,
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

    const parsed = parseRedeemCode(rawCode);
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

export async function deleteMerchantAccount(): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated." };

    const { data: merchant } = await supabase
      .from("merchants")
      .select("id")
      .eq("owner_user_id", user.id)
      .maybeSingle();
    if (!merchant) return { ok: false, error: "Merchant account not found." };

    const { error: pushError } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("merchant_id", merchant.id);
    if (pushError) return { ok: false, error: pushError.message };

    const { error } = await supabase.from("merchants").delete().eq("id", merchant.id);
    if (error) return { ok: false, error: error.message };

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not delete your account.",
    };
  }
}
