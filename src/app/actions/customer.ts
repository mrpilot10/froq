"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCustomerPublicToken } from "@/lib/customer/hub";
import type { BusinessInfo, HistoryEntry, RewardCardGroup } from "@/lib/loyalty/types";
import type { MerchantRow } from "@/lib/supabase/database.types";

export interface CardData {
  customerId: string;
  filled: number;
  totalStamps: number;
  status: "active" | "reward_ready" | "claimed";
  pending: boolean;
  /** Random FROQ-XXXXX code the customer shows to redeem (only when ready). */
  rewardCode: string;
  /** Stamp-collection lock after a reward is redeemed. */
  cooldownUntil?: string | null;
  /** collecting | waiting (QR locked) | ready (QR redeemable). */
  rewardStatus?: "collecting" | "waiting" | "ready";
  /** Precomputed QR unlock time when a wait is configured. */
  rewardUnlockAt?: string | null;
}

export type CustomerHome =
  | { status: "unauthenticated"; slug: string; publicToken?: string }
  | { status: "no_membership"; slug: string }
  | { status: "not_found" }
  | { status: "forbidden"; slug: string }
  | {
      status: "ready";
      slug: string;
      publicToken: string;
      business: BusinessInfo;
      card: CardData;
      history: HistoryEntry[];
      rewardCards: RewardCardGroup[];
      totalStampsCollected: number;
      memberSince: string;
      customerName: string;
      customerPhone: string;
      customerEmail?: string;
      /** Hub modules currently available for this customer × business. */
      modules: {
        loyalty: boolean;
        waitingList: boolean;
        reservation: boolean;
      };
    };

export interface ShopMembershipCheck {
  isMember: boolean;
  isAuthenticated: boolean;
  /** Canonical phone of the signed-in user (digits, no '+'), when authenticated. */
  phone?: string;
  /** Name from any existing membership for this user, to pre-fill signup. */
  name?: string;
  /** Email from any existing membership for this user, to pre-fill signup. */
  email?: string;
  /** Permanent hub token when already a member of this shop. */
  publicToken?: string;
}

/** Ensures a stored link (often saved without a scheme) is an absolute URL. */
function toExternalUrl(raw?: string | null): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, "")}`;
}

function toBusinessInfo(m: MerchantRow): BusinessInfo {
  return {
    name: m.business_name,
    address: m.address ?? "",
    brandColor: m.brand_color,
    logoUrl: m.logo_url ?? null,
    rewardTitle: m.reward_title,
    rewardSubtitle: m.reward_name,
    rewardName: m.reward_name,
    rewardDescription: `Collect all ${m.total_stamps} stamps and redeem ${m.reward_name.toLowerCase()}.`,
    rewardImage: m.reward_image_url || "/reward-coffee.png",
    totalStamps: m.total_stamps,
    restartAfterReward: m.restart_after_reward !== false,
    socialLinks: {
      instagram: toExternalUrl(m.instagram_url),
      facebook: toExternalUrl(m.facebook_url),
      website: toExternalUrl(m.website_url),
      googleReviews: toExternalUrl(m.google_business_url),
    },
  };
}

function monthYear(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type CustomerCore = {
  id: string;
  user_id: string | null;
  name: string;
  phone: string;
  email: string | null;
  member_since: string;
  public_token: string;
  merchant_id: string;
};

async function buildReadyHome(
  merchant: MerchantRow,
  customer: CustomerCore,
): Promise<Extract<CustomerHome, { status: "ready" }>> {
  const supabase = await createClient();

  const [cardRes, approvalsRes, redemptionsRes, visitsRes] = await Promise.all([
    supabase
      .from("loyalty_cards")
      .select(
        "stamps, status, reward_code, cooldown_until, reward_status, reward_unlock_at",
      )
      .eq("customer_id", customer.id)
      .maybeSingle(),
    supabase
      .from("approvals")
      .select("id, status, requested_at")
      .eq("customer_id", customer.id)
      .order("requested_at", { ascending: false })
      .limit(20),
    supabase
      .from("redemptions")
      .select("id, redeemed_at")
      .eq("customer_id", customer.id)
      .order("redeemed_at", { ascending: false })
      .limit(20),
    supabase
      .from("visits")
      .select("*", { count: "exact", head: true })
      .eq("customer_id", customer.id),
  ]);

  const card = cardRes.data;
  const approvals = approvalsRes.data ?? [];
  const redemptions = redemptionsRes.data ?? [];
  const pending = approvals.some((a) => a.status === "pending");
  const filled = card?.stamps ?? 0;
  const totalStamps = merchant.total_stamps;
  const rewardReady = (card?.status ?? "active") === "reward_ready";
  const hasLoyaltyCard = !!card;

  const completedCards: RewardCardGroup[] = redemptions.map((r, i) => ({
    id: r.id,
    index: redemptions.length - i,
    status: "completed",
    stampsCollected: totalStamps,
    totalStamps,
    rewardName: merchant.reward_name,
    redeemedDate: shortDate(r.redeemed_at),
  }));

  const currentCard: RewardCardGroup = {
    id: "current",
    index: redemptions.length + 1,
    status: "active",
    stampsCollected: filled,
    totalStamps,
    rewardName: merchant.reward_name,
    pending,
    rewardReady,
  };

  const rewardCards: RewardCardGroup[] = [currentCard, ...completedCards];

  const history: HistoryEntry[] = [
    ...approvals
      .filter((a) => a.status === "pending" || a.status === "approved")
      .map((a) => ({
        id: a.id,
        date: a.status === "pending" ? "Today" : shortDate(a.requested_at),
        label: a.status === "pending" ? "Stamp request submitted" : "Stamp collected",
        status: a.status === "pending" ? ("pending" as const) : ("approved" as const),
      })),
    ...redemptions.map((r) => ({
      id: r.id,
      date: shortDate(r.redeemed_at),
      label: `${merchant.reward_name} redeemed`,
      status: "redeemed" as const,
    })),
  ].sort((a, b) => (a.status === "pending" ? -1 : b.status === "pending" ? 1 : 0));

  return {
    status: "ready",
    slug: merchant.slug,
    publicToken: customer.public_token,
    business: toBusinessInfo(merchant),
    card: {
      customerId: customer.id,
      filled,
      totalStamps,
      status: card?.status ?? "active",
      pending,
      rewardCode:
        card?.reward_code ?? `FROQ-${customer.id.slice(0, 5).toUpperCase()}`,
      cooldownUntil: card?.cooldown_until ?? null,
      rewardStatus: card?.reward_status ?? "collecting",
      rewardUnlockAt: card?.reward_unlock_at ?? null,
    },
    history,
    rewardCards,
    totalStampsCollected: visitsRes.count ?? 0,
    memberSince: monthYear(customer.member_since),
    customerName: customer.name,
    customerPhone: customer.phone,
    customerEmail: customer.email ?? undefined,
    modules: {
      loyalty: hasLoyaltyCard,
      // Future: wire when waiting list / reservation tables exist for this customer.
      waitingList: false,
      reservation: false,
    },
  };
}

async function loadCustomerHomeBySlug(slug: string): Promise<CustomerHome> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthenticated", slug };

  const { data: merchant } = await supabase.from("merchants").select("*").eq("slug", slug).maybeSingle();
  if (!merchant) return { status: "no_membership", slug };

  const { data: customer } = await supabase
    .from("customers")
    .select("id, name, phone, email, member_since, public_token, user_id, merchant_id")
    .eq("merchant_id", merchant.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!customer) return { status: "no_membership", slug };

  return buildReadyHome(merchant as MerchantRow, customer);
}

/**
 * Resolve the customer hub by permanent public token (`frq_…`).
 * Legacy: if the path segment is a merchant slug, redirect members to their token hub.
 */
export async function getCustomerHub(token: string): Promise<CustomerHome> {
  try {
    const decoded = decodeURIComponent(token).trim();
    if (!decoded) return { status: "not_found" };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const admin = createAdminClient();

    let customer: CustomerCore | null = null;

    if (isCustomerPublicToken(decoded)) {
      const { data } = await admin
        .from("customers")
        .select("id, user_id, name, phone, email, member_since, public_token, merchant_id")
        .eq("public_token", decoded)
        .maybeSingle();
      customer = data;
    } else {
      // Transition: old WhatsApp links used merchant slug as /c/{slug}.
      const { data: merchantBySlug } = await admin
        .from("merchants")
        .select("id, slug")
        .eq("slug", decoded)
        .maybeSingle();
      if (!merchantBySlug) return { status: "not_found" };
      if (!user) return { status: "unauthenticated", slug: merchantBySlug.slug };

      const { data } = await admin
        .from("customers")
        .select("id, user_id, name, phone, email, member_since, public_token, merchant_id")
        .eq("merchant_id", merchantBySlug.id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!data) return { status: "no_membership", slug: merchantBySlug.slug };
      customer = data;
    }

    if (!customer) return { status: "not_found" };

    const { data: merchant } = await admin
      .from("merchants")
      .select("*")
      .eq("id", customer.merchant_id)
      .maybeSingle();
    if (!merchant) return { status: "not_found" };

    if (!user) {
      return {
        status: "unauthenticated",
        slug: merchant.slug,
        publicToken: customer.public_token,
      };
    }
    if (customer.user_id !== user.id) {
      return { status: "forbidden", slug: merchant.slug };
    }

    return buildReadyHome(merchant as MerchantRow, customer);
  } catch {
    return { status: "not_found" };
  }
}

export async function getCustomerHome(slug: string): Promise<CustomerHome> {
  try {
    return await loadCustomerHomeBySlug(slug);
  } catch {
    return { status: "unauthenticated", slug };
  }
}

export async function checkShopMembership(slug: string): Promise<ShopMembershipCheck> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { isMember: false, isAuthenticated: false };

    const phone = user.phone || undefined;

    const { data: merchant } = await supabase.from("merchants").select("id").eq("slug", slug).maybeSingle();
    if (!merchant) return { isMember: false, isAuthenticated: true, phone };

    const { data: customer } = await supabase
      .from("customers")
      .select("id, public_token")
      .eq("merchant_id", merchant.id)
      .eq("user_id", user.id)
      .maybeSingle();

    // Reuse name/email from any prior membership so a logged-in customer can
    // join a new shop without re-entering details (and without a new OTP/SMS).
    const { data: priorProfile } = await supabase
      .from("customers")
      .select("name, email")
      .eq("user_id", user.id)
      .order("member_since", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      isMember: !!customer,
      isAuthenticated: true,
      phone,
      name: priorProfile?.name || undefined,
      email: priorProfile?.email || undefined,
      publicToken: customer?.public_token || undefined,
    };
  } catch {
    return { isMember: false, isAuthenticated: false };
  }
}

export async function joinMerchant(
  slug: string,
  name: string,
  phone: string,
  email?: string,
  branchSlug?: string | null,
): Promise<{ ok: boolean; publicToken?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: customerId, error } = await supabase.rpc("join_merchant", {
    p_slug: slug,
    p_name: name,
    p_phone: phone,
    p_email: email?.trim() || null,
    p_branch: branchSlug?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };

  // Copy WhatsApp prefs from auth metadata (set when OTP was verified via WA).
  if (user?.id && customerId) {
    const { applyNotificationPrefsFromAuth } = await import("@/lib/notifications/prefs");
    await applyNotificationPrefsFromAuth({ customerId, userId: user.id });
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("public_token")
    .eq("id", customerId)
    .maybeSingle();

  return { ok: true, publicToken: customer?.public_token || undefined };
}

export async function requestStamp(customerId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_stamp", { p_customer_id: customerId });
  if (error) return { ok: false, error: error.message };

  // Notify the merchant. Await delivery so the push isn't dropped when the
  // serverless function exits (after() is unreliable for web push on Vercel).
  try {
    const { data: customer } = await supabase
      .from("customers")
      .select("name, merchant_id")
      .eq("id", customerId)
      .maybeSingle();
    if (customer) {
      const { sendPushToMerchant } = await import("@/lib/push/server");
      await sendPushToMerchant(customer.merchant_id, {
        title: "New stamp request",
        body: `${customer.name} is waiting for you to approve a stamp.`,
        url: "/merchant?tab=approvals",
        tag: "froq-approval",
      });
    }
  } catch {
    // Never let notification failures affect the stamp request.
  }

  return { ok: true };
}

export async function deleteCustomerAccount(
  customerId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated." };

    const { data: customer } = await supabase
      .from("customers")
      .select("id")
      .eq("id", customerId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!customer) return { ok: false, error: "Membership not found." };

    const { error } = await supabase.from("customers").delete().eq("id", customerId);
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not delete your account.",
    };
  }
}
