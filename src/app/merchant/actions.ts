"use server";

import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  Branch,
  BranchContact,
  DashboardDateRange,
  DashboardFilteredStats,
  MemberRole,
  MerchantCustomer,
  MerchantInAppNotification,
  MerchantMember,
  MerchantProduct,
  MerchantProfile,
  PendingApproval,
} from "@/lib/merchant/types";
import type { BranchRow, MerchantRow } from "@/lib/supabase/database.types";
import { normalizeMemberProductIds } from "@/lib/merchant/product-access";
import {
  ESCALATION_ACTION_LABEL,
  pendingApprovalsHref,
} from "@/lib/merchant/approval-escalation";
import {
  slugify,
  toBranch,
  toBranchRowPatch,
  toCustomer,
  toMember,
  toMerchantProfile,
  toMerchantRowPatch,
} from "@/lib/merchant/mappers";
import {
  computeLoyaltyAnalytics,
  rangeRpcArgsForPreset,
} from "@/lib/merchant/analytics";
import type {
  AnalyticsCustomerRow,
  LoyaltyLifetimeStats,
  LoyaltyRangeBucket,
  LoyaltyRangeStats,
} from "@/lib/merchant/analytics";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  EMPTY_ENTITLEMENTS,
  entitlementsFromRows,
  isProductEnabled,
  isTrialActive,
  TRIAL_DAYS,
  type Entitlements,
} from "@/lib/merchant/entitlements";
import {
  classifyPlanChange,
  defaultPeriodEnd,
} from "@/lib/merchant/billing";
import { grantMenuAiCreditsOnPlanApply } from "@/lib/menu/ai-credits";
import { FREE_PLAN } from "@/lib/merchant/pricing";
import { cancelRazorpaySubscription } from "@/lib/payments/razorpay";
import { userIsMerchantAccount } from "@/lib/merchant/account";
import { verifyTurnstileToken } from "@/lib/turnstile/verify";
import { TURNSTILE_REJECTED_MESSAGE, isCaptchaAuthError } from "@/lib/turnstile/config";
import { parseRedeemCode } from "@/lib/merchant/parse-redeem-code";
import { digitsOnly, toCanonicalPhone } from "@/lib/auth/otp/phone";
import {
  isValidEmail,
  isValidPassword,
  isValidPhone,
  normalizeEmail,
} from "@/lib/auth/format";
import { sendPasswordResetEmail, sendTeamAccessChangedEmail, sendTeamInviteEmail } from "@/lib/email/resend";
import {
  notifyPlanCanceled,
  notifyPlanCancelScheduled,
  notifyPlanDowngraded,
  notifyPlanDowngradeScheduled,
  notifyPlanUpgraded,
} from "@/lib/notifications/billing-emails";
import { getPublicAppOrigin } from "@/lib/app-url";
import {
  ASSIGNABLE_ROLES,
  canViewAnalytics,
  canViewCustomerData,
  normalizeMemberRole,
  ROLE_LABELS,
} from "@/lib/merchant/roles";
import { resolveBranchFilterForUser } from "@/lib/merchant/branch-access";
import {
  buildProductBranchMap,
  branchCreatedUnassignedMessage,
  maxActiveBranches,
  productBranchLimitError,
  type ProductBranchMap,
} from "@/lib/merchant/branch-assignments";
import { mergeUnifiedCustomers } from "@/lib/merchant/unified-customers";
import type { UnifiedCustomer } from "@/lib/merchant/unified-customers";

const EMPTY_LIFETIME_STATS: LoyaltyLifetimeStats = {
  total_visits: 0,
  total_redemptions: 0,
  avg_days_between_visits: null,
  most_active_dow: null,
  most_active_hour: null,
};

function startOfPreviousCalendarMonth(): Date {
  const start = new Date();
  start.setDate(1);
  start.setMonth(start.getMonth() - 1);
  start.setHours(0, 0, 0, 0);
  return start;
}

function normalizeLifetimeStats(row: {
  total_visits: number | string | null;
  total_redemptions: number | string | null;
  avg_days_between_visits: number | string | null;
  most_active_dow: number | string | null;
  most_active_hour: number | string | null;
} | null): LoyaltyLifetimeStats {
  if (!row) return { ...EMPTY_LIFETIME_STATS };
  const toNum = (v: number | string | null) =>
    v === null || v === undefined || v === "" ? null : Number(v);
  const visits = toNum(row.total_visits);
  const redemptions = toNum(row.total_redemptions);
  const avg = toNum(row.avg_days_between_visits);
  const dow = toNum(row.most_active_dow);
  const hour = toNum(row.most_active_hour);
  return {
    total_visits: visits ?? 0,
    total_redemptions: redemptions ?? 0,
    avg_days_between_visits: avg,
    most_active_dow: dow,
    most_active_hour: hour,
  };
}

function buildDashboardStats(
  range: DashboardDateRange,
  customers: AnalyticsCustomerRow[],
  visits: { created_at: string; customer_id: string | null }[],
  pendingApprovals: number,
  lifetime: LoyaltyLifetimeStats,
  rangeStats: LoyaltyRangeStats | null,
): DashboardFilteredStats {
  return computeLoyaltyAnalytics({
    range,
    customers,
    visits,
    pendingApprovals,
    lifetime,
    rangeStats,
  });
}

function normalizeRangeStats(row: {
  stamps_in_range: number | string | null;
  rewards_in_range: number | string | null;
  chart_granularity: string | null;
  chart_buckets: unknown;
} | null): LoyaltyRangeStats | null {
  if (!row) return null;
  const toNum = (v: number | string | null) =>
    v === null || v === undefined || v === "" ? 0 : Number(v);
  const rawBuckets = Array.isArray(row.chart_buckets) ? row.chart_buckets : [];
  const chart_buckets: LoyaltyRangeBucket[] = rawBuckets.map((b, i) => {
    const item = b as Record<string, unknown>;
    return {
      bucket_index: toNum(item.bucket_index as number | string | null) || i,
      bucket_start: String(item.bucket_start ?? ""),
      visit_count: toNum(item.visit_count as number | string | null),
    };
  });
  return {
    stamps_in_range: toNum(row.stamps_in_range),
    rewards_in_range: toNum(row.rewards_in_range),
    chart_granularity: row.chart_granularity ?? "",
    chart_buckets,
  };
}

/**
 * merchant_loyalty_range_stats for stamps/rewards-in-range + chart buckets.
 * On error returns null → rangeStatsError UI (no truncated-array substitute).
 */
async function fetchLoyaltyRangeStats(
  supabase: SupabaseClient,
  merchantId: string,
  branchId: string | null,
  range: DashboardDateRange,
): Promise<LoyaltyRangeStats | null> {
  const args = rangeRpcArgsForPreset(range);
  const { data, error } = await supabase.rpc("merchant_loyalty_range_stats", {
    p_merchant_id: merchantId,
    p_branch_id: branchId,
    p_start: args.p_start,
    p_end: args.p_end,
    p_granularity: args.p_granularity,
    p_timezone: args.p_timezone,
  });
  if (error) {
    console.error(
      "[merchant_loyalty_range_stats]",
      error.message ?? error,
    );
    return null;
  }
  // .rpc() returns a set-of-rows array; take the single stats row explicitly.
  const row = Array.isArray(data) ? data[0] ?? null : data;
  return normalizeRangeStats(row);
}

/** Intentional fetch ceilings — PostgREST silently defaults to 1000; make that loud. */
const CUSTOMERS_FETCH_LIMIT = 1000;
/** Pending approvals UI list; rare to exceed this; badge uses exact count separately. */
const APPROVALS_FETCH_LIMIT = 500;
/**
 * Visits row fetch for stampsToday / stampsThisMonth / insights (range chart
 * uses merchant_loyalty_range_stats). Matches former PostgREST default.
 */
const EVENT_FETCH_LIMIT = 1000;

function warnIfTruncated(
  query: string,
  merchantId: string,
  count: number | null,
  limit: number,
) {
  if (count != null && count > limit) {
    console.error("[postgrest-truncation]", {
      query,
      merchantId,
      count,
      limit,
      returned: limit,
    });
  }
}

export type MerchantBundle =
  | { status: "unauthenticated" }
  | { status: "error" }
  | { status: "not_registered" }
  | { status: "needs_setup"; product: MerchantProduct }
  | {
      status: "ready";
      profile: MerchantProfile;
      dashboardStats: DashboardFilteredStats;
      customers: MerchantCustomer[];
      approvals: PendingApproval[];
      inAppNotifications: MerchantInAppNotification[];
      entitlements: Entitlements;
      branches: Branch[];
      /** Active branch ids per product (global branches filtered per product). */
      productBranches: ProductBranchMap;
      members: MerchantMember[];
      role: MemberRole;
      activeBranchId: string | null;
      /** false for staff scoped to specific branches (no combined view). */
      canViewAllBranches: boolean;
      /** empty = all products; owners always empty. */
      memberProductIds: MerchantProduct[];
      justJoined: boolean;
      currentUserId: string;
    };

function hasMerchantOnboarding(user: { app_metadata?: Record<string, unknown> }) {
  return user.app_metadata?.merchant_onboarding === true;
}

function onboardingProduct(user: { app_metadata?: Record<string, unknown> }): MerchantProduct {
  return user.app_metadata?.onboarding_product === "queue" ? "queue" : "loyalty";
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

    const ctx = await currentMerchant(supabase, user.id);
    if (!ctx || !canViewAnalytics(ctx.role)) return null;

    const merchantId = ctx.id;

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

    let customersQuery = supabase
      .from("customer_overview")
      .select(
        "id, name, banned, status, stamps, total_stamps, lifetime_visits, rewards_claimed, created_at, last_visit",
        { count: "exact" },
      )
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .range(0, CUSTOMERS_FETCH_LIMIT - 1);
    let pendingApprovalsQuery = supabase
      .from("approvals")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", merchantId)
      .eq("status", "pending");
    let visitsQuery = supabase
      .from("visits")
      .select("created_at, customer_id", { count: "exact" })
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .range(0, EVENT_FETCH_LIMIT - 1);

    if (branchFilter) {
      customersQuery = customersQuery.eq("branch_id", branchFilter);
      pendingApprovalsQuery = pendingApprovalsQuery.eq("branch_id", branchFilter);
      visitsQuery = visitsQuery.eq("branch_id", branchFilter);
    }

    const [customersRes, pendingApprovalsRes, visitsRes, lifetimeRes, rangeStats] =
      await Promise.all([
        customersQuery,
        pendingApprovalsQuery,
        visitsQuery,
        supabase.rpc("merchant_loyalty_lifetime_stats", {
          p_merchant_id: merchantId,
          p_branch_id: branchFilter ?? null,
        }),
        fetchLoyaltyRangeStats(supabase, merchantId, branchFilter, range),
      ]);

    warnIfTruncated(
      "getDashboardStats.customer_overview",
      merchantId,
      customersRes.count,
      CUSTOMERS_FETCH_LIMIT,
    );
    warnIfTruncated(
      "getDashboardStats.visits",
      merchantId,
      visitsRes.count,
      EVENT_FETCH_LIMIT,
    );

    let lifetime = { ...EMPTY_LIFETIME_STATS };
    if (lifetimeRes.error) {
      console.error(
        "[merchant_loyalty_lifetime_stats]",
        lifetimeRes.error.message ?? lifetimeRes.error,
      );
    } else {
      const row = Array.isArray(lifetimeRes.data)
        ? lifetimeRes.data[0] ?? null
        : lifetimeRes.data;
      lifetime = normalizeLifetimeStats(row);
    }

    return buildDashboardStats(
      range,
      (customersRes.data ?? []) as AnalyticsCustomerRow[],
      visitsRes.data ?? [],
      pendingApprovalsRes.count ?? 0,
      lifetime,
      rangeStats,
    );
  } catch {
    return null;
  }
}

export type MerchantSessionResult =
  | { status: "unauthenticated" }
  | { status: "error" }
  | { status: "not_registered" }
  | { status: "needs_setup"; product: MerchantProduct }
  | {
      status: "ready";
      profile: MerchantProfile;
      entitlements: Entitlements;
      branches: Branch[];
      productBranches: ProductBranchMap;
      members: MerchantMember[];
      role: MemberRole;
      activeBranchId: string | null;
      canViewAllBranches: boolean;
      /** empty = all products; owners always empty. */
      memberProductIds: MerchantProduct[];
      justJoined: boolean;
      currentUserId: string;
    };

export type MerchantWorkspaceDataResult =
  | { status: "unauthenticated" }
  | { status: "error" }
  | { status: "not_registered" }
  | { status: "needs_setup"; product: MerchantProduct }
  | {
      status: "ready";
      dashboardStats: DashboardFilteredStats;
      customers: MerchantCustomer[];
      approvals: PendingApproval[];
      inAppNotifications: MerchantInAppNotification[];
    };

/**
 * Opaque access handle created only by {@link establishMerchantAccess}.
 * Callers must not construct this — it is how workspace data receives a
 * verified merchant identity without accepting a client-supplied merchantId.
 */
type VerifiedMerchantAccess = {
  readonly __brand: "VerifiedMerchantAccess";
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  merchantId: string;
  profile: MerchantProfile;
  members: MerchantMember[];
  role: MemberRole;
  branches: Branch[];
  productBranches: ProductBranchMap;
  branchFilter: string | null;
  canViewAllBranches: boolean;
  /** Raw product rows before {@link applyDueBillingChanges}. */
  productRowsRaw: ProductBillingRow[];
  isOwner: boolean;
  me: MerchantMember | undefined;
};

type MerchantAccessResult =
  | { status: "unauthenticated" }
  /** A merchant lookup failed. Never conflated with "no store yet". */
  | { status: "error" }
  | { status: "not_registered" }
  | { status: "needs_setup"; product: MerchantProduct }
  | { status: "ready"; access: VerifiedMerchantAccess };

/**
 * Session half of the merchant bundle (auth → entitlements / branch ACL).
 * Owns applyDueBillingChanges + justJoined accepted_at write.
 */
export async function getMerchantSession(
  activeBranchId?: string | null,
): Promise<MerchantSessionResult> {
  const accessResult = await establishMerchantAccess(activeBranchId ?? null);
  if (accessResult.status !== "ready") return accessResult;
  return finalizeMerchantSession(accessResult.access);
}

/**
 * Workspace half of the merchant bundle (customers / approvals / analytics).
 * Re-establishes merchant identity via {@link establishMerchantAccess} when
 * called alone — never trusts a caller-supplied merchantId.
 */
export async function getMerchantWorkspaceData(
  activeBranchId?: string | null,
): Promise<MerchantWorkspaceDataResult> {
  const accessResult = await establishMerchantAccess(activeBranchId ?? null);
  if (accessResult.status !== "ready") return accessResult;
  return loadMerchantWorkspaceData(accessResult.access);
}

export async function getMerchantBundle(activeBranchId?: string | null): Promise<MerchantBundle> {
  try {
    // Shared identity once, then session side-effects ∥ workspace fan-out.
    const accessResult = await establishMerchantAccess(activeBranchId ?? null);
    if (accessResult.status !== "ready") return accessResult;

    const [session, workspace] = await Promise.all([
      finalizeMerchantSession(accessResult.access),
      loadMerchantWorkspaceData(accessResult.access),
    ]);

    if (session.status !== "ready" || workspace.status !== "ready") {
      // Both paths share the same access; ready is the only expected outcome.
      return { status: "error" };
    }

    return {
      status: "ready",
      profile: session.profile,
      dashboardStats: workspace.dashboardStats,
      customers: workspace.customers,
      approvals: workspace.approvals,
      inAppNotifications: workspace.inAppNotifications,
      entitlements: session.entitlements,
      branches: session.branches,
      productBranches: session.productBranches,
      members: session.members,
      role: session.role,
      activeBranchId: session.activeBranchId,
      canViewAllBranches: session.canViewAllBranches,
      memberProductIds: session.memberProductIds,
      justJoined: session.justJoined,
      currentUserId: session.currentUserId,
    };
  } catch {
    // Transient network/query errors must NOT look like a sign-out, otherwise a
    // single failed realtime refresh would bounce the merchant to the login
    // screen. Callers keep the last good state when they receive "error".
    return { status: "error" };
  }
}

/**
 * Columns consumed by establishMerchantAccess / toMerchantProfile.
 * Intentionally omits short_name and created_at (unused on this path).
 */
const MERCHANT_ACCESS_COLUMNS =
  "id, owner_user_id, slug, business_name, owner_first_name, owner_last_name, email, phone, address, brand_color, logo_url, website_url, google_business_url, google_place_id, google_maps_url, instagram_url, facebook_url, x_url, reward_title, reward_name, reward_image_url, total_stamps, restart_after_reward, reward_cooldown_value, reward_cooldown_unit, min_purchase_amount, stamp_notifications, approval_notifications, marketing_emails, queue_banner, queue_banner_link, queue_open_time, queue_close_time, queue_hours_timezone, queue_open_days, queue_auto_start, queue_auto_close, reservation_description, reservation_max_party_size, reservation_interval_minutes, reservation_open_time, reservation_close_time, reservation_allow_same_day, reservation_allow_notes, reservation_auto_decline_hours, reservation_whatsapp_enabled, reservation_grace_minutes, reservation_paused";

/** Optional columns — selected separately so missing migrations can't take down the dashboard. */
const MERCHANT_OPTIONAL_TOGGLE_COLUMNS =
  "notify_staff_pending_approvals, notify_manager_pending_approvals, notify_owner_pending_approvals, birthday_double_stamps, reservation_auto_assign_tables, menu_table_ordering, menu_server_notify, menu_show_loyalty_stamps, queue_ai_menu_enabled, menu_cgst_percent, menu_sgst_percent, menu_service_charge_percent";

/**
 * Resolve the merchant this user can access — as owner or as a team member.
 * Ownership and membership lookups run in parallel; owned wins if both exist.
 * Owner path returns the full access row in one round-trip; membership path
 * follows up with one merchants select (same column shape).
 *
 * "failed" is deliberately distinct from "none": a query that errored says
 * nothing about whether this user has a store, and callers must not read it as
 * "no store yet" — that would drop an established merchant into the setup
 * wizard and let them create a second store on top of their real one.
 */
type ResolvedMerchant =
  | { status: "found"; row: NonNullable<Awaited<ReturnType<typeof selectMerchantById>>["data"]> }
  | { status: "none" }
  | { status: "failed" };

function selectMerchantById(
  supabase: Awaited<ReturnType<typeof createClient>>,
  merchantId: string,
) {
  return supabase
    .from("merchants")
    .select(MERCHANT_ACCESS_COLUMNS)
    .eq("id", merchantId)
    .maybeSingle();
}

/**
 * Soft-load escalation toggles from migration 0064. Missing columns must not
 * fail the whole merchant session — defaults apply until the migration runs.
 */
async function loadEscalationToggles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  merchantId: string,
): Promise<{
  notify_staff_pending_approvals?: boolean;
  notify_manager_pending_approvals?: boolean;
  notify_owner_pending_approvals?: boolean;
  birthday_double_stamps?: boolean;
  reservation_auto_assign_tables?: boolean;
  menu_table_ordering?: boolean;
  menu_server_notify?: boolean;
  menu_show_loyalty_stamps?: boolean;
  queue_ai_menu_enabled?: boolean;
  menu_cgst_percent?: number | null;
  menu_sgst_percent?: number | null;
  menu_service_charge_percent?: number | null;
}> {
  const { data, error } = await supabase
    .from("merchants")
    .select(MERCHANT_OPTIONAL_TOGGLE_COLUMNS)
    .eq("id", merchantId)
    .maybeSingle();
  if (error || !data) return {};
  return data;
}

async function resolveMerchantRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<ResolvedMerchant> {
  const [ownedRes, membershipRes] = await Promise.all([
    // limit(1) rather than a bare maybeSingle(): an account that somehow owns
    // two stores resolves to its oldest one instead of failing every load.
    supabase
      .from("merchants")
      .select(MERCHANT_ACCESS_COLUMNS)
      .eq("owner_user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("merchant_members")
      .select("merchant_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (ownedRes.error || membershipRes.error) {
    console.error("[merchant-access]", {
      userId,
      owned: ownedRes.error?.message ?? null,
      membership: membershipRes.error?.message ?? null,
    });
    return { status: "failed" };
  }

  if (ownedRes.data) return { status: "found", row: ownedRes.data };

  const memberMerchantId = membershipRes.data?.merchant_id;
  if (!memberMerchantId) return { status: "none" };

  const memberRes = await selectMerchantById(supabase, memberMerchantId);
  if (memberRes.error) {
    console.error("[merchant-access]", { userId, member: memberRes.error.message });
    return { status: "failed" };
  }
  return memberRes.data ? { status: "found", row: memberRes.data } : { status: "none" };
}

export type LoyaltyHistoryEventType = "stamp" | "reward";

export interface LoyaltyHistoryEvent {
  id: string;
  type: LoyaltyHistoryEventType;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  /** True when this guest is currently banned. */
  customerBanned: boolean;
  atMs: number;
  /** Teammate who performed it; null for rows written before attribution. */
  staffName: string | null;
  staffRole: MemberRole | null;
  /** Stamp events only — purchase amount in ₹ (0 when not captured). */
  amount?: number;
  /** Reward events only — the redeem code that was used. */
  code?: string;
  branchId?: string | null;
  branchName?: string | null;
}

export interface LoyaltyHistoryResult {
  events: LoyaltyHistoryEvent[];
  /** True when either source hit LOYALTY_HISTORY_FETCH_LIMIT. */
  truncated: boolean;
}

/** Per-source row ceiling; the UI warns when a range exceeds it. */
const LOYALTY_HISTORY_FETCH_LIMIT = 500;

/**
 * Loyalty activity log: stamps issued + rewards redeemed, newest first.
 * `days` is a lookback window; null/undefined means all time.
 */
export async function getLoyaltyHistory(input?: {
  branchId?: string | null;
  days?: number | null;
}): Promise<LoyaltyHistoryResult> {
  const empty: LoyaltyHistoryResult = { events: [], truncated: false };
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return empty;

    const merchantId = await resolveMerchantId(supabase, user.id);
    if (!merchantId) return empty;

    const branchFilter = await resolveBranchFilterForUser(
      supabase,
      merchantId,
      user.id,
      input?.branchId ?? null,
    );

    const days = input?.days ?? null;
    const sinceIso =
      days === null ? null : new Date(Date.now() - days * 86_400_000).toISOString();

    let visitsQuery = supabase
      .from("visits")
      .select(
        "id, customer_id, branch_id, amount, created_at, performed_by_name, performed_by_role",
        { count: "exact" },
      )
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .range(0, LOYALTY_HISTORY_FETCH_LIMIT - 1);
    let redemptionsQuery = supabase
      .from("redemptions")
      .select(
        "id, customer_id, branch_id, code, redeemed_at, performed_by_name, performed_by_role",
        { count: "exact" },
      )
      .eq("merchant_id", merchantId)
      .order("redeemed_at", { ascending: false })
      .range(0, LOYALTY_HISTORY_FETCH_LIMIT - 1);

    if (branchFilter) {
      visitsQuery = visitsQuery.eq("branch_id", branchFilter);
      redemptionsQuery = redemptionsQuery.eq("branch_id", branchFilter);
    }
    if (sinceIso) {
      visitsQuery = visitsQuery.gte("created_at", sinceIso);
      redemptionsQuery = redemptionsQuery.gte("redeemed_at", sinceIso);
    }

    const [visitsRes, redemptionsRes] = await Promise.all([
      visitsQuery,
      redemptionsQuery,
    ]);

    warnIfTruncated(
      "getLoyaltyHistory.visits",
      merchantId,
      visitsRes.count,
      LOYALTY_HISTORY_FETCH_LIMIT,
    );
    warnIfTruncated(
      "getLoyaltyHistory.redemptions",
      merchantId,
      redemptionsRes.count,
      LOYALTY_HISTORY_FETCH_LIMIT,
    );

    const visits = visitsRes.data ?? [];
    const redemptions = redemptionsRes.data ?? [];

    const customerIds = [
      ...new Set(
        [...visits, ...redemptions]
          .map((row) => row.customer_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const nameById = new Map<string, { name: string; phone: string; banned: boolean }>();
    if (customerIds.length > 0) {
      const { data: customerRows } = await supabase
        .from("customers")
        .select("id, name, phone, banned")
        .eq("merchant_id", merchantId)
        .in("id", customerIds);
      for (const row of customerRows ?? []) {
        nameById.set(row.id, {
          name: row.name,
          phone: row.phone,
          banned: Boolean(row.banned),
        });
      }
    }

    const { data: branchRows } = await supabase
      .from("branches")
      .select("id, name")
      .eq("merchant_id", merchantId);
    const branchNameById = new Map((branchRows ?? []).map((b) => [b.id, b.name]));

    const resolve = (customerId: string | null) => {
      const found = customerId ? nameById.get(customerId) : undefined;
      return {
        customerName: found?.name?.trim() || "Deleted customer",
        customerPhone: found?.phone ?? "",
        customerBanned: found?.banned ?? false,
      };
    };

    const staffOf = (row: { performed_by_name: string | null; performed_by_role: string | null }) => ({
      staffName: row.performed_by_name?.trim() || null,
      staffRole: row.performed_by_role ? normalizeMemberRole(row.performed_by_role) : null,
    });

    const branchOf = (branchId: string | null | undefined) => ({
      branchId: branchId ?? null,
      branchName: branchId ? (branchNameById.get(branchId) ?? null) : null,
    });

    const events: LoyaltyHistoryEvent[] = [
      ...visits.map((row) => ({
        id: `stamp:${row.id}`,
        type: "stamp" as const,
        customerId: row.customer_id,
        ...resolve(row.customer_id),
        ...staffOf(row),
        ...branchOf(row.branch_id),
        atMs: new Date(row.created_at).getTime(),
        amount: Number(row.amount ?? 0),
      })),
      ...redemptions.map((row) => ({
        id: `reward:${row.id}`,
        type: "reward" as const,
        customerId: row.customer_id,
        ...resolve(row.customer_id),
        ...staffOf(row),
        ...branchOf(row.branch_id),
        atMs: new Date(row.redeemed_at).getTime(),
        code: row.code,
      })),
    ].sort((a, b) => b.atMs - a.atMs);

    const truncated =
      (visitsRes.count ?? 0) > LOYALTY_HISTORY_FETCH_LIMIT ||
      (redemptionsRes.count ?? 0) > LOYALTY_HISTORY_FETCH_LIMIT;

    return { events, truncated };
  } catch (error) {
    console.error("getLoyaltyHistory exception", error);
    return empty;
  }
}

export type CustomerTimelineEventType = "joined" | "stamp" | "reward" | "rejected";

export interface CustomerTimelineEvent {
  id: string;
  type: CustomerTimelineEventType;
  label: string;
  atMs: number;
  staffName: string | null;
  staffRole: MemberRole | null;
}

const CUSTOMER_TIMELINE_LIMIT = 40;

/** Stamp + reward activity for one customer, newest first, plus a joined event. */
export async function getCustomerLoyaltyTimeline(
  customerId: string,
): Promise<{ events: CustomerTimelineEvent[] }> {
  const empty = { events: [] as CustomerTimelineEvent[] };
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return empty;

    const ctx = await currentMerchant(supabase, user.id);
    // Any teammate with product access can view stamp/reward history; contact PII stays gated in the UI.
    if (!ctx) return empty;

    const id = customerId.trim();
    if (!id) return empty;

    const [customerRes, visitsRes, redemptionsRes, rejectionsRes] = await Promise.all([
      supabase
        .from("customers")
        .select("id, member_since")
        .eq("id", id)
        .eq("merchant_id", ctx.id)
        .maybeSingle(),
      supabase
        .from("visits")
        .select("id, created_at, performed_by_name, performed_by_role")
        .eq("merchant_id", ctx.id)
        .eq("customer_id", id)
        .order("created_at", { ascending: false })
        .limit(CUSTOMER_TIMELINE_LIMIT),
      supabase
        .from("redemptions")
        .select("id, redeemed_at, performed_by_name, performed_by_role")
        .eq("merchant_id", ctx.id)
        .eq("customer_id", id)
        .order("redeemed_at", { ascending: false })
        .limit(CUSTOMER_TIMELINE_LIMIT),
      // approvals carry no actor columns, so rejections show unattributed.
      supabase
        .from("approvals")
        .select("id, requested_at, resolved_at")
        .eq("merchant_id", ctx.id)
        .eq("customer_id", id)
        .eq("status", "rejected")
        .order("resolved_at", { ascending: false })
        .limit(CUSTOMER_TIMELINE_LIMIT),
    ]);

    if (!customerRes.data) return empty;

    const staffOf = (row: {
      performed_by_name: string | null;
      performed_by_role: string | null;
    }) => ({
      staffName: row.performed_by_name?.trim() || null,
      staffRole: row.performed_by_role
        ? normalizeMemberRole(row.performed_by_role)
        : null,
    });

    const events: CustomerTimelineEvent[] = [
      ...(visitsRes.data ?? []).map((row) => ({
        id: `stamp:${row.id}`,
        type: "stamp" as const,
        label: "Stamp collected",
        atMs: new Date(row.created_at).getTime(),
        ...staffOf(row),
      })),
      ...(redemptionsRes.data ?? []).map((row) => ({
        id: `reward:${row.id}`,
        type: "reward" as const,
        label: "Reward claimed",
        atMs: new Date(row.redeemed_at).getTime(),
        ...staffOf(row),
      })),
      ...(rejectionsRes.data ?? []).map((row) => ({
        id: `rejected:${row.id}`,
        type: "rejected" as const,
        label: "Stamp request declined",
        atMs: new Date(row.resolved_at ?? row.requested_at).getTime(),
        staffName: null,
        staffRole: null,
      })),
      {
        id: `joined:${customerRes.data.id}`,
        type: "joined" as const,
        label: "Joined loyalty",
        atMs: new Date(customerRes.data.member_since).getTime(),
        staffName: null,
        staffRole: null,
      },
    ].sort((a, b) => b.atMs - a.atMs);

    return { events: events.slice(0, CUSTOMER_TIMELINE_LIMIT) };
  } catch (error) {
    console.error("getCustomerLoyaltyTimeline exception", error);
    return empty;
  }
}

/** Private merchant notes on a loyalty customer. Owner/manager only. */
export async function updateCustomerMerchantNotes(
  customerId: string,
  merchantNotes: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated." };

    const ctx = await currentMerchant(supabase, user.id);
    if (!ctx) return { ok: false, error: "Merchant account not found." };
    if (!canViewCustomerData(ctx.role)) {
      return { ok: false, error: "Not allowed to edit customer notes." };
    }

    const id = customerId.trim();
    if (!id) return { ok: false, error: "Customer not found." };

    const notes = merchantNotes.trim().slice(0, 2000);
    const { error } = await supabase
      .from("customers")
      .update({ merchant_notes: notes || null })
      .eq("id", id)
      .eq("merchant_id", ctx.id);

    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (error) {
    console.error("updateCustomerMerchantNotes exception", error);
    return { ok: false, error: "Could not save notes." };
  }
}

export interface UnifiedCustomersResult {
  customers: UnifiedCustomer[];
  /** True when either source hit its fetch ceiling. */
  truncated: boolean;
}

/** Ceilings for the unified customers page. */
const UNIFIED_QUEUE_FETCH_LIMIT = 5000;
const UNIFIED_MENU_FETCH_LIMIT = 5000;
const UNIFIED_RESERVATION_FETCH_LIMIT = 5000;

/**
 * Every person the merchant knows, across loyalty, queue and reservations, in
 * one list. Owner/manager only — the payload is entirely contact PII.
 *
 * Queue / reservation rows are read with the admin client: RLS often yields an
 * empty set for the user-scoped client (no error), while live board /
 * analytics already bypass RLS the same way.
 */
export async function getUnifiedCustomers(input?: {
  branchId?: string | null;
}): Promise<UnifiedCustomersResult> {
  const empty: UnifiedCustomersResult = { customers: [], truncated: false };
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return empty;

    const merchant = await currentMerchant(supabase, user.id);
    if (!merchant || !canViewCustomerData(merchant.role)) return empty;

    const branchFilter = await resolveBranchFilterForUser(
      supabase,
      merchant.id,
      user.id,
      input?.branchId ?? null,
    );

    let loyaltyQuery = supabase
      .from("customer_overview")
      .select(
        "id, name, phone, email, banned, member_since, stamps, total_stamps, status, lifetime_visits, rewards_claimed, last_visit",
        { count: "exact" },
      )
      .eq("merchant_id", merchant.id)
      .order("created_at", { ascending: false })
      .range(0, CUSTOMERS_FETCH_LIMIT - 1);

    // Admin after authz — same pattern as getQueueAnalytics / listSessionEntries.
    const admin = createAdminClient();
    let queueQuery = admin
      .from("queue_entries")
      .select(
        "customer_id, name, phone, email, party_size, status, joined_at, seated_at",
        { count: "exact" },
      )
      .eq("merchant_id", merchant.id)
      .order("joined_at", { ascending: false })
      .range(0, UNIFIED_QUEUE_FETCH_LIMIT - 1);

    let reservationQuery = admin
      .from("reservations")
      .select(
        "customer_id, customer_name, customer_phone, party_size, status, reservation_date, reservation_time, created_at",
        { count: "exact" },
      )
      .eq("merchant_id", merchant.id)
      .order("created_at", { ascending: false })
      .range(0, UNIFIED_RESERVATION_FETCH_LIMIT - 1);

    let menuQuery = admin
      .from("menu_dining_sessions")
      .select(
        "customer_id, guest_name, guest_phone, party_size, opened_at, notes",
        { count: "exact" },
      )
      .eq("merchant_id", merchant.id)
      .or("customer_id.not.is.null,guest_phone.not.is.null")
      .order("opened_at", { ascending: false })
      .range(0, UNIFIED_MENU_FETCH_LIMIT - 1);

    if (branchFilter) {
      // Legacy guest rows may still have null branch_id. Attach them to the
      // default branch so branch-scoped Customers matches the live boards.
      const { data: defaultBranch } = await admin
        .from("branches")
        .select("id")
        .eq("merchant_id", merchant.id)
        .eq("is_default", true)
        .maybeSingle();
      if (defaultBranch?.id === branchFilter) {
        await Promise.all([
          admin
            .from("reservations")
            .update({ branch_id: branchFilter })
            .eq("merchant_id", merchant.id)
            .is("branch_id", null),
          admin
            .from("queue_entries")
            .update({ branch_id: branchFilter })
            .eq("merchant_id", merchant.id)
            .is("branch_id", null),
        ]);
      }

      loyaltyQuery = loyaltyQuery.eq("branch_id", branchFilter);
      // Strict branch scope — do not pull in null-branch guests from another queue.
      queueQuery = queueQuery.eq("branch_id", branchFilter);
      reservationQuery = reservationQuery.eq("branch_id", branchFilter);
      menuQuery = menuQuery.eq("branch_id", branchFilter);
    }

    const [loyaltyRes, queueRes, reservationRes, menuRes] = await Promise.all([
      loyaltyQuery,
      queueQuery,
      reservationQuery,
      menuQuery,
    ]);

    // One product failing must not wipe the others (Queue / Reservations →
    // Customers depend on their own rows).
    if (loyaltyRes.error) {
      console.error("getUnifiedCustomers loyalty", loyaltyRes.error);
    }
    if (queueRes.error) {
      console.error("getUnifiedCustomers queue", queueRes.error);
    }
    if (reservationRes.error) {
      console.error("getUnifiedCustomers reservations", reservationRes.error);
    }
    if (menuRes.error) {
      console.error("getUnifiedCustomers menu", menuRes.error);
    }

    warnIfTruncated(
      "getUnifiedCustomers.loyalty",
      merchant.id,
      loyaltyRes.count,
      CUSTOMERS_FETCH_LIMIT,
    );
    warnIfTruncated(
      "getUnifiedCustomers.queue",
      merchant.id,
      queueRes.count,
      UNIFIED_QUEUE_FETCH_LIMIT,
    );
    warnIfTruncated(
      "getUnifiedCustomers.reservations",
      merchant.id,
      reservationRes.count,
      UNIFIED_RESERVATION_FETCH_LIMIT,
    );
    warnIfTruncated(
      "getUnifiedCustomers.menu",
      merchant.id,
      menuRes.count,
      UNIFIED_MENU_FETCH_LIMIT,
    );

    const customers = mergeUnifiedCustomers({
      loyalty: loyaltyRes.error ? [] : (loyaltyRes.data ?? []),
      queue: queueRes.error ? [] : (queueRes.data ?? []),
      reservations: reservationRes.error ? [] : (reservationRes.data ?? []),
      menu: menuRes.error ? [] : (menuRes.data ?? []),
    });

    return {
      customers,
      truncated:
        (loyaltyRes.count ?? 0) > CUSTOMERS_FETCH_LIMIT ||
        (queueRes.count ?? 0) > UNIFIED_QUEUE_FETCH_LIMIT ||
        (reservationRes.count ?? 0) > UNIFIED_RESERVATION_FETCH_LIMIT ||
        (menuRes.count ?? 0) > UNIFIED_MENU_FETCH_LIMIT,
    };
  } catch (error) {
    console.error("getUnifiedCustomers exception", error);
    return empty;
  }
}

async function resolveMerchantId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const [ownedRes, membershipRes] = await Promise.all([
    supabase
      .from("merchants")
      .select("id")
      .eq("owner_user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("merchant_members")
      .select("merchant_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  if (ownedRes.data) return ownedRes.data.id;
  return membershipRes.data?.merchant_id ?? null;
}

/**
 * Auth + merchant resolve + profile + role + branches + branch ACL.
 * Does NOT run billing writes or justJoined — those stay in finalizeMerchantSession.
 */
async function establishMerchantAccess(
  activeBranchId: string | null,
): Promise<MerchantAccessResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthenticated" };

  const resolved = await resolveMerchantRow(supabase, user.id);
  if (resolved.status === "failed") return { status: "error" };
  if (resolved.status === "none") {
    return hasMerchantOnboarding(user)
      ? { status: "needs_setup", product: onboardingProduct(user) }
      : { status: "not_registered" };
  }

  const merchantRow = resolved.row;
  const merchantId = merchantRow.id;
  const escalationToggles = await loadEscalationToggles(supabase, merchantId);
  const profile = toMerchantProfile({ ...merchantRow, ...escalationToggles });

  const admin = createAdminClient();
  const [branchesRes, membersRes, productsRes, assignmentsRes] = await Promise.all([
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
    // Entitlements are merchant-scoped; staff RLS historically blocked this
    // table (owner-only). Use service role after membership is verified so
    // invited teammates see the same enabled products as the owner.
    admin
      .from("merchant_products")
      .select(
        "id, product, plan_id, status, onboarded_at, pending_plan_id, cancel_at_period_end, current_period_end, purchased_at, trial_started_at, trial_ends_at, razorpay_subscription_id",
      )
      .eq("merchant_id", merchantId),
    // Empty until migration 0089 lands; dashboard still boots with {}.
    supabase
      .from("product_branch_assignments")
      .select("product, branch_id, status")
      .eq("merchant_id", merchantId),
  ]);

  const allBranches = (branchesRes.data ?? []).map(toBranch);
  const productBranches = buildProductBranchMap(
    (assignmentsRes.data ?? []).map((row) => ({
      product: row.product as MerchantProduct,
      branchId: row.branch_id,
      status: row.status,
    })),
  );
  const members = (membersRes.data ?? []).map((row) => ({
    ...toMember(row),
    isPrimaryOwner: row.user_id === merchantRow.owner_user_id,
  }));
  const isOwner = merchantRow.owner_user_id === user.id;
  const me = members.find((m) => m.userId === user.id);
  const role: MemberRole = isOwner ? "owner" : normalizeMemberRole(me?.role);

  // Members with explicit branch_ids may only see those branches. Empty array =
  // all-branch access (account owners, co-owners, or teammates granted full access).
  const hasOwnerPowers = isOwner || role === "owner";
  const allowedBranchIds =
    !hasOwnerPowers && me && me.branchIds.length > 0 ? new Set(me.branchIds) : null;
  const branches = allowedBranchIds
    ? allBranches.filter((b) => allowedBranchIds.has(b.id))
    : allBranches;

  // Combined "All branches" view is for owners and managers with unrestricted
  // branch access only. Staff always work in a single-branch context.
  const canViewAllBranches =
    allowedBranchIds === null && (hasOwnerPowers || role === "manager");

  // Resolve the active branch. Restricted staff can never use the combined
  // "all branches" view — force them onto one of their allowed branches.
  // With a single location there's nothing to combine, so pin that branch.
  let branchFilter: string | null = null;
  if (allowedBranchIds) {
    if (activeBranchId && allowedBranchIds.has(activeBranchId)) {
      branchFilter = activeBranchId;
    } else {
      branchFilter = branches[0]?.id ?? null;
    }
  } else if (activeBranchId && allBranches.some((b) => b.id === activeBranchId)) {
    branchFilter = activeBranchId;
  } else if (!canViewAllBranches || allBranches.length <= 1) {
    branchFilter =
      allBranches.find((b) => b.isDefault)?.id ?? allBranches[0]?.id ?? null;
  }

  const access: VerifiedMerchantAccess = {
    __brand: "VerifiedMerchantAccess",
    supabase,
    userId: user.id,
    merchantId,
    profile,
    members,
    role,
    branches,
    productBranches,
    branchFilter,
    canViewAllBranches,
    productRowsRaw: (productsRes.data ?? []) as ProductBillingRow[],
    isOwner,
    me,
  };
  return { status: "ready", access };
}

/**
 * Session-only side effects + entitlements. Runs once per getMerchantBundle /
 * getMerchantSession call (never from the workspace path).
 */
async function finalizeMerchantSession(
  access: VerifiedMerchantAccess,
): Promise<Extract<MerchantSessionResult, { status: "ready" }>> {
  const productRows = await applyDueBillingChanges(
    access.merchantId,
    access.productRowsRaw,
  );

  // First time an invited teammate loads the dashboard → mark them as joined.
  let justJoined = false;
  const me = access.me;
  if (!access.isOwner && me && !me.joined) {
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

  return {
    status: "ready",
    profile: access.profile,
    entitlements: entitlementsFromRows(productRows),
    branches: access.branches,
    productBranches: access.productBranches,
    members: access.members,
    role: access.role,
    activeBranchId: access.branchFilter,
    canViewAllBranches: access.canViewAllBranches,
    memberProductIds:
      access.isOwner || access.role === "owner" ? [] : (access.me?.productIds ?? []),
    justJoined,
    currentUserId: access.userId,
  };
}

/**
 * Heavy fan-out. Uses VerifiedMerchantAccess only (from establishMerchantAccess)
 * so branch ACL + role-based PII stripping match today's authz.
 */
async function loadMerchantWorkspaceData(
  access: VerifiedMerchantAccess,
): Promise<Extract<MerchantWorkspaceDataResult, { status: "ready" }>> {
  const { supabase, merchantId, branchFilter, role, profile, userId } = access;
  const historyStartIso = startOfPreviousCalendarMonth().toISOString();

  let customersQuery = supabase
    .from("customer_overview")
    .select("*", { count: "exact" })
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false })
    .range(0, CUSTOMERS_FETCH_LIMIT - 1);
  let approvalsQuery = supabase
    .from("approvals")
    .select("id, customer_id, branch_id, stamps_before, requested_at", { count: "exact" })
    .eq("merchant_id", merchantId)
    .eq("status", "pending")
    .order("requested_at", { ascending: true })
    .range(0, APPROVALS_FETCH_LIMIT - 1);
  let visitsQuery = supabase
    .from("visits")
    .select("created_at, customer_id", { count: "exact" })
    .eq("merchant_id", merchantId)
    .gte("created_at", historyStartIso)
    .order("created_at", { ascending: false })
    .range(0, EVENT_FETCH_LIMIT - 1);
  const notificationsQuery = supabase
    .from("merchant_in_app_notifications")
    .select(
      "id, title, message, action_label, action_href, kind, escalation_level, read_at, created_at",
    )
    .eq("merchant_id", merchantId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (branchFilter) {
    customersQuery = customersQuery.eq("branch_id", branchFilter);
    approvalsQuery = approvalsQuery.eq("branch_id", branchFilter);
    visitsQuery = visitsQuery.eq("branch_id", branchFilter);
  }

  const workspaceRange: DashboardDateRange = "7d";
  const [customersRes, approvalsRes, visitsRes, lifetimeRes, rangeStats, notificationsRes] =
    await Promise.all([
      customersQuery,
      approvalsQuery,
      visitsQuery,
      supabase.rpc("merchant_loyalty_lifetime_stats", {
        p_merchant_id: merchantId,
        p_branch_id: branchFilter ?? null,
      }),
      fetchLoyaltyRangeStats(supabase, merchantId, branchFilter, workspaceRange),
      notificationsQuery,
    ]);

  warnIfTruncated(
    "getMerchantWorkspaceData.customer_overview",
    merchantId,
    customersRes.count,
    CUSTOMERS_FETCH_LIMIT,
  );
  warnIfTruncated(
    "getMerchantWorkspaceData.approvals_pending",
    merchantId,
    approvalsRes.count,
    APPROVALS_FETCH_LIMIT,
  );
  warnIfTruncated(
    "getMerchantWorkspaceData.visits",
    merchantId,
    visitsRes.count,
    EVENT_FETCH_LIMIT,
  );

  const visits = visitsRes.data ?? [];
  const overviewRows = customersRes.data ?? [];
  const customers = overviewRows.map(toCustomer);
  const customerById = new Map(customers.map((c) => [c.id, c]));

  let lifetime = { ...EMPTY_LIFETIME_STATS };
  if (lifetimeRes.error) {
    console.error(
      "[merchant_loyalty_lifetime_stats]",
      lifetimeRes.error.message ?? lifetimeRes.error,
    );
  } else {
    const row = Array.isArray(lifetimeRes.data)
      ? lifetimeRes.data[0] ?? null
      : lifetimeRes.data;
    lifetime = normalizeLifetimeStats(row);
  }

  // Exact pending count (not truncated list length) for badge / analytics.
  const pendingApprovals = approvalsRes.count ?? (approvalsRes.data ?? []).length;
  const dashboardStats = buildDashboardStats(
    workspaceRange,
    overviewRows as AnalyticsCustomerRow[],
    visits,
    pendingApprovals,
    lifetime,
    rangeStats,
  );

  const approvals: PendingApproval[] = (approvalsRes.data ?? []).map((row) => {
    const customer = customerById.get(row.customer_id);
    const branchId = row.branch_id ?? customer?.branchId ?? null;
    const branchName = branchId
      ? (access.branches.find((b) => b.id === branchId)?.name ?? null)
      : null;
    return {
      id: row.id,
      customerId: row.customer_id,
      customerName: customer?.name ?? "Customer",
      phone: canViewCustomerData(role) ? (customer?.phone ?? "") : "",
      requestedAt: new Date(row.requested_at).toLocaleString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      }),
      stampsBefore: row.stamps_before,
      totalStamps: profile.totalStamps,
      branchId,
      branchName,
    };
  });

  const inAppNotifications: MerchantInAppNotification[] = (
    notificationsRes.error ? [] : (notificationsRes.data ?? [])
  ).map((row) => ({
    id: row.id,
    title: row.title,
    message: row.message,
    actionLabel: row.action_label?.trim() || ESCALATION_ACTION_LABEL,
    actionHref: row.action_href?.trim() || pendingApprovalsHref(),
    kind: row.kind,
    escalationLevel:
      row.escalation_level === "3h" || row.escalation_level === "6h"
        ? row.escalation_level
        : null,
    read: row.read_at != null,
    createdAt: new Date(row.created_at).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
  }));

  // Staff only get enough to offer stamps via OTP — contact PII is stripped.
  const customersForRole = canViewCustomerData(role)
    ? customers
    : customers.map((c) => ({ ...c, phone: "", email: undefined, merchantNotes: "" }));

  return {
    status: "ready",
    dashboardStats,
    customers: customersForRole,
    approvals,
    inAppNotifications,
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
      .limit(1)
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

/**
 * Merchant dashboard login — email + password only.
 * Rejects sessions that aren't tied to a merchant store / onboarding flag so a
 * loyalty customer can't enter the merchant area with the same auth pool.
 *
 * Turnstile is verified here via canonical siteverify (not GoTrue): the widget
 * secret lives in our env, and Cloudflare Analytics needs our siteverify call.
 * Tokens are single-use, so we must not also hand them to signInWithPassword.
 */
export async function signInMerchantWithPassword(
  email: string,
  password: string,
  captchaToken?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const normalized = normalizeEmail(email);
    if (!isValidEmail(normalized)) {
      return { ok: false, error: "Enter a valid email address." };
    }
    if (!password) {
      return { ok: false, error: "Enter your password." };
    }

    const captcha = await verifyTurnstileToken(captchaToken, {
      source: "merchant-sign-in",
    });
    if (!captcha.ok) return { ok: false, error: captcha.error };

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalized,
      password,
    });
    if (error || !data.user) {
      if (isCaptchaAuthError(error?.message)) {
        return { ok: false, error: TURNSTILE_REJECTED_MESSAGE };
      }
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
 *
 * Turnstile: account create uses the service-role key (no GoTrue CAPTCHA). We
 * siteverify once up front, then sign in without reusing the spent token.
 */
export async function signUpMerchantWithPassword(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  city: string;
  state: string;
  captchaToken?: string;
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

    const captcha = await verifyTurnstileToken(input.captchaToken, {
      source: "merchant-sign-up",
    });
    if (!captcha.ok) return { ok: false, error: captcha.error };

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
        if (isCaptchaAuthError(signInError?.message)) {
          return { ok: false, error: TURNSTILE_REJECTED_MESSAGE };
        }
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
      return {
        ok: false,
        error: isCaptchaAuthError(signInError.message)
          ? TURNSTILE_REJECTED_MESSAGE
          : signInError.message,
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not create your account.",
    };
  }
}

/**
 * Applies the merchant gate to a session created by Google One Tap or the
 * rendered Google button.
 *
 * Those flows call `signInWithIdToken` in the browser, so they never pass
 * through /auth/callback where redirect sign-ins are vetted. Without this the
 * ID-token path would be a way around that check, since merchants and loyalty
 * customers share one auth pool. The session is read from the cookie, never
 * from the caller.
 */
export async function authorizeGoogleIdentitySession(
  flow: "signin" | "signup",
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, reason: "exchange" };

    // Signing up from checkout: the merchant record only exists after checkout
    // completes, so there is nothing to vet yet.
    if (flow === "signup") return { ok: true };

    if (!(await userIsMerchantAccount(user.id))) {
      await supabase.auth.signOut();
      return { ok: false, reason: "not_registered" };
    }

    return { ok: true };
  } catch {
    return { ok: false, reason: "exchange" };
  }
}

export interface GoogleCheckoutIdentity {
  email: string;
  firstName: string;
  lastName: string;
}

/**
 * The signed-in Google account, when checkout is resumed after the OAuth hop.
 * Returns null for password sessions so checkout keeps asking for a password.
 */
export async function getGoogleCheckoutIdentity(): Promise<GoogleCheckoutIdentity | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) return null;

    const viaGoogle = (user.identities ?? []).some((identity) => identity.provider === "google");
    if (!viaGoogle) return null;

    const meta = user.user_metadata ?? {};
    const fullName = typeof meta.full_name === "string" ? meta.full_name : "";
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    const firstName =
      (typeof meta.given_name === "string" ? meta.given_name : "") || parts[0] || "";
    const lastName =
      (typeof meta.family_name === "string" ? meta.family_name : "") ||
      parts.slice(1).join(" ") ||
      "";

    return { email: user.email, firstName, lastName };
  } catch {
    return null;
  }
}

/**
 * Finishes checkout account creation for a merchant who signed up with Google.
 *
 * Google already created (or matched) the auth user and the session, so this
 * only validates and stores the contact details the OAuth profile can't give us.
 * The email always comes from the verified session, never from the client.
 */
export async function signUpMerchantWithGoogle(input: {
  firstName: string;
  lastName: string;
  phone: string;
  city: string;
  state: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    const city = input.city.trim();
    const state = input.state.trim();
    const phoneDigits = input.phone.replace(/\D/g, "");

    if (!firstName) return { ok: false, error: "Enter your first name." };
    if (!lastName) return { ok: false, error: "Enter your last name." };
    if (!isValidPhone(phoneDigits)) {
      return { ok: false, error: "Enter a valid 10-digit mobile number." };
    }
    if (!city || !state) return { ok: false, error: "Select your city." };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, error: "Your Google sign-in expired. Continue with Google again." };
    }

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        full_name: [firstName, lastName].filter(Boolean).join(" "),
        first_name: firstName,
        last_name: lastName,
        phone: `+91${phoneDigits}`,
        city,
        state,
      },
    });
    if (error) return { ok: false, error: error.message };

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
 * True if this mobile is already used by another merchant owner or team member.
 * Checks auth.users.phone, merchants.phone, and merchant_members.phone.
 */
async function isPhoneUsedByAnotherMerchantOrStaff(
  canonical: string,
  excludeUserId: string,
): Promise<boolean> {
  const admin = createAdminClient();
  const phoneE164 = `+${canonical.replace(/\D/g, "")}`;
  const national = canonical.slice(-10);

  for (const candidate of [canonical, phoneE164]) {
    const { data: authUserId } = await admin.rpc("auth_user_id_by_phone", {
      p_phone: candidate,
    });
    if (authUserId && authUserId !== excludeUserId) return true;
  }

  // Match any stored format that ends with the same 10-digit national number.
  const { data: merchantRows } = await admin
    .from("merchants")
    .select("owner_user_id, phone")
    .like("phone", `%${national}`)
    .limit(50);

  for (const row of merchantRows ?? []) {
    if (!row.owner_user_id || row.owner_user_id === excludeUserId) continue;
    if (toCanonicalPhone(row.phone ?? "") === canonical) return true;
  }

  const { data: memberRows } = await admin
    .from("merchant_members")
    .select("user_id, phone")
    .like("phone", `%${national}`)
    .limit(50);

  for (const row of memberRows ?? []) {
    if (!row.user_id || row.user_id === excludeUserId) continue;
    if (toCanonicalPhone(row.phone ?? "") === canonical) return true;
  }

  return false;
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

/** Origin for email links — never localhost (invitees can't open it). */
function siteOrigin() {
  return getPublicAppOrigin();
}

/**
 * Sends a password-reset email via Resend.
 * Uses Supabase admin to mint a recovery link, then delivers it with Resend
 * (instead of Supabase's default mailer). Always returns success to the client
 * when the email isn't registered, so we don't leak account existence.
 */
export async function requestMerchantPasswordReset(
  email: string,
  captchaToken?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const normalized = normalizeEmail(email);
    if (!isValidEmail(normalized)) {
      return { ok: false, error: "Enter a valid email address." };
    }

    // Recovery links are minted with the service-role key and delivered through
    // Resend, so GoTrue's built-in CAPTCHA never sees this request — we verify
    // the token ourselves before spending an email on it.
    const captcha = await verifyTurnstileToken(captchaToken);
    if (!captcha.ok) return { ok: false, error: captcha.error };

    const admin = createAdminClient();
    const redirectTo = `${siteOrigin()}/auth/confirm?next=${encodeURIComponent("/merchant/reset-password")}`;

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

/** Update the signed-in teammate's first / last name across auth + membership. */
export async function updateAccountName(input: {
  firstName: string;
  lastName: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    if (!firstName) return { ok: false, error: "Enter your first name." };
    if (!lastName) return { ok: false, error: "Enter your last name." };
    const fullName = `${firstName} ${lastName}`;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated." };

    const { error: authError } = await supabase.auth.updateUser({
      data: {
        ...user.user_metadata,
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
      },
    });
    if (authError) return { ok: false, error: authError.message };

    const ctx = await currentMerchant(supabase, user.id);
    if (ctx) {
      const { error: memberError } = await supabase
        .from("merchant_members")
        .update({
          first_name: firstName,
          last_name: lastName,
          name: fullName,
        })
        .eq("merchant_id", ctx.id)
        .eq("user_id", user.id);
      if (memberError) return { ok: false, error: memberError.message };

      const { data: merchant } = await supabase
        .from("merchants")
        .select("owner_user_id")
        .eq("id", ctx.id)
        .maybeSingle();
      if (merchant?.owner_user_id === user.id) {
        const { error: ownerError } = await supabase
          .from("merchants")
          .update({
            owner_first_name: firstName,
            owner_last_name: lastName,
          })
          .eq("id", ctx.id);
        if (ownerError) return { ok: false, error: ownerError.message };
      }
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not update your name.",
    };
  }
}

/**
 * Change password while signed in — verifies the current password first.
 *
 * Protected despite being an authenticated action: re-authenticating with a
 * password grant is a credential-stuffing surface (a hijacked session could be
 * used to guess the real password and lock the owner out). Turnstile is checked
 * here via siteverify; the token is not forwarded to GoTrue.
 */
export async function changeMerchantPassword(
  currentPassword: string,
  newPassword: string,
  captchaToken?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!currentPassword) return { ok: false, error: "Enter your current password." };
    if (!isValidPassword(newPassword)) {
      return { ok: false, error: "New password must be at least 8 characters." };
    }
    if (currentPassword === newPassword) {
      return { ok: false, error: "New password must be different from the current one." };
    }

    const captcha = await verifyTurnstileToken(captchaToken, {
      source: "merchant-change-password",
    });
    if (!captcha.ok) return { ok: false, error: captcha.error };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) return { ok: false, error: "Not authenticated." };

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (signInError) {
      if (isCaptchaAuthError(signInError.message)) {
        return { ok: false, error: TURNSTILE_REJECTED_MESSAGE };
      }
      return { ok: false, error: "Current password is incorrect." };
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not update password.",
    };
  }
}

/**
 * Sends an OTP to a new mobile number so the signed-in merchant can change
 * their account phone. Does not alter the session.
 */
export async function sendMerchantPhoneChangeOtp(newPhone: string): Promise<{
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

    const phoneDigits = newPhone.replace(/\D/g, "").slice(-10);
    if (!isValidPhone(phoneDigits)) {
      return { ok: false, message: "Enter a valid 10-digit mobile number." };
    }

    const canonical = toCanonicalPhone(phoneDigits);
    if (!canonical) return { ok: false, message: "Enter a valid 10-digit mobile number." };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: "Not authenticated." };

    const current = merchantContactPhone(user);
    if (current && current === canonical) {
      return { ok: false, message: "That’s already your mobile number." };
    }

    if (await isPhoneUsedByAnotherMerchantOrStaff(canonical, user.id)) {
      return {
        ok: false,
        message: "This mobile number is already used by another merchant or staff account.",
      };
    }

    await purgeExpired();

    const last = await lastRequestAt(canonical);
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

    const recent = await countRecentRequests(canonical);
    if (recent >= MAX_REQUESTS_PER_MINUTE) {
      return { ok: false, message: "Too many attempts. Please try again in a minute.", retryAfter: 60 };
    }

    const otp = generateOtp();
    const stored = await persistOtp({ phone: canonical, otpHash: hashOtp(otp, canonical) });
    if (!stored.ok) return { ok: false, message: "Could not start verification." };

    // SMS-first: WhatsApp (#100) failures still burn APITxT's per-number
    // cooldown and would block an immediate SMS fallback.
    const delivery = await deliverOtp(canonical, otp, "sms-first");
    if (!delivery.ok) {
      await clearOtps(canonical);
      return {
        ok: false,
        message: delivery.message,
        retryAfter: delivery.retryAfter,
      };
    }

    await updateOtpDelivery(canonical, {
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

/** Verifies OTP for a new phone and updates auth + merchant profile. */
export async function verifyAndUpdateMerchantPhone(
  newPhone: string,
  code: string,
): Promise<{ ok: boolean; message: string; phone?: string }> {
  try {
    const { verifyOtpHash } = await import("@/lib/auth/otp/hash");
    const { MAX_VERIFY_ATTEMPTS, OTP_LENGTH } = await import("@/lib/auth/otp/config");
    const { clearOtps, findActiveOtp, incrementAttempts } = await import("@/lib/auth/otp/store");
    const { toSupabaseAuthPhone } = await import("@/lib/auth/otp/phone");

    const phoneDigits = newPhone.replace(/\D/g, "").slice(-10);
    if (!isValidPhone(phoneDigits)) {
      return { ok: false, message: "Enter a valid 10-digit mobile number." };
    }
    const canonical = toCanonicalPhone(phoneDigits);
    if (!canonical) return { ok: false, message: "Enter a valid 10-digit mobile number." };

    const digits = code.replace(/\D/g, "");
    if (digits.length !== OTP_LENGTH) {
      return { ok: false, message: `Enter the ${OTP_LENGTH}-digit code we sent you.` };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: "Not authenticated." };

    const record = await findActiveOtp(canonical);
    if (!record) {
      return { ok: false, message: "This code has expired. Please request a new one." };
    }
    if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
      await clearOtps(canonical);
      return { ok: false, message: "Too many incorrect attempts. Please request a new code." };
    }
    if (!verifyOtpHash(digits, canonical, record.otp_hash)) {
      await incrementAttempts(record.id, record.attempts);
      return { ok: false, message: "That code is incorrect. Please try again." };
    }

    await clearOtps(canonical);

    if (await isPhoneUsedByAnotherMerchantOrStaff(canonical, user.id)) {
      return {
        ok: false,
        message: "This mobile number is already used by another merchant or staff account.",
      };
    }

    const phoneE164 = toSupabaseAuthPhone(canonical);
    const admin = createAdminClient();

    const { error: authError } = await admin.auth.admin.updateUserById(user.id, {
      phone: phoneE164,
      phone_confirm: true,
      user_metadata: {
        ...user.user_metadata,
        phone: phoneE164,
        phone_verified_at: new Date().toISOString(),
      },
    });
    if (authError) {
      return { ok: false, message: authError.message };
    }

    const ctx = await currentMerchant(supabase, user.id);
    // Store contact phone belongs to the business — only the owner updates it.
    if (ctx?.role === "owner") {
      await admin.from("merchants").update({ phone: phoneE164 }).eq("id", ctx.id);
    }
    // Keep the member row in sync for owners and staff.
    if (ctx) {
      await admin
        .from("merchant_members")
        .update({ phone: canonical })
        .eq("merchant_id", ctx.id)
        .eq("user_id", user.id);
    }

    return { ok: true, message: "Mobile number updated.", phone: phoneE164 };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not update mobile number.",
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
  opts?: { razorpaySubscriptionId?: string | null },
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

    const periodEnd = planId ? defaultPeriodEnd(planId).toISOString() : null;
    const hasSubOpt = Boolean(opts && "razorpaySubscriptionId" in opts);
    const nextSubId = hasSubOpt
      ? opts?.razorpaySubscriptionId?.trim() || null
      : undefined;

    const { data: existing } = await supabase
      .from("merchant_products")
      .select("id, plan_id, razorpay_subscription_id")
      .eq("merchant_id", merchant.id)
      .eq("product", product)
      .maybeSingle();

    if (existing) {
      const previousSubId =
        typeof existing.razorpay_subscription_id === "string"
          ? existing.razorpay_subscription_id
          : null;
      const fromPlanId =
        typeof existing.plan_id === "string" ? existing.plan_id : null;
      if (
        nextSubId !== undefined &&
        previousSubId &&
        previousSubId !== nextSubId
      ) {
        await cancelRazorpaySubscription(previousSubId, { cancelAtCycleEnd: false });
      }

      const { error } = await supabase
        .from("merchant_products")
        .update({
          plan_id: planId ?? null,
          status: "active",
          pending_plan_id: null,
          cancel_at_period_end: false,
          current_period_end: periodEnd,
          ...(nextSubId !== undefined
            ? { razorpay_subscription_id: nextSubId }
            : {}),
        })
        .eq("id", existing.id);
      if (error) return { ok: false, error: error.message };
      if (planId) {
        await grantMenuAiCreditsOnPlanApply({
          merchantId: merchant.id as string,
          product,
          fromPlanId,
          toPlanId: planId,
        });
        after(() =>
          notifyPlanUpgraded({
            merchantId: merchant.id as string,
            product,
            fromPlanId,
            toPlanId: planId,
            effectiveOn: new Date().toISOString(),
          }),
        );
      }
      return { ok: true };
    }

    const { error } = await supabase.from("merchant_products").insert({
      merchant_id: merchant.id,
      product,
      plan_id: planId ?? null,
      status: "active",
      current_period_end: periodEnd,
      ...(nextSubId !== undefined ? { razorpay_subscription_id: nextSubId } : {}),
    });
    if (error) return { ok: false, error: error.message };
    if (planId) {
      await grantMenuAiCreditsOnPlanApply({
        merchantId: merchant.id as string,
        product,
        fromPlanId: null,
        toPlanId: planId,
      });
      after(() =>
        notifyPlanUpgraded({
          merchantId: merchant.id as string,
          product,
          fromPlanId: null,
          toPlanId: planId,
          effectiveOn: new Date().toISOString(),
        }),
      );
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not add the product.",
    };
  }
}

/**
 * Starts the free trial for a product. One per merchant per product, forever —
 * `trial_started_at` survives the trial lapsing, so a merchant can't restart it
 * by letting it expire.
 *
 * The row is left with plan_id null and onboarded_at null: access is granted by
 * `trial_ends_at` alone, and the merchant drops into the product's setup wizard
 * on their way in.
 */
export async function startProductTrial(
  product: MerchantProduct,
): Promise<{ ok: boolean; error?: string; trialEndsAt?: string }> {
  try {
    if (product !== "queue" && product !== "reservation") {
      return { ok: false, error: "A free trial isn't available for this product." };
    }

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
    if (!merchant) return { ok: false, error: "Only the owner can start a free trial." };

    const { data: existing } = await supabase
      .from("merchant_products")
      .select("id, plan_id, trial_started_at")
      .eq("merchant_id", merchant.id)
      .eq("product", product)
      .maybeSingle();

    if (existing?.plan_id) {
      return { ok: false, error: "You already have a plan for this product." };
    }
    if (existing?.trial_started_at) {
      return { ok: false, error: "You've already used your free trial." };
    }

    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + TRIAL_DAYS * 86_400_000);
    const patch = {
      status: "active" as const,
      plan_id: null,
      trial_started_at: startedAt.toISOString(),
      trial_ends_at: endsAt.toISOString(),
    };

    const { error } = existing
      ? await supabase.from("merchant_products").update(patch).eq("id", existing.id)
      : await supabase
          .from("merchant_products")
          .insert({ merchant_id: merchant.id, product, ...patch });

    if (error) return { ok: false, error: error.message };
    return { ok: true, trialEndsAt: endsAt.toISOString() };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not start the free trial.",
    };
  }
}

type ProductBillingRow = {
  id: string;
  product: MerchantProduct;
  plan_id: string | null;
  status: "active" | "past_due" | "canceled";
  onboarded_at: string | null;
  pending_plan_id: string | null;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  purchased_at: string;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  razorpay_subscription_id: string | null;
};

/** Applies due downgrades / cancellations when the paid period has ended. */
async function applyDueBillingChanges(
  merchantId: string,
  rows: ProductBillingRow[],
): Promise<ProductBillingRow[]> {
  const now = Date.now();
  const admin = createAdminClient();
  const next: ProductBillingRow[] = [];

  for (const row of rows) {
    let current = { ...row };
    const periodEnd = current.current_period_end
      ? new Date(current.current_period_end).getTime()
      : null;
    const due = periodEnd != null && periodEnd <= now;

    if (due && current.cancel_at_period_end) {
      const previousPlanId = current.plan_id;
      if (current.razorpay_subscription_id) {
        try {
          await cancelRazorpaySubscription(current.razorpay_subscription_id, {
            cancelAtCycleEnd: false,
          });
        } catch (error) {
          console.error(
            "[billing] failed to cancel Razorpay subscription on lock",
            current.razorpay_subscription_id,
            error,
          );
        }
      }
      const { data } = await admin
        .from("merchant_products")
        .update({
          plan_id: null,
          status: "canceled",
          pending_plan_id: null,
          cancel_at_period_end: false,
          current_period_end: null,
          razorpay_subscription_id: null,
        })
        .eq("id", current.id)
        .eq("merchant_id", merchantId)
        .select(PRODUCT_BILLING_COLUMNS)
        .maybeSingle();
      if (data) current = data as ProductBillingRow;
      after(() =>
        notifyPlanCanceled({
          merchantId,
          product: current.product,
          planId: previousPlanId,
          effectiveOn: new Date().toISOString(),
        }),
      );
    } else if (due && current.pending_plan_id) {
      const fromPlanId = current.plan_id;
      const toPlanId = current.pending_plan_id;
      const kind = classifyPlanChange(fromPlanId, toPlanId);
      const nextPeriodEnd = defaultPeriodEnd(current.pending_plan_id).toISOString();
      const { data } = await admin
        .from("merchant_products")
        .update({
          plan_id: current.pending_plan_id,
          status: "active",
          pending_plan_id: null,
          cancel_at_period_end: false,
          current_period_end: nextPeriodEnd,
        })
        .eq("id", current.id)
        .eq("merchant_id", merchantId)
        .select(PRODUCT_BILLING_COLUMNS)
        .maybeSingle();
      if (data) current = data as ProductBillingRow;
      if (kind === "downgrade") {
        after(() =>
          notifyPlanDowngraded({
            merchantId,
            product: current.product,
            fromPlanId,
            toPlanId,
            effectiveOn: new Date().toISOString(),
          }),
        );
      } else if (kind === "upgrade" || !fromPlanId || fromPlanId === FREE_PLAN.id) {
        await grantMenuAiCreditsOnPlanApply({
          merchantId,
          product: current.product,
          fromPlanId,
          toPlanId,
        });
        after(() =>
          notifyPlanUpgraded({
            merchantId,
            product: current.product,
            fromPlanId,
            toPlanId,
            effectiveOn: new Date().toISOString(),
          }),
        );
      }
    }

    next.push(current);
  }

  return next;
}

const PRODUCT_BILLING_COLUMNS =
  "id, product, plan_id, status, onboarded_at, pending_plan_id, cancel_at_period_end, current_period_end, purchased_at, trial_started_at, trial_ends_at, razorpay_subscription_id";

/**
 * Resolves the merchant's billing row for a product. `createIfMissing` is for
 * first-time purchases made from the plan page, where the merchant is buying a
 * product they don't own yet.
 */
async function requireOwnedProduct(
  product: MerchantProduct,
  opts?: { createIfMissing?: boolean },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not authenticated" };

  const { data: merchant } = await supabase
    .from("merchants")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!merchant) return { ok: false as const, error: "Merchant account not found." };

  let { data: existing } = await supabase
    .from("merchant_products")
    .select(PRODUCT_BILLING_COLUMNS)
    .eq("merchant_id", merchant.id)
    .eq("product", product)
    .maybeSingle();

  if (!existing && opts?.createIfMissing) {
    const { data: created, error: createError } = await supabase
      .from("merchant_products")
      .insert({ merchant_id: merchant.id, product, status: "active" })
      .select(PRODUCT_BILLING_COLUMNS)
      .maybeSingle();
    if (createError) return { ok: false as const, error: createError.message };
    existing = created;
  }

  if (!existing) {
    return { ok: false as const, error: "This product is not active on your account." };
  }

  return {
    ok: true as const,
    supabase,
    merchantId: merchant.id as string,
    existing: existing as ProductBillingRow,
  };
}

/**
 * Applies a plan immediately (first-time paid subscription / renewal apply).
 * Clears any scheduled change or cancellation. When a new Razorpay subscription
 * id is provided, cancels any previous subscription first.
 */
export async function updateProductPlan(
  product: MerchantProduct,
  planId: string,
  opts?: { razorpaySubscriptionId?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const ctx = await requireOwnedProduct(product, { createIfMissing: true });
    if (!ctx.ok) return { ok: false, error: ctx.error };

    const nextSubId =
      opts && "razorpaySubscriptionId" in opts
        ? opts.razorpaySubscriptionId?.trim() || null
        : undefined;
    const previousSubId = ctx.existing.razorpay_subscription_id?.trim() || null;

    if (nextSubId !== undefined && previousSubId && previousSubId !== nextSubId) {
      await cancelRazorpaySubscription(previousSubId, { cancelAtCycleEnd: false });
    }

    const periodEnd = defaultPeriodEnd(planId).toISOString();
    const fromPlanId = ctx.existing.plan_id;
    const { error } = await ctx.supabase
      .from("merchant_products")
      .update({
        plan_id: planId,
        status: "active",
        pending_plan_id: null,
        cancel_at_period_end: false,
        current_period_end: periodEnd,
        ...(nextSubId !== undefined ? { razorpay_subscription_id: nextSubId } : {}),
      })
      .eq("id", ctx.existing.id);
    if (error) return { ok: false, error: error.message };

    const kind = classifyPlanChange(fromPlanId, planId);
    if (kind === "upgrade" || !fromPlanId || fromPlanId === FREE_PLAN.id) {
      await grantMenuAiCreditsOnPlanApply({
        merchantId: ctx.merchantId,
        product,
        fromPlanId,
        toPlanId: planId,
      });
      after(() =>
        notifyPlanUpgraded({
          merchantId: ctx.merchantId,
          product,
          fromPlanId,
          toPlanId: planId,
          effectiveOn: new Date().toISOString(),
        }),
      );
    } else if (kind === "downgrade") {
      after(() =>
        notifyPlanDowngraded({
          merchantId: ctx.merchantId,
          product,
          fromPlanId,
          toPlanId: planId,
          effectiveOn: new Date().toISOString(),
        }),
      );
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not update the plan.",
    };
  }
}

/**
 * Schedules a plan change for the next renewal. Current plan stays active until then.
 * @deprecated Prefer schedulePlanChange — kept as an alias for older imports.
 */
export async function scheduleDowngrade(
  product: MerchantProduct,
  planId: string,
): Promise<{ ok: boolean; error?: string; effectiveOn?: string }> {
  return schedulePlanChange(product, planId);
}

/** Schedules any plan change (upgrade or downgrade) for the next renewal. */
export async function schedulePlanChange(
  product: MerchantProduct,
  planId: string,
): Promise<{ ok: boolean; error?: string; effectiveOn?: string }> {
  try {
    const ctx = await requireOwnedProduct(product);
    if (!ctx.ok) return { ok: false, error: ctx.error };

    const kind = classifyPlanChange(ctx.existing.plan_id, planId);
    if (kind === "same") {
      return { ok: false, error: "You're already on that plan." };
    }

    const periodEnd =
      ctx.existing.current_period_end ??
      defaultPeriodEnd(ctx.existing.plan_id, new Date(ctx.existing.purchased_at)).toISOString();

    const { error } = await ctx.supabase
      .from("merchant_products")
      .update({
        pending_plan_id: planId,
        cancel_at_period_end: false,
        current_period_end: periodEnd,
      })
      .eq("id", ctx.existing.id);
    if (error) return { ok: false, error: error.message };

    // Upgrades usually run immediately via updateProductPlan; scheduled changes
    // are predominantly downgrades — email the owner with the effective date.
    if (kind === "downgrade") {
      after(() =>
        notifyPlanDowngradeScheduled({
          merchantId: ctx.merchantId,
          product,
          fromPlanId: ctx.existing.plan_id,
          toPlanId: planId,
          effectiveOn: periodEnd,
        }),
      );
    }

    return { ok: true, effectiveOn: periodEnd };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not schedule the plan change.",
    };
  }
}

/** Cancels at period end; after that the product locks (no Free tier). */
export async function cancelProductPlan(
  product: MerchantProduct,
): Promise<{ ok: boolean; error?: string; effectiveOn?: string }> {
  try {
    const ctx = await requireOwnedProduct(product);
    if (!ctx.ok) return { ok: false, error: ctx.error };

    if (!ctx.existing.plan_id || ctx.existing.plan_id === FREE_PLAN.id) {
      return { ok: false, error: "You're not on a paid plan." };
    }
    if (ctx.existing.cancel_at_period_end) {
      return { ok: false, error: "Cancellation is already scheduled." };
    }

    const periodEnd =
      ctx.existing.current_period_end ??
      defaultPeriodEnd(ctx.existing.plan_id, new Date(ctx.existing.purchased_at)).toISOString();

    // Stop Razorpay renewals at the end of the current billing cycle so it
    // matches "access until period end, then lock".
    if (ctx.existing.razorpay_subscription_id) {
      await cancelRazorpaySubscription(ctx.existing.razorpay_subscription_id, {
        cancelAtCycleEnd: true,
      });
    }

    const { error } = await ctx.supabase
      .from("merchant_products")
      .update({
        cancel_at_period_end: true,
        pending_plan_id: null,
        current_period_end: periodEnd,
      })
      .eq("id", ctx.existing.id);
    if (error) return { ok: false, error: error.message };

    after(() =>
      notifyPlanCancelScheduled({
        merchantId: ctx.merchantId,
        product,
        planId: ctx.existing.plan_id as string,
        effectiveOn: periodEnd,
      }),
    );

    return { ok: true, effectiveOn: periodEnd };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not cancel the plan.",
    };
  }
}

/** Clears a scheduled downgrade or cancellation. */
export async function resumeProductPlan(
  product: MerchantProduct,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const ctx = await requireOwnedProduct(product);
    if (!ctx.ok) return { ok: false, error: ctx.error };

    const { error } = await ctx.supabase
      .from("merchant_products")
      .update({
        pending_plan_id: null,
        cancel_at_period_end: false,
      })
      .eq("id", ctx.existing.id);
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not resume the plan.",
    };
  }
}

/** Marks a product's onboarding block as finished, and activates selected branches. */
export async function completeProductOnboarding(
  product: MerchantProduct,
  branchIds?: string[],
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

    if (branchIds && branchIds.length > 0) {
      const assigned = await setProductBranchAssignments({
        product,
        branchIds,
      });
      if (!assigned.ok) return assigned;
    }

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
  /** Name for the seeded main branch. Defaults to "Main branch". */
  branchName?: string;
  address?: string;
  /** Public store phone/email shown to customers — not the owner's login. */
  storePhone?: string;
  storeEmail?: string;
  websiteUrl?: string;
  googleBusinessUrl?: string;
  googlePlaceId?: string;
  googleMapsUrl?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  xUrl?: string;
  rewardTitle?: string;
  rewardName: string;
  rewardImageDataUrl?: string;
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

    // One store per owner (extra locations are branches). Finishing the wizard
    // twice — a double submit, or a stale wizard reached because a merchant read
    // failed — must not fork the account into two stores.
    const { data: existing } = await supabase
      .from("merchants")
      .select("id")
      .eq("owner_user_id", user.id)
      .limit(1)
      .maybeSingle();
    if (existing) return { ok: true };

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
          google_place_id: input.googlePlaceId?.trim() || null,
          google_maps_url: input.googleMapsUrl?.trim() || null,
          instagram_url: input.instagramUrl?.trim() || null,
          facebook_url: input.facebookUrl?.trim() || null,
          x_url: input.xUrl?.trim() || null,
          reward_title: input.rewardTitle?.trim() || "Free reward",
          reward_name: input.rewardName.trim() || "Free reward",
          reward_image_url: input.rewardImageDataUrl ?? null,
          total_stamps: Math.min(20, Math.max(5, input.totalStamps ?? 5)),
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
            // Loyalty is granted Starter at signup so plan meters and
            // restrictions match enforcement from day one.
            ...(product === "loyalty" ? { plan_id: "starter" } : {}),
          },
          { onConflict: "merchant_id,product" },
        );
        // Seed the main branch with the contact details the wizard collected —
        // customers read these off the branch, not the merchant.
        const { data: seededBranch } = await supabase
          .from("branches")
          .insert({
          merchant_id: inserted.id,
          name: input.branchName?.trim() || "Main branch",
          slug: `${slug}-main`,
          is_default: true,
          address: input.address?.trim() || null,
          phone: input.storePhone?.trim() || null,
          email: input.storeEmail?.trim() || null,
          website_url: input.websiteUrl?.trim() || null,
          instagram_url: input.instagramUrl?.trim() || null,
          facebook_url: input.facebookUrl?.trim() || null,
          x_url: input.xUrl?.trim() || null,
          google_business_url: input.googleBusinessUrl?.trim() || null,
          google_place_id: input.googlePlaceId?.trim() || null,
          google_maps_url: input.googleMapsUrl?.trim() || null,
        })
          .select("id")
          .maybeSingle();

        if (seededBranch?.id) {
          await supabase.from("product_branch_assignments").upsert(
            {
              merchant_id: inserted.id,
              product,
              branch_id: seededBranch.id,
              status: "active",
            },
            { onConflict: "merchant_id,product,branch_id" },
          );
        }
        const ownerMemberName =
          [input.ownerFirstName?.trim(), input.ownerLastName?.trim()]
            .filter(Boolean)
            .join(" ") || null;
        await supabase.from("merchant_members").upsert(
          {
            merchant_id: inserted.id,
            user_id: user.id,
            role: "owner",
            name: ownerMemberName,
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
    "restartAfterReward",
    "rewardCooldownValue",
    "rewardCooldownUnit",
  ];
  if (loyaltyKeys.some((key) => patch[key] !== undefined) && ctx.role !== "owner") {
    return { ok: false, error: "Only the owner can edit the loyalty program." };
  }

  // Store identity (logo, brand, name) is global — owners only.
  const storeIdentityKeys: (keyof MerchantProfile)[] = [
    "businessName",
    "brandColor",
    "logoDataUrl",
  ];
  if (storeIdentityKeys.some((key) => patch[key] !== undefined) && ctx.role !== "owner") {
    return { ok: false, error: "Only the owner can edit store details." };
  }

  // Owner-escalation alerts are owner-controlled.
  if (patch.notifyOwnerPendingApprovals !== undefined && ctx.role !== "owner") {
    return { ok: false, error: "Only the owner can change owner approval alerts." };
  }

  const merchantRow = toMerchantRowPatch(patch);
  const { error } = await supabase
    .from("merchants")
    .update(merchantRow)
    .eq("id", ctx.id);
  if (error) return { ok: false, error: error.message };

  // Onboarding / merchant-profile saves still write hours on `merchants`.
  // Mirror those onto the main branch so createBranch can copy them later and
  // branch-scoped settings stay aligned with the wizard defaults.
  const branchHours: Partial<BranchRow> = {};
  if (merchantRow.queue_open_time !== undefined) {
    branchHours.queue_open_time = merchantRow.queue_open_time;
  }
  if (merchantRow.queue_close_time !== undefined) {
    branchHours.queue_close_time = merchantRow.queue_close_time;
  }
  if (merchantRow.queue_hours_timezone !== undefined) {
    branchHours.queue_hours_timezone = merchantRow.queue_hours_timezone;
  }
  if (merchantRow.queue_open_days !== undefined) {
    branchHours.queue_open_days = merchantRow.queue_open_days;
  }
  if (merchantRow.queue_auto_start !== undefined) {
    branchHours.queue_auto_start = merchantRow.queue_auto_start;
  }
  if (merchantRow.queue_auto_close !== undefined) {
    branchHours.queue_auto_close = merchantRow.queue_auto_close;
  }
  if (Object.keys(branchHours).length > 0) {
    await supabase
      .from("branches")
      .update(branchHours)
      .eq("merchant_id", ctx.id)
      .eq("is_default", true);
  }

  return { ok: true };
}

type StampNotifCustomer = {
  name: string;
  phone: string | null;
  email?: string | null;
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

function loyaltyNotifyLog(
  level: "info" | "error",
  event: string,
  fields: Record<string, unknown>,
) {
  const line = JSON.stringify({
    scope: "loyalty_notifications",
    level,
    event,
    ...fields,
    at: new Date().toISOString(),
  });
  if (level === "error") console.error(line);
  else console.info(line);
}

/**
 * Loyalty templates always send WhatsApp (+ email when available).
 * Stored channel prefs do not block WhatsApp.
 * publicToken may be empty for templates with no URL button (reward claimed).
 */
function toLoyaltyNotifiable(customer: StampNotifCustomer) {
  return {
    phone: customer.phone as string,
    name: (customer.name ?? "").trim() || "there",
    email: customer.email?.trim() || null,
    publicToken: (customer.public_token ?? "").trim(),
    whatsappAvailable: true,
    preferredNotificationChannel: "whatsapp" as const,
  };
}

/**
 * Sent after a reward is scanned/claimed (not when it becomes available).
 *
 * Runs in `after()` so the send completes once the response has flushed — a bare
 * floating promise is killed when the serverless invocation ends.
 *
 * loyaltycard_reward_claimed has no URL button, so a missing publicToken must
 * not skip the WhatsApp send.
 */
function notifyRewardClaimed(input: {
  customer: StampNotifCustomer;
  businessName: string;
  rewardTitle: string;
}) {
  const { customer, businessName, rewardTitle } = input;
  if (!customer.phone?.trim()) {
    loyaltyNotifyLog("error", "reward_redeemed_skipped", {
      reason: "missing_phone",
    });
    return;
  }

  const notifiable = toLoyaltyNotifiable(customer);

  after(async () => {
    try {
      const { sendCustomerNotification } = await import("@/lib/notifications");
      const result = await sendCustomerNotification({
        customer: notifiable,
        template: "reward_redeemed",
        data: {
          businessName: (businessName || "the store").trim() || "the store",
          rewardTitle: rewardTitle.trim() || "Reward",
        },
      });
      loyaltyNotifyLog(result.ok ? "info" : "error", "reward_redeemed", {
        ok: result.ok,
        channel: result.channel,
        error: result.error ?? null,
      });
    } catch (err) {
      loyaltyNotifyLog("error", "reward_redeemed_threw", {
        reason: err instanceof Error ? err.message : "unknown",
      });
    }
  });
}

/**
 * Loyalty alerts after a stamp is committed. Never blocks the approval: the send
 * runs in `after()`, which keeps the serverless invocation alive until it lands.
 */
function notifyAfterStampVerified(input: {
  customer: StampNotifCustomer;
  merchant: StampNotifMerchant;
  currentStamps: number;
  rewardReady: boolean;
}) {
  const { customer, merchant, currentStamps, rewardReady } = input;
  if (!customer.phone?.trim()) {
    loyaltyNotifyLog("error", "stamp_notification_skipped", {
      reason: "missing_phone",
      rewardReady,
    });
    return;
  }
  if (!customer.public_token?.trim()) {
    loyaltyNotifyLog("error", "stamp_notification_skipped", {
      reason: "missing_public_token",
      rewardReady,
    });
    return;
  }

  const notifiable = toLoyaltyNotifiable(customer);

  const rewardTitle =
    (merchant.reward_title || merchant.reward_name || "Reward").trim() || "Reward";

  after(async () => {
    try {
      const { sendCustomerNotification } = await import("@/lib/notifications");

      // Non-final stamp → stamp verified only.
      if (!rewardReady) {
        const result = await sendCustomerNotification({
          customer: notifiable,
          template: "stamp_verified",
          data: {
            businessName: merchant.business_name,
            currentStamps,
            requiredStamps: merchant.total_stamps,
            rewardTitle,
          },
        });
        loyaltyNotifyLog(result.ok ? "info" : "error", "stamp_verified", {
          ok: result.ok,
          channel: result.channel,
          error: result.error ?? null,
        });
        return;
      }

      // Final stamp: do NOT send stamp_verified — final-stamp templates replace it.
      const waitValue = Math.max(0, Number(merchant.reward_cooldown_value ?? 0));
      if (waitValue <= 0) {
        const result = await sendCustomerNotification({
          customer: notifiable,
          template: "reward_unlocked",
          data: {
            businessName: merchant.business_name,
            currentStamps,
            requiredStamps: merchant.total_stamps,
            rewardTitle,
          },
        });
        loyaltyNotifyLog(result.ok ? "info" : "error", "reward_unlocked", {
          ok: result.ok,
          channel: result.channel,
          error: result.error ?? null,
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
      const result = await sendCustomerNotification({
        customer: notifiable,
        template: "stamp_collected_last_wait_time",
        data: {
          businessName: merchant.business_name,
          currentStamps,
          requiredStamps: merchant.total_stamps,
          waitLabel: formatRewardCooldown(waitValue, waitUnit),
          rewardTitle,
        },
      });
      loyaltyNotifyLog(result.ok ? "info" : "error", "stamp_collected_last_wait_time", {
        ok: result.ok,
        channel: result.channel,
        error: result.error ?? null,
      });
    } catch (err) {
      loyaltyNotifyLog("error", "stamp_notification_threw", {
        reason: err instanceof Error ? err.message : "unknown",
      });
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
          "name, phone, email, public_token, whatsapp_available, preferred_notification_channel, banned",
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

    if (customer?.banned) {
      return { ok: false, error: "This customer is banned." };
    }

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

function stampOfferOtpKey(customerId: string) {
  return `stamp-offer:${customerId}`;
}

/**
 * Sends a one-time code to the customer so staff/owner can confirm offering a stamp.
 * Does not award the stamp — call confirmOfferStamp after the customer shares the code.
 */
export async function requestOfferStampOtp(customerId: string): Promise<{
  ok: boolean;
  error?: string;
  message?: string;
  channel?: "whatsapp" | "sms";
  retryAfter?: number;
}> {
  try {
    const { generateOtp, hashOtp } = await import("@/lib/auth/otp/hash");
    const { deliverOtp } = await import("@/lib/auth/otp/deliver");
    const {
      claimOtpSendSlot,
      countRecentRequests,
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
    if (!user) return { ok: false, error: "Not authenticated." };

    const { data: customer } = await supabase
      .from("customers")
      .select("id, phone, banned, merchant_id")
      .eq("id", customerId)
      .maybeSingle();

    if (!customer) return { ok: false, error: "Customer not found." };
    if (customer.banned) return { ok: false, error: "This customer is banned." };

    const phone = toCanonicalPhone(customer.phone);
    if (!phone) return { ok: false, error: "Customer has no valid phone number." };

    const { data: card } = await supabase
      .from("loyalty_cards")
      .select("status, cooldown_until")
      .eq("customer_id", customerId)
      .maybeSingle();

    if (!card) return { ok: false, error: "Loyalty card not found." };
    if (card.status === "reward_ready") {
      return { ok: false, error: "Redeem their current reward before offering another stamp." };
    }

    if (card.cooldown_until && new Date(card.cooldown_until).getTime() > Date.now()) {
      return { ok: false, error: "This customer's next stamp card is still locked." };
    }

    const { count: pendingCount } = await supabase
      .from("approvals")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId)
      .eq("status", "pending");

    if ((pendingCount ?? 0) > 0) {
      return { ok: false, error: "A stamp request is already pending for this customer." };
    }

    const key = stampOfferOtpKey(customerId);
    await purgeExpired();

    const slot = await claimOtpSendSlot(key, RESEND_SECONDS);
    if (!slot.ok) {
      return {
        ok: false,
        error: `Please wait ${slot.retryAfter}s before requesting another code.`,
        retryAfter: slot.retryAfter,
      };
    }

    const recent = await countRecentRequests(key);
    if (recent >= MAX_REQUESTS_PER_MINUTE) {
      await clearOtps(key);
      return {
        ok: false,
        error: "Too many attempts. Please try again in a minute.",
        retryAfter: 60,
      };
    }

    const otp = generateOtp();
    const stored = await persistOtp({ phone: key, otpHash: hashOtp(otp, key) });
    if (!stored.ok) return { ok: false, error: "Could not start verification." };

    const delivery = await deliverOtp(phone, otp);
    if (!delivery.ok) {
      await clearOtps(key);
      return { ok: false, error: delivery.message };
    }

    await updateOtpDelivery(key, {
      requestId: delivery.requestId,
      channel: delivery.channel,
    });

    if (delivery.channel === "whatsapp") {
      const { markWhatsAppAvailableForPhone } = await import("@/lib/notifications/prefs");
      await markWhatsAppAvailableForPhone({ phone });
    }

    const via = delivery.channel === "whatsapp" ? "WhatsApp" : "SMS";
    return {
      ok: true,
      channel: delivery.channel,
      message: `Code sent to the customer via ${via}. Ask them for it to confirm the stamp.`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not send verification code.",
    };
  }
}

/**
 * Verifies the customer OTP, then awards a stamp (same as the old direct offer flow).
 */
export async function confirmOfferStamp(
  customerId: string,
  code: string,
): Promise<{ ok: boolean; error?: string; stamps?: number }> {
  try {
    const { verifyOtpHash } = await import("@/lib/auth/otp/hash");
    const { MAX_VERIFY_ATTEMPTS, OTP_LENGTH } = await import("@/lib/auth/otp/config");
    const { clearOtps, findActiveOtp, incrementAttempts } = await import("@/lib/auth/otp/store");

    const digits = code.replace(/\D/g, "");
    if (digits.length !== OTP_LENGTH) {
      return { ok: false, error: `Enter the ${OTP_LENGTH}-digit code sent to the customer.` };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated." };

    const key = stampOfferOtpKey(customerId);
    const record = await findActiveOtp(key);
    if (!record) {
      return { ok: false, error: "This code has expired. Please request a new one." };
    }
    if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
      await clearOtps(key);
      return { ok: false, error: "Too many incorrect attempts. Please request a new code." };
    }
    if (!verifyOtpHash(digits, key, record.otp_hash)) {
      await incrementAttempts(record.id, record.attempts);
      return { ok: false, error: "That code is incorrect. Please try again." };
    }

    await clearOtps(key);
    return executeOfferStamp(customerId);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not confirm the stamp.",
    };
  }
}

/**
 * Awards a stamp after OTP confirmation. Not a client-facing server action —
 * only confirmOfferStamp should call this.
 */
async function executeOfferStamp(
  customerId: string,
): Promise<{ ok: boolean; error?: string; stamps?: number }> {
  try {
    const supabase = await createClient();

    const { data: customer } = await supabase
      .from("customers")
      .select(
        "id, name, phone, email, public_token, whatsapp_available, preferred_notification_channel, merchant_id, banned",
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const merchantId = await resolveMerchantId(supabase, user.id);
  if (!merchantId) return { ok: false, error: "Merchant account not found." };

  const [{ data: customer }, { data: merchant }] = await Promise.all([
    supabase
      .from("customers")
      .select(
        "name, phone, email, public_token, whatsapp_available, preferred_notification_channel, merchant_id",
      )
      .eq("id", customerId)
      .maybeSingle(),
    supabase
      .from("merchants")
      .select("id, business_name, reward_title, reward_name")
      .eq("id", merchantId)
      .maybeSingle(),
  ]);

  if (!merchant) return { ok: false, error: "Merchant account not found." };
  if (customer && customer.merchant_id !== merchant.id) {
    return { ok: false, error: "Customer not found." };
  }

  const { error } = await supabase.rpc("redeem_reward", {
    p_customer_id: customerId,
    p_code: code,
  });
  if (error) return { ok: false, error: error.message };

  // loyaltycard_reward_claimed has no URL button — phone is enough to notify.
  if (customer?.phone) {
    notifyRewardClaimed({
      customer,
      businessName: merchant.business_name,
      rewardTitle:
        (merchant.reward_title || merchant.reward_name || "Reward").trim() || "Reward",
    });
  }

  return { ok: true };
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

    // Owner or teammate — same resolve path as the rest of the merchant workspace.
    const merchantId = await resolveMerchantId(supabase, user.id);
    if (!merchantId) return { ok: false, error: "Merchant account not found." };

    const { data: merchant } = await supabase
      .from("merchants")
      .select("id, business_name, reward_title, reward_name")
      .eq("id", merchantId)
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
      .select(
        "name, phone, email, public_token, whatsapp_available, preferred_notification_channel",
      )
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

    // loyaltycard_reward_claimed has no URL button — don't gate on public_token.
    if (customer?.phone) {
      notifyRewardClaimed({
        customer,
        businessName: merchant.business_name,
        rewardTitle:
          (merchant.reward_title || merchant.reward_name || "Reward").trim() ||
          "Reward",
      });
    } else {
      loyaltyNotifyLog("error", "reward_redeemed_skipped", {
        reason: "missing_phone",
        customerId: target.customer_id,
      });
    }

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };
  const ctx = await currentMerchant(supabase, user.id);
  if (!ctx) return { ok: false, error: "Merchant account not found." };
  if (ctx.role !== "owner") return { ok: false, error: "Only the owner can ban customers." };

  const { error } = await supabase.from("customers").update({ banned }).eq("id", customerId);
  if (error) return { ok: false, error: error.message };

  // Drop open stamp requests so a ban cannot be approved after the fact.
  if (banned) {
    await supabase
      .from("approvals")
      .update({ status: "rejected", resolved_at: new Date().toISOString() })
      .eq("customer_id", customerId)
      .eq("status", "pending");
  }

  return { ok: true };
}

/**
 * Permanently remove a person across every product (loyalty + queue).
 * Queue rows only SET NULL their customer_id on customer delete, so they
 * must be wiped explicitly. Owner-only.
 */
export async function deleteUnifiedCustomer(input: {
  customerId?: string | null;
  phone?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated." };

    const ctx = await currentMerchant(supabase, user.id);
    if (!ctx) return { ok: false, error: "Merchant account not found." };
    if (ctx.role !== "owner") {
      return { ok: false, error: "Only the owner can delete customers." };
    }

    const customerId = input.customerId?.trim() || null;
    const phone = input.phone?.trim() || "";
    if (!customerId && !phone) {
      return { ok: false, error: "Customer not found." };
    }

    // Resolve phone variants so queue history written under +91… / 91… / bare
    // national formats is removed together with the loyalty record.
    let phoneVariants: string[] = [];
    if (phone) {
      const canonical = toCanonicalPhone(phone);
      const national = digitsOnly(phone).slice(-10);
      phoneVariants = [
        ...new Set(
          [
            phone,
            canonical,
            canonical ? `+${canonical}` : null,
            national.length === 10 ? national : null,
            national.length === 10 ? `91${national}` : null,
            national.length === 10 ? `+91${national}` : null,
          ].filter((value): value is string => Boolean(value)),
        ),
      ];
    }

    // queue_entries / queue_call_jobs have no merchant DELETE RLS — use admin
    // after the owner check above.
    const admin = createAdminClient();

    if (customerId) {
      const { error: entriesByIdError } = await admin
        .from("queue_entries")
        .delete()
        .eq("merchant_id", ctx.id)
        .eq("customer_id", customerId);
      if (entriesByIdError) {
        return { ok: false, error: entriesByIdError.message };
      }

      const { error: jobsByIdError } = await admin
        .from("queue_call_jobs")
        .delete()
        .eq("merchant_id", ctx.id)
        .eq("customer_id", customerId);
      if (jobsByIdError) {
        return { ok: false, error: jobsByIdError.message };
      }
    }

    if (phoneVariants.length > 0) {
      const { error: entriesByPhoneError } = await admin
        .from("queue_entries")
        .delete()
        .eq("merchant_id", ctx.id)
        .in("phone", phoneVariants);
      if (entriesByPhoneError) {
        return { ok: false, error: entriesByPhoneError.message };
      }

      const { error: jobsByPhoneError } = await admin
        .from("queue_call_jobs")
        .delete()
        .eq("merchant_id", ctx.id)
        .in("customer_phone", phoneVariants);
      if (jobsByPhoneError) {
        return { ok: false, error: jobsByPhoneError.message };
      }
    }

    if (customerId) {
      const { error } = await admin
        .from("customers")
        .delete()
        .eq("merchant_id", ctx.id)
        .eq("id", customerId);
      if (error) return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (error) {
    console.error("deleteUnifiedCustomer exception", error);
    return { ok: false, error: "Could not delete customer." };
  }
}

/** @deprecated Prefer deleteUnifiedCustomer — kept for loyalty CRM callers. */
export async function deleteCustomer(customerId: string) {
  return deleteUnifiedCustomer({ customerId });
}

export async function deleteMerchantAccount(): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated." };

    const admin = createAdminClient();

    // Primary owner: delete the whole store (cascades to members, cards, etc.).
    const { data: ownedMerchant } = await supabase
      .from("merchants")
      .select("id")
      .eq("owner_user_id", user.id)
      .maybeSingle();

    if (ownedMerchant) {
      const { error: pushError } = await admin
        .from("push_subscriptions")
        .delete()
        .eq("merchant_id", ownedMerchant.id);
      if (pushError) return { ok: false, error: pushError.message };

      const { error } = await admin.from("merchants").delete().eq("id", ownedMerchant.id);
      if (error) return { ok: false, error: error.message };

      // Remove the auth user so the login can't be reused against a deleted store.
      await admin.auth.admin.deleteUser(user.id);
      return { ok: true };
    }

    // Manager / staff / co-owner: leave the team and delete this login only.
    const { data: memberships, error: membershipLookupError } = await admin
      .from("merchant_members")
      .select("id, merchant_id")
      .eq("user_id", user.id);
    if (membershipLookupError) return { ok: false, error: membershipLookupError.message };
    if (!memberships || memberships.length === 0) {
      return { ok: false, error: "Merchant account not found." };
    }

    const merchantIds = [...new Set(memberships.map((row) => row.merchant_id))];

    const { error: notifError } = await admin
      .from("merchant_in_app_notifications")
      .delete()
      .eq("user_id", user.id)
      .in("merchant_id", merchantIds);
    if (notifError) return { ok: false, error: notifError.message };

    const { error: memberError } = await admin
      .from("merchant_members")
      .delete()
      .eq("user_id", user.id);
    if (memberError) return { ok: false, error: memberError.message };

    const { error: authError } = await admin.auth.admin.deleteUser(user.id);
    if (authError) return { ok: false, error: authError.message };

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
    role = normalizeMemberRole(mem?.role);
  }
  return { id, slug: m.slug, role };
}

const canManageBranches = (role: MemberRole) => role === "owner";

export async function createBranch(input: {
  name: string;
  contact?: Partial<BranchContact>;
  /** Seeds the new branch from the main branch's contact details and links. */
  copyContactFromMainBranch?: boolean;
  /** Optional store timings; defaults to copying the main branch's hours. */
  hours?: { openTime: string; closeTime: string; openDays: number[] };
  /**
   * When set, try to activate the new branch on this product. Creation always
   * succeeds globally; activation is plan-gated and may return a warning.
   */
  assignToProduct?: MerchantProduct;
}): Promise<{
  ok: boolean;
  error?: string;
  branchId?: string;
  assigned?: boolean;
  warning?: string;
}> {
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

    // Global branch directory is uncapped — plan limits only gate activation
    // per product (see setProductBranchAssignment / assignToProduct below).

    // Main branch = is_default; fall back to earliest created. Queue hours +
    // wait estimate always seed from it so new locations inherit the schedule
    // the merchant already configured (contact copy stays opt-in).
    const BRANCH_QUEUE_SELECT =
      "phone, email, website_url, instagram_url, facebook_url, x_url, google_business_url, queue_open_time, queue_close_time, queue_hours_timezone, queue_open_days, queue_auto_start, queue_auto_close, estimated_wait_minutes";
    let mainBranch: {
      phone: string | null;
      email: string | null;
      website_url: string | null;
      instagram_url: string | null;
      facebook_url: string | null;
      x_url: string | null;
      google_business_url: string | null;
      queue_open_time: string;
      queue_close_time: string;
      queue_hours_timezone: string;
      queue_open_days: number[];
      queue_auto_start: boolean;
      queue_auto_close: boolean;
      estimated_wait_minutes: number;
    } | null = null;
    {
      const { data: defaultBranch } = await supabase
        .from("branches")
        .select(BRANCH_QUEUE_SELECT)
        .eq("merchant_id", ctx.id)
        .eq("is_default", true)
        .maybeSingle();
      if (defaultBranch) {
        mainBranch = defaultBranch;
      } else {
        const { data: earliestBranch } = await supabase
          .from("branches")
          .select(BRANCH_QUEUE_SELECT)
          .eq("merchant_id", ctx.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        mainBranch = earliestBranch;
      }
    }

    let contactRow = toBranchRowPatch(input.contact ?? {});
    if (input.copyContactFromMainBranch && mainBranch) {
      // Address and the Google listing stay branch-specific even when copying:
      // they describe the location, not the business.
      contactRow = {
        phone: mainBranch.phone,
        email: mainBranch.email,
        website_url: mainBranch.website_url,
        instagram_url: mainBranch.instagram_url,
        facebook_url: mainBranch.facebook_url,
        x_url: mainBranch.x_url,
        google_business_url: mainBranch.google_business_url,
        ...contactRow,
      };
    }

    const queueSettingsFromMain = mainBranch
      ? {
          queue_open_time: mainBranch.queue_open_time,
          queue_close_time: mainBranch.queue_close_time,
          queue_hours_timezone: mainBranch.queue_hours_timezone,
          queue_open_days: mainBranch.queue_open_days,
          queue_auto_start: mainBranch.queue_auto_start,
          queue_auto_close: mainBranch.queue_auto_close,
          estimated_wait_minutes: mainBranch.estimated_wait_minutes,
        }
      : null;
    const queueSettings = input.hours
      ? {
          queue_open_time: input.hours.openTime,
          queue_close_time: input.hours.closeTime,
          queue_hours_timezone: mainBranch?.queue_hours_timezone ?? "Asia/Kolkata",
          queue_open_days: input.hours.openDays,
          queue_auto_start: mainBranch?.queue_auto_start ?? false,
          queue_auto_close: mainBranch?.queue_auto_close ?? false,
          estimated_wait_minutes: mainBranch?.estimated_wait_minutes ?? 10,
        }
      : queueSettingsFromMain;

    const base = `${ctx.slug}-${slugify(name) || "branch"}`;
    let branchId: string | undefined;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const slug = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
      const { data, error } = await supabase
        .from("branches")
        .insert({
          merchant_id: ctx.id,
          name,
          slug,
          is_default: false,
          ...contactRow,
          ...(queueSettings ?? {}),
        })
        .select("id")
        .maybeSingle();
      if (!error) {
        branchId = data?.id;
        break;
      }
      if (error.code !== "23505") return { ok: false, error: error.message };
    }
    if (!branchId) {
      return { ok: false, error: "Could not create a unique branch link. Please try again." };
    }

    if (!input.assignToProduct) {
      return { ok: true, branchId, assigned: false };
    }

    const assign = await activateBranchForProduct(
      supabase,
      ctx.id,
      input.assignToProduct,
      branchId,
    );
    if (assign.ok) {
      return { ok: true, branchId, assigned: true };
    }
    return {
      ok: true,
      branchId,
      assigned: false,
      warning: assign.warning ?? assign.error,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not add branch." };
  }
}

/**
 * Activate or deactivate a global branch for one product. Plan limits apply
 * only on activation — deactivation and global create are always allowed.
 */
export async function setProductBranchAssignment(input: {
  product: MerchantProduct;
  branchId: string;
  active: boolean;
}): Promise<{ ok: boolean; error?: string; warning?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated." };

    const ctx = await currentMerchant(supabase, user.id);
    if (!ctx) return { ok: false, error: "Merchant account not found." };
    if (!canManageBranches(ctx.role)) {
      return { ok: false, error: "You can't manage branches." };
    }

    const { data: branch } = await supabase
      .from("branches")
      .select("id")
      .eq("id", input.branchId)
      .eq("merchant_id", ctx.id)
      .maybeSingle();
    if (!branch) return { ok: false, error: "Branch not found." };

    if (!input.active) {
      const { error } = await supabase
        .from("product_branch_assignments")
        .upsert(
          {
            merchant_id: ctx.id,
            product: input.product,
            branch_id: input.branchId,
            status: "inactive",
          },
          { onConflict: "merchant_id,product,branch_id" },
        );
      return error ? { ok: false, error: error.message } : { ok: true };
    }

    return activateBranchForProduct(
      supabase,
      ctx.id,
      input.product,
      input.branchId,
    );
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not update branch assignment.",
    };
  }
}

/**
 * Replace the active set for a product (onboarding multi-select). Counts must
 * stay within the plan cap.
 */
export async function setProductBranchAssignments(input: {
  product: MerchantProduct;
  branchIds: string[];
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated." };

    const ctx = await currentMerchant(supabase, user.id);
    if (!ctx) return { ok: false, error: "Merchant account not found." };
    if (!canManageBranches(ctx.role)) {
      return { ok: false, error: "You can't manage branches." };
    }

    const uniqueIds = [...new Set(input.branchIds.filter(Boolean))];
    const entitlements = await loadEntitlementsForMerchant(ctx.id);
    const max = maxActiveBranches(input.product, entitlements);
    if (uniqueIds.length > max) {
      return { ok: false, error: productBranchLimitError(input.product, max) };
    }

    if (uniqueIds.length > 0) {
      const { data: owned } = await supabase
        .from("branches")
        .select("id")
        .eq("merchant_id", ctx.id)
        .in("id", uniqueIds);
      if ((owned ?? []).length !== uniqueIds.length) {
        return { ok: false, error: "One or more branches were not found." };
      }
    }

    // One row per branch — upsert rejects the same conflict target twice.
    const { data: existing } = await supabase
      .from("product_branch_assignments")
      .select("branch_id")
      .eq("merchant_id", ctx.id)
      .eq("product", input.product);

    const byBranch = new Map<string, "active" | "inactive">();
    for (const row of existing ?? []) {
      byBranch.set(row.branch_id as string, "inactive");
    }
    for (const branchId of uniqueIds) {
      byBranch.set(branchId, "active");
    }

    const rows = [...byBranch.entries()].map(([branchId, status]) => ({
      merchant_id: ctx.id,
      product: input.product,
      branch_id: branchId,
      status,
    }));

    if (rows.length === 0) return { ok: true };

    const { error } = await supabase
      .from("product_branch_assignments")
      .upsert(rows, { onConflict: "merchant_id,product,branch_id" });
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not save branch selection.",
    };
  }
}

async function loadEntitlementsForMerchant(merchantId: string): Promise<Entitlements> {
  const admin = createAdminClient();
  const { data: productRows } = await admin
    .from("merchant_products")
    .select(
      "product, plan_id, status, onboarded_at, trial_started_at, trial_ends_at",
    )
    .eq("merchant_id", merchantId);
  return entitlementsFromRows(productRows ?? []);
}

async function activateBranchForProduct(
  supabase: Awaited<ReturnType<typeof createClient>>,
  merchantId: string,
  product: MerchantProduct,
  branchId: string,
): Promise<{ ok: boolean; error?: string; warning?: string }> {
  const entitlements = await loadEntitlementsForMerchant(merchantId);
  const max = maxActiveBranches(product, entitlements);

  const { data: assignmentRows } = await supabase
    .from("product_branch_assignments")
    .select("product, branch_id, status")
    .eq("merchant_id", merchantId)
    .eq("product", product);

  const map = buildProductBranchMap(
    (assignmentRows ?? []).map((row) => ({
      product: row.product as MerchantProduct,
      branchId: row.branch_id,
      status: row.status,
    })),
  );
  const activeIds = map[product] ?? [];
  if (activeIds.includes(branchId)) return { ok: true };
  if (activeIds.length >= max) {
    return {
      ok: false,
      error: productBranchLimitError(product, max),
      warning: branchCreatedUnassignedMessage(max),
    };
  }

  const { error } = await supabase.from("product_branch_assignments").upsert(
    {
      merchant_id: merchantId,
      product,
      branch_id: branchId,
      status: "active",
    },
    { onConflict: "merchant_id,product,branch_id" },
  );
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function updateBranch(
  branchId: string,
  patch: Partial<BranchContact> & { name?: string },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated." };

    const ctx = await currentMerchant(supabase, user.id);
    if (!ctx) return { ok: false, error: "Merchant account not found." };

    // Renaming a branch is an owner action; contact details stay editable by
    // any member, matching how these fields behaved on the merchant record.
    const { name, ...contact } = patch;
    if (name !== undefined && !canManageBranches(ctx.role)) {
      return { ok: false, error: "You can't manage branches." };
    }

    const row: Partial<BranchRow> = toBranchRowPatch(contact);
    if (name !== undefined) {
      if (!name.trim()) return { ok: false, error: "Branch name is required." };
      row.name = name.trim();
    }
    if (Object.keys(row).length === 0) return { ok: true };

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

/** Queue hours + initial wait estimate — per branch; create copies from main. */
export async function updateBranchQueueSettings(
  branchId: string,
  patch: {
    queueOpenTime?: string;
    queueCloseTime?: string;
    queueHoursTimezone?: string;
    queueOpenDays?: number[];
    queueAutoStart?: boolean;
    queueAutoClose?: boolean;
    estimatedWaitMinutes?: number;
  },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated." };

    const ctx = await currentMerchant(supabase, user.id);
    if (!ctx) return { ok: false, error: "Merchant account not found." };

    const { data: branch } = await supabase
      .from("branches")
      .select("id, is_default")
      .eq("id", branchId)
      .eq("merchant_id", ctx.id)
      .maybeSingle();
    if (!branch) return { ok: false, error: "Branch not found." };

    const row: Partial<BranchRow> = {};
    if (patch.queueOpenTime !== undefined) row.queue_open_time = patch.queueOpenTime;
    if (patch.queueCloseTime !== undefined) row.queue_close_time = patch.queueCloseTime;
    if (patch.queueHoursTimezone !== undefined) {
      row.queue_hours_timezone = patch.queueHoursTimezone;
    }
    if (patch.queueOpenDays !== undefined) {
      row.queue_open_days = patch.queueOpenDays
        .map(Number)
        .filter((d) => Number.isFinite(d) && d >= 0 && d <= 6);
    }
    if (patch.queueAutoStart !== undefined) row.queue_auto_start = patch.queueAutoStart;
    if (patch.queueAutoClose !== undefined) row.queue_auto_close = patch.queueAutoClose;
    if (patch.estimatedWaitMinutes !== undefined) {
      const mins = Math.round(Number(patch.estimatedWaitMinutes));
      if (!Number.isFinite(mins) || mins < 1 || mins > 120) {
        return { ok: false, error: "Estimated wait must be between 1 and 120 minutes." };
      }
      row.estimated_wait_minutes = mins;
    }
    if (Object.keys(row).length === 0) return { ok: true };

    const { error } = await supabase
      .from("branches")
      .update(row)
      .eq("id", branchId)
      .eq("merchant_id", ctx.id);
    if (error) return { ok: false, error: error.message };

    // Keep merchant-level hours in sync with the main branch so older
    // merchant-scoped readers (and onboarding defaults) stay coherent.
    if (branch.is_default) {
      const merchantPatch: Partial<MerchantRow> = {};
      if (row.queue_open_time !== undefined) merchantPatch.queue_open_time = row.queue_open_time;
      if (row.queue_close_time !== undefined) merchantPatch.queue_close_time = row.queue_close_time;
      if (row.queue_hours_timezone !== undefined) {
        merchantPatch.queue_hours_timezone = row.queue_hours_timezone;
      }
      if (row.queue_open_days !== undefined) merchantPatch.queue_open_days = row.queue_open_days;
      if (row.queue_auto_start !== undefined) merchantPatch.queue_auto_start = row.queue_auto_start;
      if (row.queue_auto_close !== undefined) merchantPatch.queue_auto_close = row.queue_auto_close;
      if (Object.keys(merchantPatch).length > 0) {
        await supabase.from("merchants").update(merchantPatch).eq("id", ctx.id);
      }
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not update queue settings.",
    };
  }
}

/** Persist the onboarding wait estimate onto the main branch (DB source of truth). */
export async function updateMainBranchEstimatedWait(
  minutes: number,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated." };

    const ctx = await currentMerchant(supabase, user.id);
    if (!ctx) return { ok: false, error: "Merchant account not found." };

    const mins = Math.round(Number(minutes));
    if (!Number.isFinite(mins) || mins < 1 || mins > 120) {
      return { ok: false, error: "Estimated wait must be between 1 and 120 minutes." };
    }

    const { error } = await supabase
      .from("branches")
      .update({ estimated_wait_minutes: mins })
      .eq("merchant_id", ctx.id)
      .eq("is_default", true);
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not update estimated wait.",
    };
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
  productIds?: MerchantProduct[];
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
    if (!ASSIGNABLE_ROLES.includes(input.role)) {
      return { ok: false, error: "Choose owner, manager, or staff." };
    }
    const inviteRole = input.role;
    // Owners always get all-branch / all-product access.
    const branchIds = inviteRole === "owner" ? [] : (input.branchIds ?? []);
    const productIds =
      inviteRole === "owner" ? [] : normalizeMemberProductIds(input.productIds);

    const { data: merchantMeta } = await supabase
      .from("merchants")
      .select("business_name")
      .eq("id", ctx.id)
      .maybeSingle();
    const businessName = merchantMeta?.business_name?.trim() || "your store";

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
        role: inviteRole,
        branch_id: branchIds[0] ?? null,
        branch_ids: branchIds,
        product_ids: productIds,
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
  captchaToken?: string;
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

    const captcha = await verifyTurnstileToken(input.captchaToken, {
      source: "team-invite",
    });
    if (!captcha.ok) return { ok: false, error: captcha.error };

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

    // Sign them into the dashboard. Siteverify already spent the Turnstile token.
    const supabase = await createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: member.email,
      password: input.password,
    });
    if (signInError) {
      return {
        ok: false,
        error: isCaptchaAuthError(signInError.message)
          ? TURNSTILE_REJECTED_MESSAGE
          : "Account created — sign in with your email and password to continue.",
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
  productIds?: MerchantProduct[],
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
    if (!ASSIGNABLE_ROLES.includes(role)) {
      return { ok: false, error: "Choose owner, manager, or staff." };
    }

    const { data: merchant } = await supabase
      .from("merchants")
      .select("owner_user_id, business_name")
      .eq("id", ctx.id)
      .maybeSingle();

    const { data: target } = await supabase
      .from("merchant_members")
      .select("id, user_id, role, email, name, branch_ids, product_ids")
      .eq("id", memberId)
      .eq("merchant_id", ctx.id)
      .maybeSingle();
    if (!target) return { ok: false, error: "Member not found." };
    if (merchant?.owner_user_id && target.user_id === merchant.owner_user_id) {
      return { ok: false, error: "You can't change the primary account owner's role." };
    }

    // Owners always get all-branch / all-product access.
    const ids = role === "owner" ? [] : (branchIds ?? []);
    const products = role === "owner" ? [] : normalizeMemberProductIds(productIds);
    const { error } = await supabase
      .from("merchant_members")
      .update({
        role,
        branch_id: ids[0] ?? null,
        branch_ids: ids,
        product_ids: products,
      })
      .eq("id", memberId)
      .eq("merchant_id", ctx.id);
    if (error) return { ok: false, error: error.message };

    const notifyEmail = target.email?.trim();
    if (notifyEmail) {
      const prevRole = normalizeMemberRole(target.role);
      const prevBranches = target.branch_ids ?? [];
      const prevProducts = normalizeMemberProductIds(target.product_ids);
      const changes: Array<{ label: string; from: string; to: string }> = [];

      if (prevRole !== role) {
        changes.push({
          label: "Role",
          from: ROLE_LABELS[prevRole],
          to: ROLE_LABELS[role],
        });
      }

      const sameSorted = (a: string[], b: string[]) => {
        if (a.length !== b.length) return false;
        const left = [...a].sort();
        const right = [...b].sort();
        return left.every((value, index) => value === right[index]);
      };

      if (!sameSorted(prevBranches, ids)) {
        const allBranchIds = [...new Set([...prevBranches, ...ids])];
        const nameById = new Map<string, string>();
        if (allBranchIds.length > 0) {
          const { data: branchRows } = await supabase
            .from("branches")
            .select("id, name")
            .eq("merchant_id", ctx.id)
            .in("id", allBranchIds);
          for (const row of branchRows ?? []) nameById.set(row.id, row.name);
        }
        const labelBranches = (list: string[]) =>
          list.length === 0
            ? "All branches"
            : list.map((id) => nameById.get(id) ?? "Branch").join(", ");
        changes.push({
          label: "Branches",
          from: labelBranches(prevBranches),
          to: labelBranches(ids),
        });
      }

      if (!sameSorted(prevProducts, products)) {
        const PRODUCT_LABELS: Record<MerchantProduct, string> = {
          loyalty: "Loyalty Stamps",
          queue: "Smart Queue",
          reservation: "Reservations",
          menu: "AI Menu",
        };
        const labelProducts = (list: MerchantProduct[]) =>
          list.length === 0
            ? "All products"
            : list.map((id) => PRODUCT_LABELS[id]).join(", ");
        changes.push({
          label: "Product access",
          from: labelProducts(prevProducts),
          to: labelProducts(products),
        });
      }

      if (changes.length > 0) {
        try {
          await sendTeamAccessChangedEmail({
            to: notifyEmail,
            businessName: merchant?.business_name?.trim() || "your store",
            changes,
            dashboardUrl: `${getPublicAppOrigin()}/merchant`,
            name: target.name?.trim() || undefined,
          });
        } catch {
          /* non-fatal: access already updated */
        }
      }
    }

    return { ok: true };
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

    const { data: merchant } = await supabase
      .from("merchants")
      .select("owner_user_id")
      .eq("id", ctx.id)
      .maybeSingle();

    const { data: target } = await supabase
      .from("merchant_members")
      .select("id, user_id")
      .eq("id", memberId)
      .eq("merchant_id", ctx.id)
      .maybeSingle();
    if (!target) return { ok: false, error: "Member not found." };
    if (merchant?.owner_user_id && target.user_id === merchant.owner_user_id) {
      return { ok: false, error: "You can't remove the primary account owner." };
    }

    const { error } = await supabase
      .from("merchant_members")
      .delete()
      .eq("id", memberId)
      .eq("merchant_id", ctx.id);
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not remove member." };
  }
}

/** Mark the signed-in user's merchant in-app notifications as read (notification centre). */
export async function markInAppNotificationsRead(
  notificationIds?: string[],
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated." };

    const merchantId = await resolveMerchantId(supabase, user.id);
    if (!merchantId) return { ok: false, error: "Merchant account not found." };

    let query = supabase
      .from("merchant_in_app_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("merchant_id", merchantId)
      .eq("user_id", user.id)
      .is("read_at", null);

    if (notificationIds && notificationIds.length > 0) {
      query = query.in("id", notificationIds);
    }

    const { error } = await query;
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not update notifications.",
    };
  }
}
