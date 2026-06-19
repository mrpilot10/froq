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

export interface CustomerMembership {
  customerId: string;
  slug: string;
  name: string;
}

export type CustomerHome =
  | { status: "unauthenticated" }
  | { status: "no_membership" }
  | {
      status: "ready";
      business: BusinessInfo;
      card: CardData;
      history: HistoryEntry[];
      memberSince: string;
      customerName: string;
      customerPhone: string;
      customerEmail?: string;
      memberships: CustomerMembership[];
    };

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

export async function getCustomerHome(activeSlug?: string): Promise<CustomerHome> {
  try {
    return await loadCustomerHome(activeSlug);
  } catch {
    return { status: "unauthenticated" };
  }
}

async function loadCustomerHome(activeSlug?: string): Promise<CustomerHome> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthenticated" };

  const { data: rows } = await supabase
    .from("customers")
    .select("id, name, phone, email, member_since, created_at, merchant_id, merchants(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const memberships = rows ?? [];
  if (memberships.length === 0) return { status: "no_membership" };

  const active =
    (activeSlug &&
      memberships.find((r) => {
        const m = Array.isArray(r.merchants) ? r.merchants[0] : r.merchants;
        return m?.slug === activeSlug;
      })) ||
    memberships[0];

  const merchant = (Array.isArray(active.merchants) ? active.merchants[0] : active.merchants) as
    | MerchantRow
    | undefined;
  if (!merchant) return { status: "no_membership" };

  const [cardRes, approvalsRes, redemptionsRes] = await Promise.all([
    supabase.from("loyalty_cards").select("stamps, status").eq("customer_id", active.id).maybeSingle(),
    supabase
      .from("approvals")
      .select("id, status, requested_at")
      .eq("customer_id", active.id)
      .order("requested_at", { ascending: false })
      .limit(20),
    supabase
      .from("redemptions")
      .select("id, redeemed_at")
      .eq("customer_id", active.id)
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
    business: toBusinessInfo(merchant),
    card: {
      customerId: active.id,
      filled: card?.stamps ?? 0,
      totalStamps: merchant.total_stamps,
      status: card?.status ?? "active",
      pending,
    },
    history,
    memberSince: monthYear(active.member_since),
    customerName: active.name,
    customerPhone: active.phone,
    customerEmail: active.email ?? undefined,
    memberships: memberships.map((r) => {
      const m = Array.isArray(r.merchants) ? r.merchants[0] : r.merchants;
      return { customerId: r.id, slug: m?.slug ?? "", name: m?.business_name ?? "Shop" };
    }),
  };
}

export async function joinMerchant(
  slug: string,
  name: string,
  phone: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("join_merchant", {
    p_slug: slug,
    p_name: name,
    p_phone: phone,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function requestStamp(customerId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_stamp", { p_customer_id: customerId });
  return error ? { ok: false, error: error.message } : { ok: true };
}
