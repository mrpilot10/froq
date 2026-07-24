"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  Branch,
  DashboardChartBucket,
  DashboardDateRange,
  DashboardFilteredStats,
  MemberRole,
  MerchantCustomer,
  MerchantMember,
  MerchantProfile,
  PendingApproval,
} from "@/lib/merchant/types";
import {
  slugify,
  toBranch,
  toCustomer,
  toMember,
  toMerchantProfile,
  toMerchantRowPatch,
} from "@/lib/merchant/mappers";
import {
  EMPTY_ENTITLEMENTS,
  entitlementsFromRows,
  type Entitlements,
} from "@/lib/merchant/entitlements";
import type { MerchantProduct } from "@/lib/merchant/types";
import { parseRedeemCode } from "@/lib/merchant/parse-redeem-code";
import { toCanonicalPhone } from "@/lib/auth/otp/phone";
import {
  isValidEmail,
  isValidPassword,
  isValidPhone,
  normalizeEmail,
} from "@/lib/auth/format";
import { sendPasswordResetEmail, sendTeamInviteEmail } from "@/lib/email/resend";
import { getAppOrigin } from "@/lib/app-url";

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
  | { status: "needs_setup"; product: MerchantProduct }
  | {
      status: "ready";
      profile: MerchantProfile;
      stats: MerchantStatsData;
      dashboardStats: DashboardFilteredStats;
      customers: MerchantCustomer[];
      approvals: PendingApproval[];
      entitlements: Entitlements;
      branches: Branch[];
      members: MerchantMember[];
      role: MemberRole;
      activeBranchId: string | null;
      /** false for staff scoped to specific branches (no combined view). */
      canViewAllBranches: boolean;
      justJoined: boolean;
    };

function hasMerchantOnboarding(user: { app_metadata?: Record<string, unknown> }) {
  return user.app_metadata?.merchant_onboarding === true;
}

function onboardingProduct(user: { app_metadata?: Record<string, unknown> }): MerchantProduct {
  return user.app_metadata?.onboarding_product === "queue" ? "queue" : "loyalty";
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
  branchId?: string | null,
): Promise<DashboardFilteredStats | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const merchantId = await resolveMerchantId(supabase, user.id);
    if (!merchantId) return null;

    const { data: merchantRow } = await supabase
      .from("merchants")
      .select("owner_user_id")
      .eq("id", merchantId)
      .maybeSingle();
    if (!merchantRow) return null;

    // Staff with assigned branches cannot query other branches (or all-branches).
    let allowedBranchIds: Set<string> | null = null;
    if (merchantRow.owner_user_id !== user.id) {
      const { data: membership } = await supabase
        .from("merchant_members")
        .select("branch_ids, branch_id")
        .eq("merchant_id", merchantId)
        .eq("user_id", user.id)
        .maybeSingle();
      const ids =
        membership?.branch_ids && membership.branch_ids.length > 0
          ? membership.branch_ids
          : membership?.branch_id
            ? [membership.branch_id]
            : [];
      if (ids.length > 0) allowedBranchIds = new Set(ids);
    }

    let branchFilter: string | null = null;
    if (allowedBranchIds) {
      if (branchId && allowedBranchIds.has(branchId)) {
        branchFilter = branchId;
      } else {
        branchFilter = [...allowedBranchIds][0] ?? null;
      }
    } else if (branchId) {
      const { data: branch } = await supabase
        .from("branches")
        .select("id")
        .eq("id", branchId)
        .eq("merchant_id", merchantId)
        .maybeSingle();
      branchFilter = branch?.id ?? null;
    }

    const rangeStart = dashboardRangeStart(range);

    let customersQuery = supabase
      .from("customer_overview")
      .select("banned, status")
      .eq("merchant_id", merchantId);
    let approvalsQuery = supabase
      .from("approvals")
      .select("id")
      .eq("merchant_id", merchantId)
      .eq("status", "pending");
    let visitsQuery = supabase.from("visits").select("created_at").eq("merchant_id", merchantId);
    let redemptionsQuery = supabase
      .from("redemptions")
      .select("customer_id, redeemed_at")
      .eq("merchant_id", merchantId);
    let allRedemptionsQuery = supabase
      .from("redemptions")
      .select("customer_id")
      .eq("merchant_id", merchantId);

    if (branchFilter) {
      customersQuery = customersQuery.eq("branch_id", branchFilter);
      approvalsQuery = approvalsQuery.eq("branch_id", branchFilter);
      visitsQuery = visitsQuery.eq("branch_id", branchFilter);
      redemptionsQuery = redemptionsQuery.eq("branch_id", branchFilter);
      allRedemptionsQuery = allRedemptionsQuery.eq("branch_id", branchFilter);
    }

    if (rangeStart) {
      const iso = rangeStart.toISOString();
      visitsQuery = visitsQuery.gte("created_at", iso);
      redemptionsQuery = redemptionsQuery.gte("redeemed_at", iso);
    }

    const [customersRes, approvalsRes, visitsRes, redemptionsRes, allRedemptionsRes] =
      await Promise.all([
        customersQuery,
        approvalsQuery,
        visitsQuery,
        redemptionsQuery,
        allRedemptionsQuery,
      ]);

    const customers = customersRes.data ?? [];
    const visits = visitsRes.data ?? [];
    const redemptions = redemptionsRes.data ?? [];
    const statsRow = {
      total_customers: customers.filter((c) => !c.banned).length,
      active_cards: customers.filter((c) => c.status === "active").length,
      pending_approvals: (approvalsRes.data ?? []).length,
      rewards_redeemed: (allRedemptionsRes.data ?? []).length,
      avg_lifetime_visits: 0,
    };

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

export async function getMerchantBundle(activeBranchId?: string | null): Promise<MerchantBundle> {
  try {
    return await loadMerchantBundle(activeBranchId ?? null);
  } catch {
    // Transient network/query errors must NOT look like a sign-out, otherwise a
    // single failed realtime refresh would bounce the merchant to the login
    // screen. Callers keep the last good state when they receive "error".
    return { status: "error" };
  }
}

/** Resolve the merchant this user can access — as owner or as a team member. */
async function resolveMerchantId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data: owned } = await supabase
    .from("merchants")
    .select("id")
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (owned) return owned.id;

  const { data: membership } = await supabase
    .from("merchant_members")
    .select("merchant_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return membership?.merchant_id ?? null;
}

async function loadMerchantBundle(activeBranchId: string | null): Promise<MerchantBundle> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthenticated" };

  const merchantId = await resolveMerchantId(supabase, user.id);
  if (!merchantId) {
    return hasMerchantOnboarding(user)
      ? { status: "needs_setup", product: onboardingProduct(user) }
      : { status: "not_registered" };
  }

  const { data: merchantRow } = await supabase
    .from("merchants")
    .select("*")
    .eq("id", merchantId)
    .maybeSingle();
  if (!merchantRow) return { status: "not_registered" };

  const profile = toMerchantProfile(merchantRow);

  const [branchesRes, membersRes, productsRes] = await Promise.all([
    supabase
      .from("branches")
      .select("*")
      .eq("merchant_id", merchantId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("merchant_members")
      .select("*")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: true }),
    supabase
      .from("merchant_products")
      .select("product, plan_id, status, onboarded_at")
      .eq("merchant_id", merchantId),
  ]);

  const allBranches = (branchesRes.data ?? []).map(toBranch);
  const members = (membersRes.data ?? []).map(toMember);
  const isOwner = merchantRow.owner_user_id === user.id;
  const me = members.find((m) => m.userId === user.id);
  const role: MemberRole = isOwner ? "owner" : me?.role ?? "staff";

  // Staff with explicit branch_ids may only see those branches. Empty array =
  // all-branch access (owners, or staff granted full access).
  const allowedBranchIds =
    !isOwner && me && me.branchIds.length > 0 ? new Set(me.branchIds) : null;
  const branches = allowedBranchIds
    ? allBranches.filter((b) => allowedBranchIds.has(b.id))
    : allBranches;

  // First time an invited teammate loads the dashboard → mark them as joined.
  let justJoined = false;
  if (!isOwner && me && !me.joined) {
    justJoined = true;
    me.joined = true;
    try {
      const admin = createAdminClient();
      await admin
        .from("merchant_members")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", me.id);
    } catch {
      /* non-fatal: they still get access */
    }
  }

  // Resolve the active branch. Restricted staff can never use the combined
  // "all branches" view — force them onto one of their allowed branches.
  let branchFilter: string | null = null;
  if (allowedBranchIds) {
    if (activeBranchId && allowedBranchIds.has(activeBranchId)) {
      branchFilter = activeBranchId;
    } else {
      branchFilter = branches[0]?.id ?? null;
    }
  } else if (activeBranchId && allBranches.some((b) => b.id === activeBranchId)) {
    branchFilter = activeBranchId;
  }

  let customersQuery = supabase
    .from("customer_overview")
    .select("*")
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false });
  let approvalsQuery = supabase
    .from("approvals")
    .select("id, customer_id, stamps_before, requested_at")
    .eq("merchant_id", merchantId)
    .eq("status", "pending")
    .order("requested_at", { ascending: true });
  let visitsQuery = supabase
    .from("visits")
    .select("created_at, customer_id")
    .eq("merchant_id", merchantId);
  let redemptionsQuery = supabase
    .from("redemptions")
    .select("customer_id, redeemed_at")
    .eq("merchant_id", merchantId);

  if (branchFilter) {
    customersQuery = customersQuery.eq("branch_id", branchFilter);
    approvalsQuery = approvalsQuery.eq("branch_id", branchFilter);
    visitsQuery = visitsQuery.eq("branch_id", branchFilter);
    redemptionsQuery = redemptionsQuery.eq("branch_id", branchFilter);
  }

  const [customersRes, approvalsRes, visitsRes, redemptionsRes] = await Promise.all([
    customersQuery,
    approvalsQuery,
    visitsQuery,
    redemptionsQuery,
  ]);

  const visits = visitsRes.data ?? [];
  const redemptions = redemptionsRes.data ?? [];
  const customers = (customersRes.data ?? []).map(toCustomer);
  const customerById = new Map(customers.map((c) => [c.id, c]));

  // Branch-scoped counts computed from the filtered rows (the merchant_stats
  // view is not branch aware).
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const stampsToday = visits.filter((v) => new Date(v.created_at) >= todayStart).length;
  const visitsByCustomer = new Map<string, number>();
  for (const v of visits) {
    if (!v.customer_id) continue;
    visitsByCustomer.set(v.customer_id, (visitsByCustomer.get(v.customer_id) ?? 0) + 1);
  }
  const avgLifetimeVisits =
    visitsByCustomer.size > 0
      ? [...visitsByCustomer.values()].reduce((a, b) => a + b, 0) / visitsByCustomer.size
      : 0;

  const computedStatsRow = {
    total_customers: customers.filter((c) => !c.banned).length,
    active_cards: customers.filter((c) => c.status === "active").length,
    pending_approvals: (approvalsRes.data ?? []).length,
    rewards_redeemed: redemptions.length,
    avg_lifetime_visits: avgLifetimeVisits,
  };

  const stats: MerchantStatsData = {
    totalCustomers: computedStatsRow.total_customers,
    activeCards: computedStatsRow.active_cards,
    stampsToday,
    pendingApprovals: computedStatsRow.pending_approvals,
    rewardsRedeemed: computedStatsRow.rewards_redeemed,
    avgLifetimeVisits,
    weeklyVisits: weeklyBuckets(visits),
  };
  const dashboardStats = buildDashboardStats(
    "today",
    computedStatsRow,
    visits,
    redemptions,
    redemptions,
  );

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

  const entitlements = productsRes.data
    ? entitlementsFromRows(productsRes.data)
    : EMPTY_ENTITLEMENTS;

  return {
    status: "ready",
    profile,
    stats,
    dashboardStats,
    customers,
    approvals,
    entitlements,
    branches,
    members,
    role,
    activeBranchId: branchFilter,
    canViewAllBranches: allowedBranchIds === null,
    justJoined,
  };
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

async function userIsMerchantAccount(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: merchant } = await admin
    .from("merchants")
    .select("id")
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (merchant) return true;

  const { data: userRes } = await admin.auth.admin.getUserById(userId);
  return userRes?.user?.app_metadata?.merchant_onboarding === true;
}

/**
 * Merchant dashboard login — email + password only.
 * Rejects sessions that aren't tied to a merchant store / onboarding flag so a
 * loyalty customer can't enter the merchant area with the same auth pool.
 */
export async function signInMerchantWithPassword(
  email: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const normalized = normalizeEmail(email);
    if (!isValidEmail(normalized)) {
      return { ok: false, error: "Enter a valid email address." };
    }
    if (!password) {
      return { ok: false, error: "Enter your password." };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalized,
      password,
    });
    if (error || !data.user) {
      return { ok: false, error: "Invalid email or password." };
    }

    const allowed = await userIsMerchantAccount(data.user.id);
    if (!allowed) {
      await supabase.auth.signOut();
      return {
        ok: false,
        error:
          "This email isn’t registered as a Froq merchant. Create an account from pricing, or contact support.",
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not sign in.",
    };
  }
}

/**
 * Creates (or signs into) a merchant email/password account during checkout.
 * Phone stays as contact metadata — customers keep SMS OTP separately.
 */
export async function signUpMerchantWithPassword(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  city: string;
  state: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const email = normalizeEmail(input.email);
    const password = input.password;
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    const city = input.city.trim();
    const state = input.state.trim();
    const ownerName = [firstName, lastName].filter(Boolean).join(" ");
    const phoneDigits = input.phone.replace(/\D/g, "");

    if (!firstName) return { ok: false, error: "Enter your first name." };
    if (!lastName) return { ok: false, error: "Enter your last name." };
    if (!isValidEmail(email)) return { ok: false, error: "Enter a valid email address." };
    if (!isValidPassword(password)) {
      return { ok: false, error: "Password must be at least 8 characters." };
    }
    if (!isValidPhone(phoneDigits)) {
      return { ok: false, error: "Enter a valid 10-digit mobile number." };
    }
    if (!city || !state) return { ok: false, error: "Select your city." };

    const supabase = await createClient();
    const admin = createAdminClient();
    const phoneE164 = `+91${phoneDigits}`;
    const metadata = {
      full_name: ownerName,
      first_name: firstName,
      last_name: lastName,
      phone: phoneE164,
      city,
      state,
    };

    // Prefer creating a confirmed email user so checkout isn't blocked on inbox
    // verification. If the email already exists, fall through to password sign-in.
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    });

    if (createError) {
      const alreadyExists =
        /already|registered|exists/i.test(createError.message) ||
        createError.message.toLowerCase().includes("email");

      if (!alreadyExists) {
        return { ok: false, error: createError.message };
      }

      const { data: signedIn, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError || !signedIn.user) {
        return {
          ok: false,
          error: "An account with this email already exists. Sign in with the correct password.",
        };
      }

      // Keep contact metadata fresh for returning checkout attempts.
      await admin.auth.admin.updateUserById(signedIn.user.id, {
        user_metadata: {
          ...signedIn.user.user_metadata,
          ...metadata,
        },
      });

      return { ok: true };
    }

    if (!created.user) {
      return { ok: false, error: "Could not create your account." };
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      return { ok: false, error: signInError.message };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not create your account.",
    };
  }
}

function emailOtpKey(email: string) {
  return `email:${normalizeEmail(email)}`;
}

function merchantContactPhone(user: {
  phone?: string | null;
  user_metadata?: Record<string, unknown>;
}): string | null {
  const meta =
    typeof user.user_metadata?.phone === "string" ? user.user_metadata.phone : "";
  return toCanonicalPhone(meta || user.phone || "");
}

/**
 * Sends a verification code for the signed-in merchant's phone (WhatsApp → SMS).
 * Does not create/switch an auth session — confirm-only for onboarding.
 */
export async function sendMerchantPhoneVerification(): Promise<{
  ok: boolean;
  message: string;
  channel?: "whatsapp" | "sms";
  retryAfter?: number;
}> {
  try {
    const { generateOtp, hashOtp } = await import("@/lib/auth/otp/hash");
    const { deliverOtp } = await import("@/lib/auth/otp/deliver");
    const {
      countRecentRequests,
      lastRequestAt,
      persistOtp,
      purgeExpired,
      clearOtps,
      updateOtpDelivery,
    } = await import("@/lib/auth/otp/store");
    const { RESEND_SECONDS, MAX_REQUESTS_PER_MINUTE } = await import("@/lib/auth/otp/config");

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: "Not authenticated." };

    const phone = merchantContactPhone(user);
    if (!phone) return { ok: false, message: "No mobile number on your account." };

    await purgeExpired();

    const last = await lastRequestAt(phone);
    if (last) {
      const waitMs = RESEND_SECONDS * 1000 - (Date.now() - last);
      if (waitMs > 0) {
        return {
          ok: false,
          message: `Please wait ${Math.ceil(waitMs / 1000)}s before requesting another code.`,
          retryAfter: Math.ceil(waitMs / 1000),
        };
      }
    }

    const recent = await countRecentRequests(phone);
    if (recent >= MAX_REQUESTS_PER_MINUTE) {
      return { ok: false, message: "Too many attempts. Please try again in a minute.", retryAfter: 60 };
    }

    const otp = generateOtp();
    const stored = await persistOtp({ phone, otpHash: hashOtp(otp, phone) });
    if (!stored.ok) return { ok: false, message: "Could not start verification." };

    const delivery = await deliverOtp(phone, otp);
    if (!delivery.ok) {
      await clearOtps(phone);
      return { ok: false, message: delivery.message };
    }

    await updateOtpDelivery(phone, {
      requestId: delivery.requestId,
      channel: delivery.channel,
    });

    return {
      ok: true,
      message: delivery.message,
      channel: delivery.channel,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not send verification code.",
    };
  }
}

/** Confirms the merchant phone OTP without changing the auth session. */
export async function verifyMerchantPhoneVerification(
  code: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const { verifyOtpHash } = await import("@/lib/auth/otp/hash");
    const { MAX_VERIFY_ATTEMPTS, OTP_LENGTH } = await import("@/lib/auth/otp/config");
    const { clearOtps, findActiveOtp, incrementAttempts } = await import("@/lib/auth/otp/store");

    const digits = code.replace(/\D/g, "");
    if (digits.length !== OTP_LENGTH) {
      return { ok: false, message: `Enter the ${OTP_LENGTH}-digit code we sent you.` };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: "Not authenticated." };

    const phone = merchantContactPhone(user);
    if (!phone) return { ok: false, message: "No mobile number on your account." };

    const record = await findActiveOtp(phone);
    if (!record) {
      return { ok: false, message: "This code has expired. Please request a new one." };
    }
    if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
      await clearOtps(phone);
      return { ok: false, message: "Too many incorrect attempts. Please request a new code." };
    }
    if (!verifyOtpHash(digits, phone, record.otp_hash)) {
      await incrementAttempts(record.id, record.attempts);
      return { ok: false, message: "That code is incorrect. Please try again." };
    }

    await clearOtps(phone);

    const admin = createAdminClient();
    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        phone_verified_at: new Date().toISOString(),
      },
    });

    return { ok: true, message: "Phone verified." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not verify code.",
    };
  }
}

/** Sends a 6-digit email verification code to the signed-in merchant. */
export async function sendMerchantEmailVerification(): Promise<{
  ok: boolean;
  message: string;
  retryAfter?: number;
}> {
  try {
    const { generateOtp, hashOtp } = await import("@/lib/auth/otp/hash");
    const {
      countRecentRequests,
      lastRequestAt,
      persistOtp,
      purgeExpired,
      clearOtps,
      updateOtpDelivery,
    } = await import("@/lib/auth/otp/store");
    const { RESEND_SECONDS, MAX_REQUESTS_PER_MINUTE } = await import("@/lib/auth/otp/config");
    const { sendEmailVerificationCode } = await import("@/lib/email/resend");

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) return { ok: false, message: "No email on your account." };

    const email = normalizeEmail(user.email);
    const key = emailOtpKey(email);

    await purgeExpired();

    const last = await lastRequestAt(key);
    if (last) {
      const waitMs = RESEND_SECONDS * 1000 - (Date.now() - last);
      if (waitMs > 0) {
        return {
          ok: false,
          message: `Please wait ${Math.ceil(waitMs / 1000)}s before requesting another code.`,
          retryAfter: Math.ceil(waitMs / 1000),
        };
      }
    }

    const recent = await countRecentRequests(key);
    if (recent >= MAX_REQUESTS_PER_MINUTE) {
      return { ok: false, message: "Too many attempts. Please try again in a minute.", retryAfter: 60 };
    }

    const otp = generateOtp();
    const stored = await persistOtp({ phone: key, otpHash: hashOtp(otp, key) });
    if (!stored.ok) return { ok: false, message: "Could not start verification." };

    const name =
      typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : typeof user.user_metadata?.first_name === "string"
          ? user.user_metadata.first_name
          : undefined;

    const sent = await sendEmailVerificationCode({ to: email, code: otp, name });
    if (!sent.ok) {
      await clearOtps(key);
      return { ok: false, message: sent.error ?? "Could not send email verification code." };
    }

    await updateOtpDelivery(key, { channel: "email" });
    return { ok: true, message: "Verification code sent to your email." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not send verification code.",
    };
  }
}

/** Confirms the merchant email OTP without changing the auth session. */
export async function verifyMerchantEmailVerification(
  code: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const { verifyOtpHash } = await import("@/lib/auth/otp/hash");
    const { MAX_VERIFY_ATTEMPTS, OTP_LENGTH } = await import("@/lib/auth/otp/config");
    const { clearOtps, findActiveOtp, incrementAttempts } = await import("@/lib/auth/otp/store");

    const digits = code.replace(/\D/g, "");
    if (digits.length !== OTP_LENGTH) {
      return { ok: false, message: `Enter the ${OTP_LENGTH}-digit code we sent you.` };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) return { ok: false, message: "No email on your account." };

    const key = emailOtpKey(user.email);
    const record = await findActiveOtp(key);
    if (!record) {
      return { ok: false, message: "This code has expired. Please request a new one." };
    }
    if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
      await clearOtps(key);
      return { ok: false, message: "Too many incorrect attempts. Please request a new code." };
    }
    if (!verifyOtpHash(digits, key, record.otp_hash)) {
      await incrementAttempts(record.id, record.attempts);
      return { ok: false, message: "That code is incorrect. Please try again." };
    }

    await clearOtps(key);

    const admin = createAdminClient();
    await admin.auth.admin.updateUserById(user.id, {
      email_confirm: true,
      user_metadata: {
        ...user.user_metadata,
        email_verified_at: new Date().toISOString(),
      },
    });

    return { ok: true, message: "Email verified." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not verify code.",
    };
  }
}

function siteOrigin() {
  try {
    return getAppOrigin();
  } catch {
    return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "http://localhost:3000";
  }
}

/**
 * Sends a password-reset email via Resend.
 * Uses Supabase admin to mint a recovery link, then delivers it with Resend
 * (instead of Supabase's default mailer). Always returns success to the client
 * when the email isn't registered, so we don't leak account existence.
 */
export async function requestMerchantPasswordReset(
  email: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const normalized = normalizeEmail(email);
    if (!isValidEmail(normalized)) {
      return { ok: false, error: "Enter a valid email address." };
    }

    const admin = createAdminClient();
    const redirectTo = `${siteOrigin()}/auth/callback?next=${encodeURIComponent("/merchant/reset-password")}`;

    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: normalized,
      options: { redirectTo },
    });

    // Don't reveal whether the email exists.
    if (error || !data?.properties?.action_link) {
      return { ok: true };
    }

    const sent = await sendPasswordResetEmail({
      to: normalized,
      resetUrl: data.properties.action_link,
      name:
        (typeof data.user?.user_metadata?.full_name === "string"
          ? data.user.user_metadata.full_name
          : undefined) || undefined,
    });

    if (!sent.ok) {
      return { ok: false, error: sent.error ?? "Could not send reset email." };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not send reset email.",
    };
  }
}

/** Completes the recovery flow once the user has a valid recovery session. */
export async function updateMerchantPassword(
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!isValidPassword(password)) {
      return { ok: false, error: "Password must be at least 8 characters." };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error: "This reset link is invalid or has expired. Request a new one from the login page.",
      };
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not update password.",
    };
  }
}

/** Called after checkout payment — allows this user to access the store setup wizard. */
export async function markMerchantOnboarding(
  product: MerchantProduct = "loyalty",
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated" };

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: {
        ...user.app_metadata,
        merchant_onboarding: true,
        onboarding_product: product,
      },
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not complete checkout.",
    };
  }
}

/**
 * Adds a product entitlement for an existing merchant (second-product purchase).
 * The row starts un-onboarded so the per-product onboarding gate can run.
 */
export async function purchaseProduct(
  product: MerchantProduct,
  planId?: string,
): Promise<{ ok: boolean; error?: string }> {
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
    if (!merchant) return { ok: false, error: "Merchant account not found." };

    const { error } = await supabase
      .from("merchant_products")
      .upsert(
        {
          merchant_id: merchant.id,
          product,
          plan_id: planId ?? null,
          status: "active",
        },
        { onConflict: "merchant_id,product", ignoreDuplicates: true },
      );
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not add the product.",
    };
  }
}

/** Marks a product's onboarding block as finished. */
export async function completeProductOnboarding(
  product: MerchantProduct,
): Promise<{ ok: boolean; error?: string }> {
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
    if (!merchant) return { ok: false, error: "Merchant account not found." };

    const { error } = await supabase
      .from("merchant_products")
      .update({ onboarded_at: new Date().toISOString() })
      .eq("merchant_id", merchant.id)
      .eq("product", product);
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not finish setup.",
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
  ownerFirstName?: string;
  ownerLastName?: string;
  brandColor: string;
  logoDataUrl?: string;
  address?: string;
  websiteUrl?: string;
  googleBusinessUrl?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  xUrl?: string;
  rewardTitle?: string;
  rewardName: string;
  rewardImageDataUrl?: string;
  avgOrderValue?: number;
  // Optional override; a sensible default is derived when omitted.
  totalStamps?: number;
  rewardCooldownValue?: number;
  rewardCooldownUnit?: "hours" | "days" | "weeks";
  minPurchaseAmount?: number;
  // The first product this merchant is onboarding (seeds merchant_products).
  product?: MerchantProduct;
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
    const product = input.product ?? "loyalty";

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const slug = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
      const { data: inserted, error } = await supabase
        .from("merchants")
        .insert({
          owner_user_id: user.id,
          business_name: businessName,
          short_name: businessName,
          owner_first_name: input.ownerFirstName?.trim() || null,
          owner_last_name: input.ownerLastName?.trim() || null,
          slug,
          brand_color: input.brandColor,
          logo_url: input.logoDataUrl ?? null,
          address: input.address?.trim() || null,
          website_url: input.websiteUrl?.trim() || null,
          google_business_url: input.googleBusinessUrl?.trim() || null,
          instagram_url: input.instagramUrl?.trim() || null,
          facebook_url: input.facebookUrl?.trim() || null,
          x_url: input.xUrl?.trim() || null,
          reward_title: input.rewardTitle?.trim() || "Free reward",
          reward_name: input.rewardName.trim() || "Free reward",
          reward_image_url: input.rewardImageDataUrl ?? null,
          total_stamps: Math.min(20, Math.max(5, input.totalStamps ?? 5)),
          avg_order_value: input.avgOrderValue ?? 0,
          restart_after_reward: true,
          reward_cooldown_value: Math.max(0, Math.floor(input.rewardCooldownValue ?? 0)),
          reward_cooldown_unit: input.rewardCooldownUnit ?? "days",
          min_purchase_amount: Math.max(0, Number(input.minPurchaseAmount) || 0),
          email: user.email ?? null,
          phone:
            (typeof user.user_metadata?.phone === "string" ? user.user_metadata.phone : null) ||
            user.phone ||
            null,
        })
        .select("id")
        .single();
      if (!error && inserted) {
        // Seed the first product entitlement, already onboarded (this wizard
        // just finished the global + product blocks).
        await supabase.from("merchant_products").upsert(
          {
            merchant_id: inserted.id,
            product,
            status: "active",
            onboarded_at: new Date().toISOString(),
          },
          { onConflict: "merchant_id,product" },
        );
        // Seed a default branch and the owner's membership.
        await supabase.from("branches").insert({
          merchant_id: inserted.id,
          name: "Main branch",
          slug: `${slug}-main`,
          address: input.address?.trim() || null,
          is_default: true,
        });
        await supabase.from("merchant_members").upsert(
          {
            merchant_id: inserted.id,
            user_id: user.id,
            role: "owner",
            name: businessName,
            email: user.email ?? null,
          },
          { onConflict: "merchant_id,user_id" },
        );
        return { ok: true };
      }
      // 23505 = unique violation on slug; retry with a suffix.
      if (error && error.code !== "23505") return { ok: false, error: error.message };
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

  const ctx = await currentMerchant(supabase, user.id);
  if (!ctx) return { ok: false, error: "Merchant account not found." };

  // Loyalty program is global to the business — only the owner can change it.
  const loyaltyKeys: (keyof MerchantProfile)[] = [
    "rewardTitle",
    "rewardName",
    "rewardImageDataUrl",
    "totalStamps",
    "avgOrderValue",
    "restartAfterReward",
    "rewardCooldownValue",
    "rewardCooldownUnit",
  ];
  if (loyaltyKeys.some((key) => patch[key] !== undefined) && ctx.role !== "owner") {
    return { ok: false, error: "Only the owner can edit the loyalty program." };
  }

  const { error } = await supabase
    .from("merchants")
    .update(toMerchantRowPatch(patch))
    .eq("id", ctx.id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

type StampNotifCustomer = {
  name: string;
  phone: string | null;
  public_token: string | null;
  whatsapp_available: boolean | null;
  preferred_notification_channel: string | null;
};

type StampNotifMerchant = {
  business_name: string;
  total_stamps: number;
  reward_name?: string | null;
  reward_title?: string | null;
  reward_cooldown_value?: number | null;
  reward_cooldown_unit?: string | null;
};

/** Fire-and-forget loyalty alerts after a stamp is committed (never blocks approval). */
function notifyAfterStampVerified(input: {
  customer: StampNotifCustomer;
  merchant: StampNotifMerchant;
  currentStamps: number;
  rewardReady: boolean;
}) {
  const { customer, merchant, currentStamps, rewardReady } = input;
  if (!customer.phone?.trim() || !customer.public_token) return;

  const notifiable = {
    phone: customer.phone,
    name: customer.name,
    publicToken: customer.public_token,
    whatsappAvailable: customer.whatsapp_available === true,
    preferredNotificationChannel:
      customer.preferred_notification_channel === "whatsapp" ? "whatsapp" as const : "sms" as const,
  };

  void import("@/lib/notifications").then(async ({ sendCustomerNotification }) => {
    try {
      // Non-final stamp → stamp verified only.
      if (!rewardReady) {
        await sendCustomerNotification({
          customer: notifiable,
          template: "stamp_verified",
          data: {
            businessName: merchant.business_name,
            currentStamps,
            requiredStamps: merchant.total_stamps,
          },
        });
        return;
      }

      // Final stamp: do NOT send stamp_verified — final-stamp templates replace it.
      const waitValue = Math.max(0, Number(merchant.reward_cooldown_value ?? 0));
      if (waitValue <= 0) {
        const rewardTitle =
          (merchant.reward_title || merchant.reward_name || "Reward").trim() || "Reward";
        await sendCustomerNotification({
          customer: notifiable,
          template: "reward_unlocked",
          data: {
            businessName: merchant.business_name,
            currentStamps,
            requiredStamps: merchant.total_stamps,
            rewardTitle,
          },
        });
        return;
      }

      const waitUnit =
        merchant.reward_cooldown_unit === "hours" ||
        merchant.reward_cooldown_unit === "days" ||
        merchant.reward_cooldown_unit === "weeks"
          ? merchant.reward_cooldown_unit
          : "days";
      const { formatRewardCooldown } = await import("@/lib/loyalty/rules");
      await sendCustomerNotification({
        customer: notifiable,
        template: "stamp_collected_last_wait_time",
        data: {
          businessName: merchant.business_name,
          currentStamps,
          requiredStamps: merchant.total_stamps,
          waitLabel: formatRewardCooldown(waitValue, waitUnit),
        },
      });
    } catch (err) {
      console.error("Failed to send loyalty stamp notification", err);
    }
  });
}

export async function approveStamp(approvalId: string) {
  try {
    const supabase = await createClient();

    // Capture customer + business context before the RPC consumes the pending approval.
    const { data: approval } = await supabase
      .from("approvals")
      .select("id, customer_id, merchant_id")
      .eq("id", approvalId)
      .eq("status", "pending")
      .maybeSingle();

    if (!approval) return { ok: false, error: "Approval not found." };

    const [{ data: customer }, { data: merchant }] = await Promise.all([
      supabase
        .from("customers")
        .select(
          "name, phone, public_token, whatsapp_available, preferred_notification_channel",
        )
        .eq("id", approval.customer_id)
        .maybeSingle(),
      supabase
        .from("merchants")
        .select(
          "business_name, total_stamps, reward_name, reward_title, reward_cooldown_value, reward_cooldown_unit",
        )
        .eq("id", approval.merchant_id)
        .maybeSingle(),
    ]);

    const { error } = await supabase.rpc("approve_stamp", { p_approval_id: approvalId });
    if (error) return { ok: false, error: error.message };

    if (customer && merchant) {
      const { data: card } = await supabase
        .from("loyalty_cards")
        .select("stamps, status")
        .eq("customer_id", approval.customer_id)
        .maybeSingle();

      if (card) {
        notifyAfterStampVerified({
          customer,
          merchant,
          currentStamps: card.stamps,
          rewardReady: card.status === "reward_ready",
        });
      }
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not approve the stamp.",
    };
  }
}

export async function rejectStamp(approvalId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_stamp", { p_approval_id: approvalId });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Merchant awards a stamp directly from the customers admin (no pending request).
 * Sends stamp_verified for non-final stamps; final stamp uses
 * loyaltycard_reward_unlocked_no_wait_time or loyaltycard_stamp_collected_last_wait_time.
 */
export async function offerStamp(
  customerId: string,
): Promise<{ ok: boolean; error?: string; stamps?: number }> {
  try {
    const supabase = await createClient();

    const { data: customer } = await supabase
      .from("customers")
      .select(
        "id, name, phone, public_token, whatsapp_available, preferred_notification_channel, merchant_id, banned",
      )
      .eq("id", customerId)
      .maybeSingle();

    if (!customer) return { ok: false, error: "Customer not found." };
    if (customer.banned) return { ok: false, error: "This customer is banned." };

    const { data: merchant } = await supabase
      .from("merchants")
      .select(
        "business_name, total_stamps, reward_name, reward_title, reward_cooldown_value, reward_cooldown_unit",
      )
      .eq("id", customer.merchant_id)
      .maybeSingle();

    const { data: newStamps, error } = await supabase.rpc("offer_stamp", {
      p_customer_id: customerId,
    });
    if (error) return { ok: false, error: error.message };

    const currentStamps =
      typeof newStamps === "number" ? newStamps : (merchant?.total_stamps ?? 0);
    if (merchant) {
      notifyAfterStampVerified({
        customer,
        merchant,
        currentStamps,
        rewardReady: currentStamps >= merchant.total_stamps,
      });
    }

    return { ok: true, stamps: typeof newStamps === "number" ? newStamps : undefined };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not offer a stamp.",
    };
  }
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

    // Match against reward-ready cards in this shop by their random reward_code.
    // The legacy derived code (FROQ-{first 5 of id}) and the raw id are accepted
    // as fallbacks for older cards.
    const { data: cards } = await supabase
      .from("loyalty_cards")
      .select("customer_id, reward_code")
      .eq("merchant_id", merchant.id)
      .eq("status", "reward_ready");

    const target = (cards ?? []).find(
      (card) =>
        card.reward_code?.toUpperCase() === parsed ||
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

// ───────────────────────────────────────────────────────────────────────────
// Branches & team
// ───────────────────────────────────────────────────────────────────────────

async function currentMerchant(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<{ id: string; slug: string; role: MemberRole } | null> {
  const id = await resolveMerchantId(supabase, userId);
  if (!id) return null;
  const { data: m } = await supabase
    .from("merchants")
    .select("slug, owner_user_id")
    .eq("id", id)
    .maybeSingle();
  if (!m) return null;
  let role: MemberRole = "staff";
  if (m.owner_user_id === userId) {
    role = "owner";
  } else {
    const { data: mem } = await supabase
      .from("merchant_members")
      .select("role")
      .eq("merchant_id", id)
      .eq("user_id", userId)
      .maybeSingle();
    role = mem?.role === "owner" ? "owner" : "staff";
  }
  return { id, slug: m.slug, role };
}

const canManageBranches = (role: MemberRole) => role === "owner";

export async function createBranch(input: {
  name: string;
  address?: string;
}): Promise<{ ok: boolean; error?: string; branchId?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated." };

    const ctx = await currentMerchant(supabase, user.id);
    if (!ctx) return { ok: false, error: "Merchant account not found." };
    if (!canManageBranches(ctx.role)) return { ok: false, error: "You can't manage branches." };

    const name = input.name.trim();
    if (!name) return { ok: false, error: "Branch name is required." };

    const base = `${ctx.slug}-${slugify(name) || "branch"}`;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const slug = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
      const { data, error } = await supabase
        .from("branches")
        .insert({
          merchant_id: ctx.id,
          name,
          slug,
          address: input.address?.trim() || null,
          is_default: false,
        })
        .select("id")
        .maybeSingle();
      if (!error) return { ok: true, branchId: data?.id };
      if (error.code !== "23505") return { ok: false, error: error.message };
    }
    return { ok: false, error: "Could not create a unique branch link. Please try again." };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not add branch." };
  }
}

export async function updateBranch(
  branchId: string,
  patch: { name?: string; address?: string },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated." };

    const ctx = await currentMerchant(supabase, user.id);
    if (!ctx) return { ok: false, error: "Merchant account not found." };
    if (!canManageBranches(ctx.role)) return { ok: false, error: "You can't manage branches." };

    const row: { name?: string; address?: string | null } = {};
    if (patch.name !== undefined) {
      if (!patch.name.trim()) return { ok: false, error: "Branch name is required." };
      row.name = patch.name.trim();
    }
    if (patch.address !== undefined) row.address = patch.address.trim() || null;

    const { error } = await supabase
      .from("branches")
      .update(row)
      .eq("id", branchId)
      .eq("merchant_id", ctx.id);
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not update branch." };
  }
}

export async function deleteBranch(
  branchId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated." };

    const ctx = await currentMerchant(supabase, user.id);
    if (!ctx) return { ok: false, error: "Merchant account not found." };
    if (!canManageBranches(ctx.role)) return { ok: false, error: "You can't manage branches." };

    const { data: branch } = await supabase
      .from("branches")
      .select("is_default")
      .eq("id", branchId)
      .eq("merchant_id", ctx.id)
      .maybeSingle();
    if (!branch) return { ok: false, error: "Branch not found." };
    if (branch.is_default) return { ok: false, error: "You can't delete the main branch." };

    const { error } = await supabase
      .from("branches")
      .delete()
      .eq("id", branchId)
      .eq("merchant_id", ctx.id);
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not delete branch." };
  }
}

export async function inviteMember(input: {
  email: string;
  name?: string;
  role: MemberRole;
  branchIds?: string[];
}): Promise<{ ok: boolean; error?: string; emailSent?: boolean }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated." };

    const ctx = await currentMerchant(supabase, user.id);
    if (!ctx) return { ok: false, error: "Merchant account not found." };
    if (ctx.role !== "owner") return { ok: false, error: "Only the owner can manage the team." };

    const email = normalizeEmail(input.email);
    if (!isValidEmail(email)) return { ok: false, error: "Enter a valid email address." };
    if (input.role !== "staff") {
      return { ok: false, error: "Team members can only be invited as staff." };
    }

    const { data: merchantMeta } = await supabase
      .from("merchants")
      .select("business_name")
      .eq("id", ctx.id)
      .maybeSingle();
    const businessName = merchantMeta?.business_name?.trim() || "your store";

    const branchIds = input.branchIds ?? [];
    let branchLabel = "all branches";
    if (branchIds.length > 0) {
      const { data: branchRows } = await supabase
        .from("branches")
        .select("id, name")
        .eq("merchant_id", ctx.id)
        .in("id", branchIds);
      const names = (branchRows ?? []).map((b) => b.name);
      if (names.length === 1) branchLabel = names[0];
      else if (names.length === 2) branchLabel = `${names[0]} and ${names[1]}`;
      else if (names.length > 2) {
        branchLabel = `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
      }
    }

    const admin = createAdminClient();

    // Ensure an auth user exists (temp password; they set a real one on accept).
    let invitedUserId: string | null = null;
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      password: `${crypto.randomUUID()}aA1!`,
    });
    if (created.data?.user?.id) {
      invitedUserId = created.data.user.id;
    } else {
      const existing = await admin.auth.admin.generateLink({
        type: "recovery",
        email,
      });
      invitedUserId = existing.data?.user?.id ?? null;
      if (!invitedUserId) {
        return {
          ok: false,
          error: created.error?.message || existing.error?.message || "Could not invite this person.",
        };
      }
    }

    const inviteToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase.from("merchant_members").upsert(
      {
        merchant_id: ctx.id,
        user_id: invitedUserId,
        role: "staff",
        branch_id: branchIds[0] ?? null,
        branch_ids: branchIds,
        name: input.name?.trim() || null,
        email,
        invite_token: inviteToken,
        invite_expires_at: inviteExpiresAt,
        accepted_at: null,
      },
      { onConflict: "merchant_id,user_id" },
    );
    if (error) return { ok: false, error: error.message };

    const inviteUrl = `${siteOrigin()}/merchant/accept-invite?token=${encodeURIComponent(inviteToken)}`;
    const sent = await sendTeamInviteEmail({
      to: email,
      inviteUrl,
      businessName,
      branchLabel,
      name: input.name?.trim() || undefined,
    });

    return {
      ok: true,
      emailSent: sent.ok,
      error: sent.ok ? undefined : sent.error,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not invite member." };
  }
}

export type TeamInviteDetails =
  | { status: "ok"; email: string; businessName: string; branchLabel: string; name: string }
  | { status: "invalid"; error: string };

export async function getTeamInvite(token: string): Promise<TeamInviteDetails> {
  try {
    const trimmed = token.trim();
    if (!trimmed) return { status: "invalid", error: "This invite link is invalid." };

    const admin = createAdminClient();
    const { data: member } = await admin
      .from("merchant_members")
      .select("email, name, branch_ids, invite_expires_at, accepted_at, merchant_id")
      .eq("invite_token", trimmed)
      .maybeSingle();

    if (!member) return { status: "invalid", error: "This invite link is invalid or has already been used." };
    if (member.accepted_at) {
      return { status: "invalid", error: "This invite has already been accepted. Sign in to continue." };
    }
    if (member.invite_expires_at && new Date(member.invite_expires_at).getTime() < Date.now()) {
      return { status: "invalid", error: "This invite link has expired. Ask the owner to send a new one." };
    }

    const { data: merchant } = await admin
      .from("merchants")
      .select("business_name")
      .eq("id", member.merchant_id)
      .maybeSingle();

    const branchIds = member.branch_ids ?? [];
    let branchLabel = "all branches";
    if (branchIds.length > 0) {
      const { data: branchRows } = await admin
        .from("branches")
        .select("name")
        .eq("merchant_id", member.merchant_id)
        .in("id", branchIds);
      const names = (branchRows ?? []).map((b) => b.name);
      if (names.length === 1) branchLabel = names[0];
      else if (names.length === 2) branchLabel = `${names[0]} and ${names[1]}`;
      else if (names.length > 2) {
        branchLabel = `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
      }
    }

    return {
      status: "ok",
      email: member.email ?? "",
      businessName: merchant?.business_name?.trim() || "your store",
      branchLabel,
      name: member.name ?? "",
    };
  } catch {
    return { status: "invalid", error: "Could not load this invite." };
  }
}

export async function completeTeamInvite(input: {
  token: string;
  firstName: string;
  lastName: string;
  phone: string;
  password: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const token = input.token.trim();
    if (!token) return { ok: false, error: "This invite link is invalid." };

    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    const phoneRaw = input.phone.trim();
    if (!firstName) return { ok: false, error: "Enter your first name." };
    if (!lastName) return { ok: false, error: "Enter your last name." };
    if (!isValidPhone(phoneRaw)) return { ok: false, error: "Enter a valid phone number." };
    if (!isValidPassword(input.password)) {
      return { ok: false, error: "Password must be at least 8 characters." };
    }

    const phone = toCanonicalPhone(phoneRaw);
    const admin = createAdminClient();

    const { data: member } = await admin
      .from("merchant_members")
      .select("id, user_id, email, invite_expires_at, accepted_at")
      .eq("invite_token", token)
      .maybeSingle();

    if (!member?.user_id || !member.email) {
      return { ok: false, error: "This invite link is invalid or has already been used." };
    }
    if (member.accepted_at) {
      return { ok: false, error: "This invite has already been accepted. Sign in to continue." };
    }
    if (member.invite_expires_at && new Date(member.invite_expires_at).getTime() < Date.now()) {
      return { ok: false, error: "This invite link has expired. Ask the owner to send a new one." };
    }

    const fullName = `${firstName} ${lastName}`.trim();
    const { error: authError } = await admin.auth.admin.updateUserById(member.user_id, {
      password: input.password,
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        phone,
        full_name: fullName,
      },
    });
    if (authError) return { ok: false, error: authError.message };

    const { error: memberError } = await admin
      .from("merchant_members")
      .update({
        first_name: firstName,
        last_name: lastName,
        phone,
        name: fullName,
        accepted_at: new Date().toISOString(),
        invite_token: null,
        invite_expires_at: null,
      })
      .eq("id", member.id);
    if (memberError) return { ok: false, error: memberError.message };

    // Sign them into the dashboard.
    const supabase = await createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: member.email,
      password: input.password,
    });
    if (signInError) {
      return {
        ok: false,
        error: "Account created — sign in with your email and password to continue.",
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not complete your invite.",
    };
  }
}

export async function updateMemberRole(
  memberId: string,
  role: MemberRole,
  branchIds?: string[],
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated." };

    const ctx = await currentMerchant(supabase, user.id);
    if (!ctx) return { ok: false, error: "Merchant account not found." };
    if (ctx.role !== "owner") return { ok: false, error: "Only the owner can manage the team." };
    if (role !== "staff") return { ok: false, error: "Team members can only be staff." };

    const ids = branchIds ?? [];
    const { error } = await supabase
      .from("merchant_members")
      .update({ role: "staff", branch_id: ids[0] ?? null, branch_ids: ids })
      .eq("id", memberId)
      .eq("merchant_id", ctx.id)
      .neq("role", "owner");
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not update member." };
  }
}

export async function removeMember(
  memberId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated." };

    const ctx = await currentMerchant(supabase, user.id);
    if (!ctx) return { ok: false, error: "Merchant account not found." };
    if (ctx.role !== "owner") return { ok: false, error: "Only the owner can manage the team." };

    const { error } = await supabase
      .from("merchant_members")
      .delete()
      .eq("id", memberId)
      .eq("merchant_id", ctx.id)
      .neq("role", "owner");
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not remove member." };
  }
}
