"use server";

import { createClient } from "@/lib/supabase/server";
import type { BusinessInfo, HistoryEntry } from "@/lib/loyalty/types";
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
      memberSince: string;
      customerName: string;
      customerPhone: string;
      customerEmail?: string;
    };

export interface ShopMembershipCheck {
  isMember: boolean;
  isAuthenticated: boolean;
}

function toBusinessInfo(m: MerchantRow): BusinessInfo {
  return {
    name: m.business_name,
    shortName: m.short_name,
    address: m.address ?? "",
    rewardTitle: m.reward_title,
    rewardSubtitle: m.reward_name,
    rewardName: m.reward_name,
    rewardDescription: `Collect all ${m.total_stamps} stamps and redeem ${m.reward_name.toLowerCase()}.`,
    rewardImage: "/reward-coffee.png",
    totalStamps: m.total_stamps,
    socialLinks: {
      instagram: m.instagram_url || undefined,
      facebook: m.facebook_url || undefined,
      website: m.website_url || undefined,
      googleReviews: m.google_business_url || undefined,
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

    const { data: merchant } = await supabase.from("merchants").select("id").eq("slug", slug).maybeSingle();
    if (!merchant) return { isMember: false, isAuthenticated: true };

    const { data: customer } = await supabase
      .from("customers")
      .select("id")
      .eq("merchant_id", merchant.id)
      .eq("user_id", user.id)
      .maybeSingle();

    return { isMember: !!customer, isAuthenticated: true };
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
  const pending = approvals.some((a) => a.status === "pending");

  const history: HistoryEntry[] = [
    ...approvals
      .filter((a) => a.status === "pending" || a.status === "approved")
      .map((a) => ({
        id: a.id,
        date: a.status === "pending" ? "Today" : shortDate(a.requested_at),
        label: a.status === "pending" ? "Stamp request submitted" : "Stamp collected",
        status: a.status === "pending" ? ("pending" as const) : ("approved" as const),
      })),
    ...(redemptionsRes.data ?? []).map((r) => ({
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
      filled: card?.stamps ?? 0,
      totalStamps: merchant.total_stamps,
      status: card?.status ?? "active",
      pending,
    },
    history,
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
  return error ? { ok: false, error: error.message } : { ok: true };
}
