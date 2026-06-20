"use server";

import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { BusinessInfo, HistoryEntry, RewardCardGroup } from "@/lib/loyalty/types";
import type { MerchantRow } from "@/lib/supabase/database.types";

export interface CardData {
  customerId: string;
  filled: number;
  totalStamps: number;
  status: "active" | "reward_ready" | "claimed";
  pending: boolean;
}


export type CustomerHome =
  | { status: "unauthenticated"; slug: string }
  | { status: "no_membership"; slug: string }
  | {
      status: "ready";
      slug: string;
      business: BusinessInfo;
      card: CardData;
      history: HistoryEntry[];
      rewardCards: RewardCardGroup[];
      memberSince: string;
      customerName: string;
      customerPhone: string;
      customerEmail?: string;
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

export async function getCustomerHome(slug: string): Promise<CustomerHome> {
  try {
    return await loadCustomerHome(slug);
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
      .select("id")
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
    };
  } catch {
    return { isMember: false, isAuthenticated: false };
  }
}

async function loadCustomerHome(slug: string): Promise<CustomerHome> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthenticated", slug };

  const { data: merchant } = await supabase.from("merchants").select("*").eq("slug", slug).maybeSingle();
  if (!merchant) return { status: "no_membership", slug };

  const { data: customer } = await supabase
    .from("customers")
    .select("id, name, phone, email, member_since")
    .eq("merchant_id", merchant.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!customer) return { status: "no_membership", slug };

  const [cardRes, approvalsRes, redemptionsRes] = await Promise.all([
    supabase.from("loyalty_cards").select("stamps, status").eq("customer_id", customer.id).maybeSingle(),
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
  ]);

  const card = cardRes.data;
  const approvals = approvalsRes.data ?? [];
  const redemptions = redemptionsRes.data ?? [];
  const pending = approvals.some((a) => a.status === "pending");
  const filled = card?.stamps ?? 0;
  const totalStamps = merchant.total_stamps;
  const rewardReady = (card?.status ?? "active") === "reward_ready";

  // Group activity into discrete loyalty cards. Each redemption closes a card;
  // the still-open card is the latest. Shown newest-first (highest number).
  const completedCards: RewardCardGroup[] = redemptions.map((r, i) => ({
    id: r.id,
    index: redemptions.length - i, // redemptions are newest-first
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
    slug,
    business: toBusinessInfo(merchant as MerchantRow),
    card: {
      customerId: customer.id,
      filled,
      totalStamps,
      status: card?.status ?? "active",
      pending,
    },
    history,
    rewardCards,
    memberSince: monthYear(customer.member_since),
    customerName: customer.name,
    customerPhone: customer.phone,
    customerEmail: customer.email ?? undefined,
  };
}

export async function joinMerchant(
  slug: string,
  name: string,
  phone: string,
  email?: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("join_merchant", {
    p_slug: slug,
    p_name: name,
    p_phone: phone,
    p_email: email?.trim() || null,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function requestStamp(customerId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_stamp", { p_customer_id: customerId });
  if (error) return { ok: false, error: error.message };

  // Notify the merchant (best-effort, off the response path).
  after(async () => {
    try {
      const { data: customer } = await supabase
        .from("customers")
        .select("name, merchant_id")
        .eq("id", customerId)
        .maybeSingle();
      if (!customer) return;

      const { sendPushToMerchant } = await import("@/lib/push/server");
      await sendPushToMerchant(customer.merchant_id, {
        title: "New stamp request",
        body: `${customer.name} is waiting for you to approve a stamp.`,
        url: "/merchant",
        tag: "froq-approval",
      });
    } catch {
      // Never let notification failures affect the stamp request.
    }
  });

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
