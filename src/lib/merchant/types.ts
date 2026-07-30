import type { RewardCooldownUnit } from "@/lib/loyalty/rules";

export type MerchantProduct = "loyalty" | "queue" | "reservation";

export type MemberRole = "owner" | "manager" | "staff";

export interface Branch {
  id: string;
  name: string;
  slug: string;
  address: string;
  isDefault: boolean;
}

export interface MerchantMember {
  id: string;
  userId: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  role: MemberRole;
  /** empty = access to all branches. */
  branchIds: string[];
  /** empty = access to all products. */
  productIds: MerchantProduct[];
  /** false = invited but hasn't logged in yet. */
  joined: boolean;
  /** True for the account owner on merchants.owner_user_id (can't demote/remove). */
  isPrimaryOwner?: boolean;
}

/** Loyalty product-scoped tabs. */
export type LoyaltyTab =
  | "dashboard"
  | "loyalty-history"
  | "scan"
  | "approvals"
  | "loyalty-customers"
  | "loyalty-settings";

/** Queue product-scoped tabs. */
export type QueueTab =
  | "queue-home"
  | "queue-customers"
  | "queue-history"
  | "queue-settings";

/** Reservations product-scoped tabs. */
export type ReservationTab =
  | "reservations-home"
  | "reservations-history"
  | "reservations-settings";

/** Workspace tabs shared across every product. */
export type WorkspaceTab = "customers" | "analytics" | "profile";

/** Every routable tab in the merchant app. */
export type MerchantTab = LoyaltyTab | QueueTab | ReservationTab | WorkspaceTab;

export type MerchantEditSection =
  | "business"
  | "links"
  | "loyalty"
  | "notifications"
  | "account"
  | null;

export interface MerchantProfile {
  id?: string;
  slug?: string;
  businessName: string;
  ownerFirstName: string;
  ownerLastName: string;
  email: string;
  phone: string;
  address: string;
  brandColor: string;
  logoDataUrl?: string;
  websiteUrl: string;
  googleBusinessUrl: string;
  instagramUrl: string;
  facebookUrl: string;
  xUrl: string;
  rewardTitle: string;
  rewardName: string;
  rewardImageDataUrl?: string;
  totalStamps: number;
  /** Default true. Not shown in onboarding. */
  restartAfterReward: boolean;
  rewardCooldownValue: number;
  rewardCooldownUnit: RewardCooldownUnit;
  /** Min purchase condition (₹). Shown in onboarding. */
  minPurchaseAmount: number;
  stampNotifications: boolean;
  /** @deprecated Prefer role-based pending approval toggles. */
  approvalNotifications: boolean;
  /** Notify staff when a stamp stays pending > 3 hours. Default on. */
  notifyStaffPendingApprovals: boolean;
  /** Notify managers when a stamp stays pending > 6 hours. Default on. */
  notifyManagerPendingApprovals: boolean;
  /** Notify owners for pending-stamp escalations. Default off. */
  notifyOwnerPendingApprovals: boolean;
  /**
   * On a customer's birthday: send a notification that they can earn double
   * stamps, and award 2 stamps per visit that day. Default off.
   */
  birthdayDoubleStamps: boolean;
  marketingEmails: boolean;
  queueBanner?: string;
  queueBannerLink?: string;
  /** Local open time HH:MM for queue auto sessions. */
  queueOpenTime: string;
  /** Local close time HH:MM for queue auto sessions. */
  queueCloseTime: string;
  queueHoursTimezone: string;
  /** 0=Sun … 6=Sat. */
  queueOpenDays: number[];
  queueAutoStart: boolean;
  /** Recommended — end the live session at closing time. */
  queueAutoClose: boolean;
  /** Short line shown above the public reservation form. */
  reservationDescription: string;
  reservationMaxPartySize: number;
  /** Minutes between bookable slots (15 / 30 / 60). */
  reservationIntervalMinutes: number;
  reservationOpenTime: string;
  reservationCloseTime: string;
  reservationAllowSameDay: boolean;
  reservationAllowNotes: boolean;
  /** 0 = never auto decline (future automation). */
  reservationAutoDeclineHours: number;
  reservationWhatsappEnabled: boolean;
  /** Bookings stopped by the merchant — the public form is closed. */
  reservationPaused: boolean;
}

export interface MerchantStats {
  totalCustomers: number;
  activeCards: number;
  stampsToday: number;
  pendingApprovals: number;
  rewardsRedeemed: number;
  avgLifetimeVisits: number;
  weeklyVisits: number[];
}

export type DashboardDateRange = "today" | "7d" | "30d" | "12m" | "all";

export interface DashboardChartBucket {
  label: string;
  value: number;
}

export interface AnalyticsTopCustomer {
  id: string;
  name: string;
  stamps: number;
  totalStamps: number;
  lifetimeVisits: number;
  rewardsClaimed: number;
}

export interface AnalyticsFunnelStage {
  id: string;
  label: string;
  count: number;
  conversionFromPrevious: number | null;
}

export interface AnalyticsInsight {
  id: string;
  text: string;
}

export interface DashboardFilteredStats {
  range: DashboardDateRange;
  rangeLabel: string;
  totalCustomers: number;
  activeCustomers: number;
  activeCards: number;
  totalStampsAllTime: number;
  stampsInRange: number;
  stampsToday: number;
  stampsThisMonth: number;
  pendingApprovals: number;
  rewardsInRange: number;
  rewardsRedeemedAllTime: number;
  /**
   * True when merchant_loyalty_range_stats failed. Stamps-in-range,
   * rewards-in-range (non-all), and the chart must show an error — not zeros
   * or truncated fallbacks.
   */
  rangeStatsError: boolean;
  avgVisitsPerCustomer: number;
  avgStampsPerCustomer: number;
  customersNearReward: number;
  redemptionRate: number;
  avgDaysBetweenVisits: number | null;
  newCustomersInRange: number;
  returningCustomers: number;
  inactiveCustomers: number;
  repeatVisitRate: number;
  mostActiveDay: string | null;
  mostActiveHour: string | null;
  chartBuckets: DashboardChartBucket[];
  chartTitle: string;
  chartSub: string;
  topCustomers: AnalyticsTopCustomer[];
  funnel: AnalyticsFunnelStage[];
  insights: AnalyticsInsight[];
  hasActivity: boolean;
}

export interface MerchantCustomer {
  id: string;
  branchId?: string | null;
  name: string;
  phone: string;
  email?: string;
  stamps: number;
  totalStamps: number;
  lifetimeVisits: number;
  rewardsClaimed: number;
  status: "active" | "reward_ready" | "claimed";
  banned?: boolean;
  lastVisit: string;
  memberSince: string;
  /** Private merchant-only notes. Never shown to the guest. */
  merchantNotes: string;
}

export interface PendingApproval {
  id: string;
  customerId: string;
  customerName: string;
  phone: string;
  requestedAt: string;
  stampsBefore: number;
  totalStamps: number;
  branchId?: string | null;
  branchName?: string | null;
}

/** Per-user merchant notification centre item. */
export interface MerchantInAppNotification {
  id: string;
  title: string;
  message: string;
  actionLabel: string;
  actionHref: string;
  kind: string;
  escalationLevel: "3h" | "6h" | null;
  read: boolean;
  createdAt: string;
}

export interface RedeemRecord {
  id: string;
  customerName: string;
  code: string;
  redeemedAt: string;
}
