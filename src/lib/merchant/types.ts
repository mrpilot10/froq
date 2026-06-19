export type MerchantTab = "dashboard" | "customers" | "scan" | "approvals" | "profile";

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
  shortName: string;
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
  totalStamps: number;
  avgOrderValue: number;
  stampNotifications: boolean;
  approvalNotifications: boolean;
  marketingEmails: boolean;
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

export interface MerchantCustomer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  stamps: number;
  totalStamps: number;
  lifetimeVisits: number;
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
