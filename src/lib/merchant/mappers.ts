import type {
  BranchRow,
  CustomerOverviewRow,
  MerchantMemberRow,
  MerchantRow,
} from "@/lib/supabase/database.types";
import type { Branch, MerchantCustomer, MerchantMember, MerchantProfile } from "./types";
import {
  DEFAULT_QUEUE_STORE_HOURS,
  formatTimeForInput,
  QUEUE_HOURS_TIMEZONE,
} from "./queue-hours";
import { DEFAULT_RESERVATION_SETTINGS } from "./reservations";

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Profile fields only — short_name / created_at are unused on the read path. */
export type MerchantProfileSource = Omit<MerchantRow, "short_name" | "created_at">;

function normalizeOpenDays(raw: number[] | null | undefined): number[] {
  if (!Array.isArray(raw) || raw.length === 0) return [...DEFAULT_QUEUE_STORE_HOURS.openDays];
  const cleaned = [...new Set(raw.map((d) => Number(d)).filter((d) => d >= 0 && d <= 6))];
  return cleaned.length > 0 ? cleaned : [...DEFAULT_QUEUE_STORE_HOURS.openDays];
}

export function toMerchantProfile(row: MerchantProfileSource): MerchantProfile {
  return {
    id: row.id,
    slug: row.slug,
    businessName: row.business_name,
    ownerFirstName: row.owner_first_name ?? "",
    ownerLastName: row.owner_last_name ?? "",
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
    rewardImageDataUrl: row.reward_image_url ?? undefined,
    totalStamps: row.total_stamps,
    avgOrderValue: Number(row.avg_order_value),
    restartAfterReward: row.restart_after_reward !== false,
    rewardCooldownValue: row.reward_cooldown_value ?? 0,
    rewardCooldownUnit: row.reward_cooldown_unit ?? "days",
    minPurchaseAmount: Number(row.min_purchase_amount ?? 0),
    stampNotifications: row.stamp_notifications,
    approvalNotifications: row.approval_notifications,
    marketingEmails: row.marketing_emails,
    queueBanner: row.queue_banner ?? "",
    queueBannerLink: row.queue_banner_link ?? "",
    queueOpenTime: formatTimeForInput(row.queue_open_time),
    queueCloseTime: formatTimeForInput(row.queue_close_time),
    queueHoursTimezone: row.queue_hours_timezone || QUEUE_HOURS_TIMEZONE,
    queueOpenDays: normalizeOpenDays(row.queue_open_days),
    queueAutoStart: row.queue_auto_start === true || row.queue_auto_close === true,
    queueAutoClose: row.queue_auto_start === true || row.queue_auto_close === true,
    reservationDescription: row.reservation_description ?? "",
    reservationMaxPartySize:
      row.reservation_max_party_size ?? DEFAULT_RESERVATION_SETTINGS.maxPartySize,
    reservationIntervalMinutes:
      row.reservation_interval_minutes ?? DEFAULT_RESERVATION_SETTINGS.intervalMinutes,
    reservationOpenTime: formatTimeForInput(
      row.reservation_open_time || DEFAULT_RESERVATION_SETTINGS.openTime,
    ),
    reservationCloseTime: formatTimeForInput(
      row.reservation_close_time || DEFAULT_RESERVATION_SETTINGS.closeTime,
    ),
    reservationAllowSameDay: row.reservation_allow_same_day !== false,
    reservationAllowNotes: row.reservation_allow_notes !== false,
    reservationAutoDeclineHours: row.reservation_auto_decline_hours ?? 0,
    reservationWhatsappEnabled: row.reservation_whatsapp_enabled !== false,
    reservationPaused: row.reservation_paused === true,
  };
}

// Maps a UI profile patch back to db column names for updates.
export function toMerchantRowPatch(patch: Partial<MerchantProfile>): Partial<MerchantRow> {
  const row: Partial<MerchantRow> = {};
  if (patch.businessName !== undefined) {
    row.business_name = patch.businessName;
    // short_name is a NOT NULL legacy column; keep it mirrored to business name.
    row.short_name = patch.businessName;
  }
  if (patch.ownerFirstName !== undefined) row.owner_first_name = patch.ownerFirstName || null;
  if (patch.ownerLastName !== undefined) row.owner_last_name = patch.ownerLastName || null;
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
  if (patch.rewardImageDataUrl !== undefined)
    row.reward_image_url = patch.rewardImageDataUrl ?? null;
  if (patch.totalStamps !== undefined) {
    row.total_stamps = Math.min(20, Math.max(5, Math.floor(patch.totalStamps) || 5));
  }
  if (patch.avgOrderValue !== undefined) row.avg_order_value = patch.avgOrderValue;
  if (patch.restartAfterReward !== undefined)
    row.restart_after_reward = patch.restartAfterReward;
  if (patch.rewardCooldownValue !== undefined)
    row.reward_cooldown_value = Math.max(0, Math.floor(patch.rewardCooldownValue));
  if (patch.rewardCooldownUnit !== undefined) row.reward_cooldown_unit = patch.rewardCooldownUnit;
  if (patch.minPurchaseAmount !== undefined)
    row.min_purchase_amount = Math.max(0, Number(patch.minPurchaseAmount) || 0);
  if (patch.stampNotifications !== undefined) row.stamp_notifications = patch.stampNotifications;
  if (patch.approvalNotifications !== undefined)
    row.approval_notifications = patch.approvalNotifications;
  if (patch.marketingEmails !== undefined) row.marketing_emails = patch.marketingEmails;
  if (patch.queueBanner !== undefined) row.queue_banner = patch.queueBanner || null;
  if (patch.queueBannerLink !== undefined)
    row.queue_banner_link = patch.queueBannerLink || null;
  if (patch.queueOpenTime !== undefined) row.queue_open_time = patch.queueOpenTime;
  if (patch.queueCloseTime !== undefined) row.queue_close_time = patch.queueCloseTime;
  if (patch.queueHoursTimezone !== undefined)
    row.queue_hours_timezone = patch.queueHoursTimezone;
  if (patch.queueOpenDays !== undefined) row.queue_open_days = normalizeOpenDays(patch.queueOpenDays);
  if (patch.queueAutoStart !== undefined) row.queue_auto_start = patch.queueAutoStart;
  if (patch.queueAutoClose !== undefined) row.queue_auto_close = patch.queueAutoClose;
  if (patch.reservationDescription !== undefined)
    row.reservation_description = patch.reservationDescription || null;
  if (patch.reservationMaxPartySize !== undefined)
    row.reservation_max_party_size = Math.min(
      50,
      Math.max(1, Math.floor(patch.reservationMaxPartySize) || 1),
    );
  if (patch.reservationIntervalMinutes !== undefined)
    row.reservation_interval_minutes = Math.min(
      120,
      Math.max(5, Math.floor(patch.reservationIntervalMinutes) || 30),
    );
  if (patch.reservationOpenTime !== undefined)
    row.reservation_open_time = patch.reservationOpenTime;
  if (patch.reservationCloseTime !== undefined)
    row.reservation_close_time = patch.reservationCloseTime;
  if (patch.reservationAllowSameDay !== undefined)
    row.reservation_allow_same_day = patch.reservationAllowSameDay;
  if (patch.reservationAllowNotes !== undefined)
    row.reservation_allow_notes = patch.reservationAllowNotes;
  if (patch.reservationAutoDeclineHours !== undefined)
    row.reservation_auto_decline_hours = Math.max(
      0,
      Math.floor(patch.reservationAutoDeclineHours) || 0,
    );
  if (patch.reservationWhatsappEnabled !== undefined)
    row.reservation_whatsapp_enabled = patch.reservationWhatsappEnabled;
  if (patch.reservationPaused !== undefined) row.reservation_paused = patch.reservationPaused;
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

export function toBranch(row: BranchRow): Branch {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    address: row.address ?? "",
    isDefault: row.is_default,
  };
}

export function toMember(row: MerchantMemberRow): MerchantMember {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name ?? "",
    email: row.email ?? "",
    role: row.role === "owner" ? "owner" : row.role === "manager" ? "manager" : "staff",
    branchIds:
      row.branch_ids && row.branch_ids.length > 0
        ? row.branch_ids
        : row.branch_id
          ? [row.branch_id]
          : [],
    joined: row.accepted_at !== null,
  };
}

export function toCustomer(row: CustomerOverviewRow): MerchantCustomer {
  return {
    id: row.id,
    branchId: row.branch_id,
    name: row.name,
    phone: row.phone,
    email: row.email ?? undefined,
    stamps: row.stamps,
    totalStamps: row.total_stamps,
    lifetimeVisits: Number(row.lifetime_visits),
    rewardsClaimed: Number(row.rewards_claimed ?? 0),
    status: row.status,
    banned: row.banned,
    lastVisit: relativeDay(row.last_visit),
    memberSince: monthYear(row.member_since),
  };
}
