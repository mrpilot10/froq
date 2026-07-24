import type { RewardCooldownUnit } from "@/lib/loyalty/rules";

export type MerchantProduct = "loyalty" | "queue";

export type MemberRole = "owner" | "staff";

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
  email: string;
  role: MemberRole;
  /** empty = access to all branches. */
  branchIds: string[];
  /** false = invited but hasn't logged in yet. */
  joined: boolean;
}

/** Loyalty product-scoped tabs. */
export type LoyaltyTab = "dashboard" | "scan" | "approvals" | "loyalty-settings";

/** Queue product-scoped tabs. */
export type QueueTab = "queue-home" | "queue-history" | "queue-settings";

/** Workspace tabs shared across every product. */
export type WorkspaceTab = "customers" | "profile";

/** Every routable tab in the merchant app. */
export type MerchantTab = LoyaltyTab | QueueTab | WorkspaceTab;

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
  avgOrderValue: number;
  /** Default true. Not shown in onboarding. */
  restartAfterReward: boolean;
  rewardCooldownValue: number;
  rewardCooldownUnit: RewardCooldownUnit;
  /** Min purchase condition (₹). Shown in onboarding. */
  minPurchaseAmount: number;
  stampNotifications: boolean;
  approvalNotifications: boolean;
  marketingEmails: boolean;
  queueBanner?: string;
  queueBannerLink?: string;
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

export type DashboardDateRange = "today" | "7d" | "30d" | "all";

export interface DashboardChartBucket {
  label: string;
  value: number;
}

export interface DashboardFilteredStats {
  range: DashboardDateRange;
  rangeLabel: string;
  totalCustomers: number;
  activeCards: number;
  stampsInRange: number;
  pendingApprovals: number;
  rewardsInRange: number;
  rewardsRedeemedAllTime: number;
  avgLifetimeVisits: number;
  conversionRate: number;
  chartBuckets: DashboardChartBucket[];
  chartTitle: string;
  chartSub: string;
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
}

export interface PendingApproval {
  id: string;
  customerId: string;
  customerName: string;
  phone: string;
  requestedAt: string;
  stampsBefore: number;
  totalStamps: number;
}

export interface RedeemRecord {
  id: string;
  customerName: string;
  code: string;
  redeemedAt: string;
}
