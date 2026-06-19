import type { CustomerOverviewRow, MerchantRow } from "@/lib/supabase/database.types";
import type { MerchantCustomer, MerchantProfile } from "./types";

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function toMerchantProfile(row: MerchantRow): MerchantProfile {
  return {
    id: row.id,
    slug: row.slug,
    businessName: row.business_name,
    shortName: row.short_name,
    email: row.email ?? "",
    phone: row.phone ?? "",
    address: row.address ?? "",
    brandColor: row.brand_color,
    logoDataUrl: row.logo_url ?? undefined,
    websiteUrl: row.website_url ?? "",
    googleBusinessUrl: row.google_business_url ?? "",
    instagramUrl: row.instagram_url ?? "",
    facebookUrl: row.facebook_url ?? "",
    xUrl: row.x_url ?? "",
    rewardTitle: row.reward_title,
    rewardName: row.reward_name,
    totalStamps: row.total_stamps,
    avgOrderValue: Number(row.avg_order_value),
    stampNotifications: row.stamp_notifications,
    approvalNotifications: row.approval_notifications,
    marketingEmails: row.marketing_emails,
  };
}

// Maps a UI profile patch back to db column names for updates.
export function toMerchantRowPatch(patch: Partial<MerchantProfile>): Partial<MerchantRow> {
  const row: Partial<MerchantRow> = {};
  if (patch.businessName !== undefined) row.business_name = patch.businessName;
  if (patch.shortName !== undefined) row.short_name = patch.shortName;
  if (patch.email !== undefined) row.email = patch.email;
  if (patch.phone !== undefined) row.phone = patch.phone;
  if (patch.address !== undefined) row.address = patch.address;
  if (patch.brandColor !== undefined) row.brand_color = patch.brandColor;
  if (patch.logoDataUrl !== undefined) row.logo_url = patch.logoDataUrl ?? null;
  if (patch.websiteUrl !== undefined) row.website_url = patch.websiteUrl;
  if (patch.googleBusinessUrl !== undefined) row.google_business_url = patch.googleBusinessUrl;
  if (patch.instagramUrl !== undefined) row.instagram_url = patch.instagramUrl;
  if (patch.facebookUrl !== undefined) row.facebook_url = patch.facebookUrl;
  if (patch.xUrl !== undefined) row.x_url = patch.xUrl;
  if (patch.rewardTitle !== undefined) row.reward_title = patch.rewardTitle;
  if (patch.rewardName !== undefined) row.reward_name = patch.rewardName;
  if (patch.totalStamps !== undefined) row.total_stamps = patch.totalStamps;
  if (patch.avgOrderValue !== undefined) row.avg_order_value = patch.avgOrderValue;
  if (patch.stampNotifications !== undefined) row.stamp_notifications = patch.stampNotifications;
  if (patch.approvalNotifications !== undefined)
    row.approval_notifications = patch.approvalNotifications;
  if (patch.marketingEmails !== undefined) row.marketing_emails = patch.marketingEmails;
  return row;
}

function monthYear(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function relativeDay(iso: string | null) {
  if (!iso) return "No visits yet";
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function toCustomer(row: CustomerOverviewRow): MerchantCustomer {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email ?? undefined,
    stamps: row.stamps,
    totalStamps: row.total_stamps,
    lifetimeVisits: Number(row.lifetime_visits),
    status: row.status,
    banned: row.banned,
    lastVisit: relativeDay(row.last_visit),
    memberSince: monthYear(row.member_since),
  };
}
